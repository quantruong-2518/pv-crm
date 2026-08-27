import { sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '../db/db.module'

/** THE OUTBOUND PACE, HELD WHERE EVERY WORKER CAN SEE THE SAME NUMBER.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS IS NOT A TOKEN BUCKET IN MEMORY
 *  ------------------------------------------------------------------
 *  Resend's limit is counted per TEAM. Three workers each holding their own
 *  bucket of `PV_EMAIL_RATE_PER_SECOND` spend three times the budget and are
 *  each individually convinced they are behaving. The counter has to be one
 *  number in one place, and the only place all three already share is the
 *  database.
 *
 *  So: a fixed one-second window advanced by a single
 *  `INSERT … ON CONFLICT DO UPDATE`, exactly the shape
 *  `sales.lead_intake_rate` uses on the intake door. Fixed rather than sliding
 *  because a sliding window needs a read, a decision and a write — three steps
 *  two workers can interleave — while a fixed window is one atomic statement
 *  that is either applied or not.
 *
 *  ------------------------------------------------------------------
 *  EVERY DEADLINE IS COMPUTED IN THE DATABASE
 *  ------------------------------------------------------------------
 *  `now()` here is Postgres time; `Date.now()` in the worker is the machine's.
 *  Subtracting one from the other is how a limiter starts granting early on a
 *  host whose clock drifts. Every method below returns a DURATION the database
 *  worked out from its own clock, never a timestamp for Node to compare. */
@Injectable()
export class MailRateGate {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Spend one token. Returns 0 when granted, otherwise the milliseconds left
   *  in the current window.
   *
   *  The count is incremented even when the answer is no. That looks wasteful
   *  and is on purpose: refusing without writing would need a read-then-write,
   *  and the window resets on time regardless of how high the count climbed,
   *  so an over-counted window self-heals within one second. */
  async take(key: string, perSecond: number): Promise<number> {
    const result = (await this.db.execute(sql`
      INSERT INTO "platform"."mail_gate" (
        "key", "window_started_at", "window_count", "updated_at"
      ) VALUES (
        ${key}, now(), 1, now()
      )
      ON CONFLICT ("key") DO UPDATE SET
        "window_count" = CASE
          WHEN "mail_gate"."window_started_at" <= now() - interval '1 second' THEN 1
          ELSE "mail_gate"."window_count" + 1
        END,
        "window_started_at" = CASE
          WHEN "mail_gate"."window_started_at" <= now() - interval '1 second' THEN now()
          ELSE "mail_gate"."window_started_at"
        END,
        "updated_at" = now()
      RETURNING
        "window_count" AS "count",
        GREATEST(
          0,
          EXTRACT(EPOCH FROM ("window_started_at" + interval '1 second' - now())) * 1000
        )::float8 AS "wait_ms"
    `)) as { rows: { count: number; wait_ms: number | string }[] }

    const row = result.rows[0]
    if (!row) return 0
    if (Number(row.count) <= perSecond) return 0
    return Math.max(1, Math.ceil(Number(row.wait_ms)))
  }

  /** Milliseconds until the gate reopens; 0 when it is open.
   *
   *  A plain read, deliberately: this runs before every send and must not cost
   *  a write on the happy path. */
  async parkedFor(key: string): Promise<number> {
    const result = (await this.db.execute(sql`
      SELECT
        (EXTRACT(EPOCH FROM ("parked_until" - now())) * 1000)::float8 AS "wait_ms",
        "parked_reason" AS "reason"
      FROM "platform"."mail_gate"
      WHERE "key" = ${key} AND "parked_until" > now()
    `)) as { rows: { wait_ms: number | string }[] }

    const row = result.rows[0]
    if (!row) return 0
    return Math.max(1, Math.ceil(Number(row.wait_ms)))
  }

  /** Close the gate for everyone until `seconds` from now.
   *
   *  This is the difference between backing off and pretending to. A 429 that
   *  only delays the one job that saw it leaves nine other workers hammering
   *  the same limit; the provider's answer was about the account, so the
   *  account is what has to stop.
   *
   *  Never shortens an existing park: two workers can each catch a 429 with
   *  different `Retry-After` values, and the longer one is the one the
   *  provider meant. */
  async park(key: string, seconds: number, reason: string): Promise<void> {
    const bounded = Math.max(1, Math.ceil(seconds))
    await this.db.execute(sql`
      INSERT INTO "platform"."mail_gate" (
        "key", "window_started_at", "window_count",
        "parked_until", "parked_reason", "updated_at"
      ) VALUES (
        ${key}, now(), 1,
        now() + (${bounded} * interval '1 second'), ${reason}, now()
      )
      ON CONFLICT ("key") DO UPDATE SET
        "parked_until" = GREATEST(
          COALESCE("mail_gate"."parked_until", now()),
          now() + (${bounded} * interval '1 second')
        ),
        "parked_reason" = EXCLUDED."parked_reason",
        "updated_at" = now()
    `)
  }
}

/** Spend a token, waiting out at most one window before giving up.
 *
 *  Without the wait, a burst of leads arriving in the same second would each
 *  bounce off the limiter into a pg-boss retry — and a retry costs one of the
 *  eight attempts a delivery is allowed, plus five seconds of backoff, to
 *  avoid a pause of under a second. Waiting once in-process is far cheaper
 *  than that, and stays an order of magnitude below the queue's
 *  `expireInSeconds`, so the handler never risks being declared dead over it.
 *
 *  Only genuinely saturated windows fall through to `false`, which is the case
 *  where backing all the way off is the right answer.
 *
 *  `signal` is the job's own: pg-boss aborts it when the job is close to
 *  expiring, and a wait that outlives its job is a wait nobody will use. */
export async function acquireToken(
  gate: MailRateGate,
  key: string,
  perSecond: number,
  signal: AbortSignal,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal.aborted) return false
    const waitMs = await gate.take(key, perSecond)
    if (waitMs === 0) return true
    if (attempt === 1 || waitMs > 1_000) return false
    await delay(waitMs, signal)
  }
  return false
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })

    function finish(): void {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
  })
}
