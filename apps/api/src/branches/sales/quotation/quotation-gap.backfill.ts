import { sql } from 'drizzle-orm'
import { loadEnv } from '@api/platform/config/env'
import { createDb } from '@api/platform/db/create-db'

/** One-off, run once AFTER the deploy that follows migration 0104 (ADR 0090):
 *  ledger the `quotation-sent` touches the OLD build wrote between migrate and
 *  deploy. Each becomes round 1 of the deal's NEXT kind-less negotiation,
 *  `pending`, exactly where a mail-made round lands — nobody can say which
 *  older round it revised, so it closes none.
 *
 *  INSERT ONLY: no existing ledger row is read for anything but its number.
 *  Idempotent: a touch already in the ledger is skipped, so a second run
 *  reports zero. Preview unless `--apply`. Delete once it has run everywhere.
 *
 *      pnpm --filter @pv/api db:backfill:quotation-gap             # dry run
 *      pnpm --filter @pv/api db:backfill:quotation-gap --apply     # write */

const APPLY = process.argv.includes('--apply')
const say = (line: string): void => void process.stdout.write(`${line}\n`)

/** Touches with no ledger row. Numbered past the deal's highest kind-less
 *  negotiation in `at` order, so several on one deal never share a number and
 *  neither `quotation_round_uq` nor `quotation_one_pending_uq` can refuse. */
const GAP = sql`
  SELECT t."id", t."at", t."actor_id", t."subject_code" AS "opp",
         coalesce((SELECT max(q."negotiation_no") FROM "sales"."quotation" q
                    WHERE q."opportunity_code" = t."subject_code" AND q."kind" IS NULL), 0)
         + (row_number() OVER (PARTITION BY t."subject_code" ORDER BY t."at", t."id"))::int AS "neg"
    FROM "sales"."touch" t
    JOIN "sales"."opportunity" o ON o."code" = t."subject_code"
   WHERE t."kind" = 'quotation-sent' AND t."subject_kind" = 'opportunity'
     AND NOT EXISTS (SELECT 1 FROM "sales"."quotation" q WHERE q."touch_id" = t."id")`

type Row = { opp: string; neg: number; at: string }

async function main(): Promise<void> {
  const { db, close, kind } = await createDb(loadEnv().DATABASE_URL)
  say(`Target: ${kind} · ${APPLY ? 'APPLY (writing)' : 'preview'}`)
  try {
    const found = (await (APPLY
      ? db.transaction(async (tx) => {
          /* The live service numbers rounds under this same row lock (`lockDeal`);
             taking it first keeps a concurrent write from claiming our number. */
          await tx.execute(sql`
            SELECT o."code" FROM "sales"."opportunity" o
             WHERE o."code" IN (SELECT g."opp" FROM (${GAP}) g)
             ORDER BY o."code" FOR UPDATE`)
          return tx.execute(sql`
            INSERT INTO "sales"."quotation"
              ("opportunity_code", "negotiation_no", "round_no", "sent_at", "source",
               "outcome", "touch_id", "created_by")
            SELECT g."opp", g."neg", 1, g."at", 'backfill', 'pending', g."id", g."actor_id"
              FROM (${GAP}) g
             ORDER BY g."opp", g."neg"
            ON CONFLICT DO NOTHING
            RETURNING "opportunity_code" AS "opp", "negotiation_no" AS "neg", "sent_at" AS "at"`)
        })
      : db.execute(sql`SELECT g."opp", g."neg", g."at" FROM (${GAP}) g ORDER BY 1, 2`))) as {
      rows: Row[]
    }
    const rows = found.rows
    for (const r of rows) say(`  ${r.opp} · kind-less negotiation ${r.neg} · sent ${String(r.at)}`)
    say(`sales.quotation  ${rows.length} row(s) ${APPLY ? 'inserted' : 'to insert'}`)
    if (!APPLY) say('Nothing written. Add --apply to write.')
  } finally {
    await close()
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  )
  process.exitCode = 1
})
