import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { MailRunListQuery, MailRunListResponse, MailRunState } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { contains } from '@api/platform/db/like'
import { MAIL_STATE_RANK, MAIL_STATES, type MailState } from './mail.contract'
import { mailRun, type MailRunRow } from './mail-run.schema'

/** What it takes to open one batch. Every field is decided by the caller —
 *  this repository decides nothing, per `apps/api/CLAUDE.md`.
 *
 *  `fromAddress`/`replyTo` are values, not lookups: the run SNAPSHOTS the
 *  address it was reviewed under (see `mail_run.from_address`), so reading them
 *  out of `Env` down here would quietly re-resolve them at send time and defeat
 *  the snapshot. The service that mints the run reads `PV_EMAIL_MAS_FROM`.
 *
 *  `cta` is one optional pair rather than two optional columns, because the
 *  table's CHECK (`mail_run_cta_pair`) accepts both or neither — a shape that
 *  can express "label without url" is a shape that reaches Postgres and fails
 *  there instead of at the call site. */
export type MailRunCreate = {
  label: string
  templateCode?: string | null
  subject: string
  body: string
  cta?: { label: string; url: string } | null
  fromAddress: string
  replyTo?: string | null
  state: MailRunState
  scheduledAt?: Date | null
  audienceCount: number
  createdBy: string
}

/** THE COUNTERS ARE COUNTED, NEVER STORED — and this is where the counting
 *  rule is written down once.
 *
 *  ------------------------------------------------------------------
 *  WHY `sent` IS NOT SIMPLY `rank >= accepted`
 *  ------------------------------------------------------------------
 *  `MAIL_STATE_RANK` orders the ladder by how far a letter has got, and
 *  everything from `accepted` upward has indeed got past the point where the
 *  provider took it — EXCEPT three terminal states that were never posted at
 *  all. They share rank 5/6 with `bounced` because none of them may overwrite
 *  another, not because they mean the same thing:
 *
 *   · `suppressed`       the address was blocked when its turn came; the worker
 *                        deliberately withheld the letter (`mail.consumer.ts`
 *                        step 3). Nothing left this machine.
 *   · `failed_permanent` the provider refused it.
 *   · `dead`             retries ran out and a person owns it now.
 *
 *  Counting those as `sent` would print a run that posted nothing as a run that
 *  posted everything, and `MailRunRow` keeps `suppressed` and `failed` as
 *  separate numbers precisely so that difference stays visible. So the rank is
 *  read as instructed, and the three exceptions are named — a state added to
 *  the ladder later lands in `sent` by default, which is the safe direction:
 *  wrong in a way somebody notices, rather than silently dropped. */
const NEVER_LEFT: Partial<Record<MailState, true>> = {
  suppressed: true,
  failed_permanent: true,
  dead: true,
}

const SENT_STATES = MAIL_STATES.filter(
  (s) => MAIL_STATE_RANK[s] >= MAIL_STATE_RANK.accepted && !NEVER_LEFT[s],
)

/** Rows that are still owed an attempt. `sweepStates()` reads this to decide a
 *  run has finished, and `pending`/`sending`/`delayed` is the complete list:
 *  `pending` is waiting, `sending` is in a worker's hands, `delayed` is the
 *  provider asking for more time. Everything else is terminal. */
const INFLIGHT_STATES = ['pending', 'sending', 'delayed'] as const satisfies readonly MailState[]

const FAILED_STATES = ['failed_permanent', 'dead'] as const satisfies readonly MailState[]

/** Run states a person may still stop. The other two are terminal: a `SENT`
 *  run has nothing left to withhold, and cancelling a `CANCELLED` one would
 *  rewrite `finished_at` — moving the moment a batch was stopped every time
 *  somebody clicks the button again. `satisfies` so a state renamed in the
 *  contract fails here rather than silently dropping out of the list. */
const CANCELLABLE_STATES = [
  'DRAFT',
  'SCHEDULED',
  'SENDING',
] as const satisfies readonly MailRunState[]

/** A value list for `IN (…)`, as BIND PARAMETERS.
 *
 *  Opposite call to the one `MAIL_STATE_LIST` makes in `mail.schema.ts`: that
 *  one is DDL written into a migration file, where a `$1` has nothing to
 *  substitute it. This runs as an ordinary query, so the states travel as
 *  parameters and never as interpolated text. */
const params = (values: readonly string[]): SQL =>
  sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )

/** One row of the aggregate pass over `email_delivery`. */
type DeliveryCounts = {
  run_id: string
  sent: number
  delivered: number
  bounced: number
  /** Pressed "this is spam". Counted separately from every other number here
   *  because a complaint is invisible in all of them: the letter left and did
   *  arrive, so it sits inside `sent` and inside `delivered`, and without its
   *  own column the run that is destroying the sending domain looks exactly
   *  like the run that went perfectly. Resend terminates above 0.08% and does
   *  it at ACCOUNT level — see `MailRunRow.complained`. */
  complained: number
  failed: number
  suppressed: number
}

/** One run the bounce breaker stopped, and the three numbers that explain why.
 *
 *  `run_id` and counts only — no address, ever. The whole point of the breaker
 *  is a bad LIST, so its report is the one place a mailing list would be most
 *  tempting and most damaging to print. */
export type BounceTrip = {
  run_id: string
  /** Letters that actually left, i.e. the denominator of the rate. */
  sent: number
  bounced: number
  /** `pending` rows this pass killed — letters that will now never leave. */
  held: number
}

/** One row of the aggregate pass over `mail_event`. */
type EngagementCounts = {
  run_id: string
  opened: number
  clicked: number
  unsubscribed: number
}

/** Hai bảng đếm ở trên, gộp thành một dòng — thứ `tallies()` trả về.
 *
 *  KHÔNG mang `run_id`: người gọi nhận về một `Map` keyed sẵn theo id, nên một
 *  trường id thứ hai bên trong giá trị chỉ là chỗ để hai cái id lệch nhau. */
export type RunTally = {
  sent: number
  delivered: number
  bounced: number
  failed: number
  suppressed: number
  complained: number
  opened: number
  clicked: number
  unsubscribed: number
}

/** ONE BATCH OF MAIL, AS SQL. Platform only — there is no campaign in this file.
 *
 *  `sales.campaign_run` is the row that joins a batch to a campaign, and it
 *  lives in the Sales branch pointing THIS way. A join from here would invert
 *  the one dependency this codebase enforces hardest; see the long note on
 *  `mailRun` in `mail-run.schema.ts`. The consequence for `list()` is spelled
 *  out on that method: the campaign filter cannot be applied here and has to
 *  arrive already resolved. */
@Injectable()
export class MailRunRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** `tx`, never `this.db`: a run and the N delivery rows it groups are one
   *  promise, and a run that survives a rollback its letters did not is a batch
   *  nobody will ever be able to explain. */
  async create(tx: Db, input: MailRunCreate): Promise<string> {
    const [row] = await tx
      .insert(mailRun)
      .values({
        label: input.label,
        templateCode: input.templateCode ?? null,
        subject: input.subject,
        body: input.body,
        ctaLabel: input.cta?.label ?? null,
        ctaUrl: input.cta?.url ?? null,
        fromAddress: input.fromAddress,
        replyTo: input.replyTo ?? null,
        state: input.state,
        scheduledAt: input.scheduledAt ?? null,
        audienceCount: input.audienceCount,
        createdBy: input.createdBy,
      })
      .returning({ id: mailRun.id })

    /* An insert with no `ON CONFLICT` either returns its row or throws. An
       empty result here would mean the driver lost it, which is not a case to
       paper over with a made-up id. */
    if (!row) throw new Error('Không tạo được mail_run — insert không trả về dòng nào.')
    return row.id
  }

  async byId(id: string): Promise<MailRunRow | null> {
    const [row] = await this.db.select().from(mailRun).where(eq(mailRun.id, id)).limit(1)
    return row ?? null
  }

  /** The run list, with every counter aggregated from the ledger.
   *
   *  ------------------------------------------------------------------
   *  `query.campaign` CANNOT BE ANSWERED HERE, AND SAYS SO OUT LOUD
   *  ------------------------------------------------------------------
   *  The filter needs `sales.campaign_run`, which `platform/` may not read. So
   *  the Sales service resolves the campaign to its run ids and passes them as
   *  `onlyIds`; this method refuses the combination rather than quietly
   *  returning every run in the system to a screen that asked for one
   *  campaign's. A silently ignored filter is the failure mode worth spending
   *  a throw on — it looks like data, not like a bug.
   *
   *  `onlyIds: []` is a legitimate answer meaning "that campaign has no runs",
   *  and it produces an empty page rather than an unfiltered one.
   *
   *  ------------------------------------------------------------------
   *  THREE QUERIES, NOT ONE JOIN
   *  ------------------------------------------------------------------
   *  The page is selected first, and the two aggregate passes then run against
   *  ONLY the ids on that page. Joining the aggregates into the page query
   *  instead would make every list call scan the whole ledger to compute
   *  numbers for rows it is about to discard by `LIMIT`. The two passes are
   *  also kept apart from each other on purpose: `mail_event` is many rows per
   *  delivery, so folding it into the delivery aggregate would multiply every
   *  delivery by its events and inflate `sent`.
   *
   *  `hidden` is always 0. It is the count of rows the permission axis cut
   *  (luật 7), and permissions are not a platform-repository decision — the
   *  Sales service that owns the endpoint fills it if its axis cuts anything. */
  async list(query: MailRunListQuery, onlyIds?: readonly string[]): Promise<MailRunListResponse> {
    if (query.campaign !== undefined && onlyIds === undefined) {
      throw new Error(
        'Lọc theo chiến dịch phải được nhánh Sales giải sẵn thành danh sách id lô gửi — ' +
          'platform.mail_run không đọc được sales.campaign_run.',
      )
    }

    const where = and(
      query.state ? eq(mailRun.state, query.state) : undefined,
      query.q
        ? or(ilike(mailRun.label, contains(query.q)), ilike(mailRun.subject, contains(query.q)))
        : undefined,
      onlyIds ? (onlyIds.length > 0 ? inArray(mailRun.id, [...onlyIds]) : sql`false`) : undefined,
    )

    const [totals] = await this.db.select({ n: count() }).from(mailRun).where(where)
    const total = totals?.n ?? 0

    const rows = await this.db
      .select()
      .from(mailRun)
      .where(where)
      .orderBy(...this.orderBy(query))
      .limit(query.size)
      .offset((query.page - 1) * query.size)

    const ids = rows.map((r) => r.id)
    const [deliveries, engagement] = await Promise.all([
      this.deliveryCounts(ids),
      this.engagementCounts(ids),
    ])

    return {
      total,
      hidden: 0,
      rows: rows.map((row) => {
        const d = deliveries.get(row.id)
        const e = engagement.get(row.id)
        return {
          id: row.id,
          label: row.label,
          templateCode: row.templateCode ?? undefined,
          subject: row.subject,
          state: row.state,
          scheduledAt: iso(row.scheduledAt),
          startedAt: iso(row.startedAt),
          finishedAt: iso(row.finishedAt),
          audienceCount: row.audienceCount,
          sent: d?.sent ?? 0,
          delivered: d?.delivered ?? 0,
          opened: e?.opened ?? 0,
          clicked: e?.clicked ?? 0,
          bounced: d?.bounced ?? 0,
          complained: d?.complained ?? 0,
          failed: d?.failed ?? 0,
          suppressed: d?.suppressed ?? 0,
          unsubscribed: e?.unsubscribed ?? 0,
          createdAt: row.createdAt.toISOString(),
        }
      }),
    }
  }

  /** STOP ONE BATCH BY HAND — the human half of what `tripBounced` does by
   *  itself, and the only way `CANCELLED` is reachable from a request.
   *
   *  ------------------------------------------------------------------
   *  CANCELLING A RUN IS TWO WRITES, AND ONLY ONE OF THEM IS THE COLUMN
   *  ------------------------------------------------------------------
   *  Flipping `state` alone changes a word on a screen and nothing else: the
   *  relay walks `email_delivery`, not `mail_run`, so two hundred `pending`
   *  rows would keep being handed to the provider under a batch labelled
   *  "Đã huỷ". The rows have to die in the same breath, exactly as the bounce
   *  breaker kills them, and for the same reason they become `dead` rather than
   *  `suppressed`: nothing is wrong with these addresses, the decision was on
   *  this side of the wire. `dead` is in `NEVER_LEFT`, so a cancelled run can
   *  never count them as `sent`.
   *
   *  `pending` only — the same three-way split the breaker states. A row
   *  already `sending` is in a worker's hands and past recall; `delayed` is the
   *  provider asking for more time on a letter it has accepted. Neither is
   *  still on this machine, so neither is this method's to stop, and a cancel
   *  that claimed otherwise would be a cancel somebody trusted.
   *
   *  ------------------------------------------------------------------
   *  `started_at` IS LEFT ALONE, WHICH IS WHERE THIS DIFFERS FROM THE BREAKER
   *  ------------------------------------------------------------------
   *  `tripBounced` writes `COALESCE(started_at, now())` because it only ever
   *  fires on runs that are already `SENDING` — a run whose letters bounced has
   *  by definition started. This door also accepts `SCHEDULED` and `DRAFT`, and
   *  stamping `started_at` on a batch cancelled the night before it was due
   *  would erase the one field that distinguishes "will fire at 9am" from
   *  "fired at 9am" (`MailRunRow.startedAt`). `finished_at` IS set in every
   *  case, because it means "no attempt is outstanding" and that is now true.
   *
   *  Returns `null` when no row moved — either there is no such run, or it is
   *  already `SENT`/`CANCELLED`. The service turns the first into a 404 and the
   *  second into an idempotent answer; this method deliberately cannot tell
   *  them apart in one statement and does not pretend to. */
  async cancel(handle: Db, id: string): Promise<{ held: number } | null> {
    const r = (await handle.execute(sql`
      WITH stopped AS (
        UPDATE "platform"."mail_run" r
           SET "state" = 'CANCELLED',
               "finished_at" = now(),
               "updated_at" = now()
         WHERE r."id" = ${id}::uuid
           AND r."state" IN (${params(CANCELLABLE_STATES)})
        RETURNING r."id"
      ),
      held AS (
        UPDATE "platform"."email_delivery" d
           SET "state" = 'dead',
               "next_attempt_at" = NULL,
               "last_error_code" = 'mas-cancelled',
               "last_error_summary" = 'lô bị huỷ bằng tay: thư chưa gửi đã bị giữ lại',
               "updated_at" = now()
         WHERE d."state" = 'pending'
           AND d."mail_run_id" IN (SELECT "id" FROM stopped)
        RETURNING d."id"
      )
      SELECT (SELECT count(*) FROM stopped)::int AS runs,
             (SELECT count(*) FROM held)::int    AS held
    `)) as { rows: { runs: number; held: number }[] }

    const row = r.rows[0]
    return row && row.runs > 0 ? { held: row.held } : null
  }

  /** Move runs to the state their own letters have already reached.
   *
   *  ------------------------------------------------------------------
   *  TWO STATEMENTS, EACH ONE A COMPLETE TRANSITION
   *  ------------------------------------------------------------------
   *  Neither pass reads rows into Node and writes them back: a run's state is
   *  decided entirely by a predicate over `email_delivery`, so the whole
   *  decision fits in the WHERE clause and Postgres evaluates it against the
   *  rows as they are at that instant. Doing it in two round trips — select
   *  the due runs, then update them — leaves a window in which a letter can
   *  leave between the read and the write, and the run is marked finished with
   *  a delivery still in flight.
   *
   *  SCHEDULED → SENDING needs BOTH conditions. The clock alone is not enough:
   *  a batch whose hour has come but whose first letter has not been accepted
   *  yet has not started sending, and `started_at` is what the run list uses to
   *  tell "will fire at 9am" from "fired at 9am and is still going".
   *
   *  SENDING → SENT is the absence of work, not the presence of success: a run
   *  whose letters all bounced is finished, and so is one whose recipients were
   *  every one of them suppressed. `finished_at` means "no attempt is
   *  outstanding", not "it went well" — the counters say how it went.
   *
   *  `started_at` is written with COALESCE in both passes so a run that was
   *  created straight into SENDING (an immediate send) keeps the moment its
   *  service stamped, and one that never got a stamp still gets a plausible
   *  one rather than a NULL under a `finished_at`.
   *
   *  Returns how many runs moved, summed over both passes. */
  async sweepStates(): Promise<number> {
    const started = (await this.db.execute(sql`
      UPDATE "platform"."mail_run" AS r
         SET "state" = 'SENDING',
             "started_at" = COALESCE(r."started_at", now()),
             "updated_at" = now()
       WHERE r."state" = 'SCHEDULED'
         AND r."scheduled_at" IS NOT NULL
         AND r."scheduled_at" <= now()
         AND EXISTS (
               SELECT 1 FROM "platform"."email_delivery" d
                WHERE d."mail_run_id" = r."id"
                  AND d."state" IN (${params(SENT_STATES)})
             )
      RETURNING r."id"
    `)) as { rows: unknown[] }

    const finished = (await this.db.execute(sql`
      UPDATE "platform"."mail_run" AS r
         SET "state" = 'SENT',
             "started_at" = COALESCE(r."started_at", now()),
             "finished_at" = now(),
             "updated_at" = now()
       WHERE r."state" = 'SENDING'
         AND NOT EXISTS (
               SELECT 1 FROM "platform"."email_delivery" d
                WHERE d."mail_run_id" = r."id"
                  AND d."state" IN (${params(INFLIGHT_STATES)})
             )
      RETURNING r."id"
    `)) as { rows: unknown[] }

    return started.rows.length + finished.rows.length
  }

  /** THE BOUNCE BREAKER, AS ONE STATEMENT. Cancels a run its own numbers have
   *  already condemned, and kills the letters it had not posted yet.
   *
   *  ------------------------------------------------------------------
   *  WHAT IT DECIDES, AND WHAT IT REFUSES TO DECIDE
   *  ------------------------------------------------------------------
   *  Both thresholds arrive as arguments. This repository holds no opinion
   *  about 4% or about 20 rows — those are `PV_MAS_BOUNCE_CEILING_PERCENT` and
   *  `PV_MAS_BOUNCE_MIN_SAMPLE`, read by the caller, exactly as `create()`
   *  takes `fromAddress` rather than reaching into `Env` for it.
   *
   *  ------------------------------------------------------------------
   *  ONE STATEMENT, NOT SELECT-THEN-UPDATE
   *  ------------------------------------------------------------------
   *  Same argument as `sweepStates()` and it is sharper here: between a read
   *  and a write, the relay can hand another twenty `pending` rows to the
   *  provider — and those are precisely the letters this method exists to stop.
   *  The three data-modifying CTEs below all read `tripped`, which is evaluated
   *  once against one snapshot, so the run and its unposted rows change
   *  together or not at all. (`stopped` is deliberately not referenced by the
   *  final SELECT: a data-modifying CTE runs to completion whether or not the
   *  primary query reads it.)
   *
   *  ------------------------------------------------------------------
   *  WHY THE HELD ROWS BECOME `dead` AND NOT `suppressed`
   *  ------------------------------------------------------------------
   *  `suppressed` means the ADDRESS was blocked when its turn came — a fact
   *  about the recipient, and the number `MailRunRow.suppressed` exists to
   *  report list decay. Nothing is wrong with these addresses; what stopped
   *  them is a decision on THIS side of the wire. `dead` is the state for "no
   *  further attempt is coming and a person owns it now", it is in `NEVER_LEFT`
   *  so it can never be counted as `sent`, and it lands in `MailRunRow.failed`
   *  — "look at the pipe", which is the correct next action. `next_attempt_at`
   *  is cleared so nothing about the row still reads as scheduled.
   *
   *  `pending` only. A row already `sending` is in a worker's hands and past
   *  recall, and `delayed` is the provider asking for more time on a letter it
   *  has already accepted — neither is still on this machine, so neither is
   *  this method's to stop.
   *
   *  Returns one entry per run it tripped, WITHOUT any recipient address: the
   *  caller logs this, and a mailing list must not enter the log stream one
   *  line at a time. */
  async tripBounced(opts: { ceilingPercent: number; minSample: number }): Promise<BounceTrip[]> {
    const r = (await this.db.execute(sql`
      WITH stats AS (
        SELECT d."mail_run_id" AS run_id,
               count(*) FILTER (WHERE d."state" IN (${params(SENT_STATES)}))::int AS sent,
               count(*) FILTER (WHERE d."state" = 'bounced')::int                  AS bounced
          FROM "platform"."email_delivery" d
         WHERE d."mail_run_id" IS NOT NULL
         GROUP BY d."mail_run_id"
      ),
      tripped AS (
        SELECT s.run_id, s.sent, s.bounced
          FROM stats s
          JOIN "platform"."mail_run" r ON r."id" = s.run_id
         WHERE r."state" = 'SENDING'
           AND s.sent >= ${opts.minSample}::int
           AND s.bounced * 100.0 > ${opts.ceilingPercent}::float8 * s.sent
      ),
      held AS (
        UPDATE "platform"."email_delivery" d
           SET "state" = 'dead',
               "next_attempt_at" = NULL,
               "last_error_code" = 'mas-bounce-ceiling',
               "last_error_summary" = 'lô bị cầu dao dừng: tỉ lệ bounce vượt trần',
               "updated_at" = now()
         WHERE d."state" = 'pending'
           AND d."mail_run_id" IN (SELECT run_id FROM tripped)
        RETURNING d."mail_run_id" AS run_id
      ),
      stopped AS (
        UPDATE "platform"."mail_run" r
           SET "state" = 'CANCELLED',
               "started_at" = COALESCE(r."started_at", now()),
               "finished_at" = now(),
               "updated_at" = now()
         WHERE r."id" IN (SELECT run_id FROM tripped)
        RETURNING r."id"
      ),
      held_per_run AS (
        SELECT run_id, count(*)::int AS held FROM held GROUP BY run_id
      )
      SELECT t.run_id, t.sent, t.bounced, COALESCE(h.held, 0)::int AS held
        FROM tripped t
        LEFT JOIN held_per_run h ON h.run_id = t.run_id
    `)) as { rows: BounceTrip[] }

    return r.rows
  }

  /** `sent`/`delivered`/`bounced`/`failed`/`suppressed` for the ids on this
   *  page — one scan, five `FILTER`s, the same trick `queueHealth()` uses.
   *
   *  `Db` is driver-agnostic, so `execute()` cannot know the result shape:
   *  node-postgres returns `QueryResult`, PGlite returns `Results`. Both carry
   *  `.rows` — the same hand-written cast `graph.repository.ts` explains. */
  private async deliveryCounts(ids: string[]): Promise<Map<string, DeliveryCounts>> {
    if (ids.length === 0) return new Map()

    const r = (await this.db.execute(sql`
      SELECT d."mail_run_id" AS run_id,
             count(*) FILTER (WHERE d."state" IN (${params(SENT_STATES)}))::int       AS sent,
             count(*) FILTER (WHERE d."state" = 'delivered')::int                     AS delivered,
             count(*) FILTER (WHERE d."state" = 'bounced')::int                       AS bounced,
             count(*) FILTER (WHERE d."state" = 'complained')::int                    AS complained,
             count(*) FILTER (WHERE d."state" IN (${params(FAILED_STATES)}))::int      AS failed,
             count(*) FILTER (WHERE d."state" = 'suppressed')::int                    AS suppressed
        FROM "platform"."email_delivery" d
       WHERE d."mail_run_id" IN (${params(ids)})
       GROUP BY d."mail_run_id"
    `)) as { rows: DeliveryCounts[] }

    return new Map(r.rows.map((row) => [row.run_id, row]))
  }

  /** Số đếm của N lô, cho người gọi KHÔNG đi qua `list()`.
   *
   *  Module 1 vẽ chuỗi đợt của một nguồn: nó đã có sẵn danh sách id lô (đi từ
   *  `sales.campaign_run`), nên `list()` — thứ tự phân trang, tự sắp, tự đếm
   *  tổng — trả lời sai câu hỏi và tính thừa hai lượt quét. Cái nó cần là đúng
   *  phần cộng số.
   *
   *  Mở ra thay vì để nhánh Sales tự viết lại hai câu `count(*) FILTER`: hai
   *  bản chép của cùng một phép đếm sẽ lệch nhau ở đúng chỗ khó thấy nhất —
   *  `opened` đếm theo NGƯỜI (`count(DISTINCT delivery_id)`) chứ không theo
   *  lần mở, và một bản chép quên `DISTINCT` cho ra tỉ lệ mở trên 100%. Vẫn là
   *  đường một chiều: nhánh gọi platform, platform không biết nhánh nào gọi. */
  async tallies(ids: readonly string[]): Promise<Map<string, RunTally>> {
    const list = [...ids]
    const [deliveries, engagement] = await Promise.all([
      this.deliveryCounts(list),
      this.engagementCounts(list),
    ])
    return new Map(
      list.map((id) => {
        const d = deliveries.get(id)
        const e = engagement.get(id)
        return [
          id,
          {
            sent: d?.sent ?? 0,
            delivered: d?.delivered ?? 0,
            bounced: d?.bounced ?? 0,
            failed: d?.failed ?? 0,
            suppressed: d?.suppressed ?? 0,
            complained: d?.complained ?? 0,
            opened: e?.opened ?? 0,
            clicked: e?.clicked ?? 0,
            unsubscribed: e?.unsubscribed ?? 0,
          },
        ]
      }),
    )
  }

  /** `opened`/`clicked`/`unsubscribed`, counted as PEOPLE and not as events.
   *
   *  `count(DISTINCT delivery_id)` rather than `count(*)`, because these
   *  numbers sit beside `sent` and `delivered` on the run list and a reader
   *  compares them: one recipient opening a mail six times must not read as six
   *  of the audience. The per-lead figure — how many times THIS person opened
   *  it — is a different question, answered by `LeadMailTimelineRow.openCount`
   *  off the same table.
   *
   *  Read `mail_event`'s own docblock before putting `opened` next to a percent
   *  sign: it is a noisy floor, not a measurement. */
  private async engagementCounts(ids: string[]): Promise<Map<string, EngagementCounts>> {
    if (ids.length === 0) return new Map()

    const r = (await this.db.execute(sql`
      SELECT d."mail_run_id" AS run_id,
             count(DISTINCT e."delivery_id") FILTER (WHERE e."kind" = 'OPEN')::int        AS opened,
             count(DISTINCT e."delivery_id") FILTER (WHERE e."kind" = 'CLICK')::int       AS clicked,
             count(DISTINCT e."delivery_id") FILTER (WHERE e."kind" = 'UNSUBSCRIBE')::int AS unsubscribed
        FROM "platform"."mail_event" e
        JOIN "platform"."email_delivery" d ON d."id" = e."delivery_id"
       WHERE d."mail_run_id" IN (${params(ids)})
       GROUP BY d."mail_run_id"
    `)) as { rows: EngagementCounts[] }

    return new Map(r.rows.map((row) => [row.run_id, row]))
  }

  /** `id` is appended to every order for the same reason `lead.repository.ts`
   *  appends `code`: two runs created in the same millisecond tie, and a tie
   *  with no final key lets Postgres hand back a different order per call —
   *  which puts one row on page 1 and page 2, or on neither. */
  private orderBy(query: MailRunListQuery): SQL[] {
    const dir = query.dir === 'asc' ? asc : desc
    const primary = query.sort === 'audienceCount' ? mailRun.audienceCount : mailRun.createdAt
    return [dir(primary), dir(mailRun.id)]
  }
}

/** `Moc` on the wire is an ISO 8601 string with an offset; the driver hands
 *  back a `Date`. Absent stays absent — `undefined`, not the epoch. */
function iso(at: Date | null): string | undefined {
  return at ? at.toISOString() : undefined
}
