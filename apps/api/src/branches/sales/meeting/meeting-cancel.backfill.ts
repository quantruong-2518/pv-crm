import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { sql } from 'drizzle-orm'
import type { MeetingCancelCause } from '@pv/contracts'
import { ConfigModule } from '@api/platform/config/config.module'
import type { DbHandle } from '@api/platform/db/create-db'
import { DB, DB_HANDLE, DbModule, type Db } from '@api/platform/db/db.module'
import { MeetingCancel } from './meeting-cancel'
import { MeetingModule } from './meeting.module'
import type { MeetingRowDb } from './meeting.schema'

/** One-off: future meetings of subjects that closed BEFORE the doors began
 *  cancelling (deal lost, lead stopped, lead switched off) get the same soft
 *  cancel, through `MeetingCancel.cancelFor` — no bell, the closer is long gone.
 *  Then their Google events are removed, as the doors do after commit.
 *
 *  Idempotent: `cancelUpcoming` only takes rows still uncancelled, so a second
 *  run reports zero. Preview unless `--apply`. Delete once it has run everywhere.
 *
 *      pnpm --filter @pv/api db:backfill:meeting-cancel            # dry run
 *      pnpm --filter @pv/api db:backfill:meeting-cancel --apply    # write */

const APPLY = process.argv.includes('--apply')
const say = (line: string): void => void process.stdout.write(`${line}\n`)

/** Switched off wins: it is the cause the profile shows first. */
const CANDIDATES = sql`
  SELECT DISTINCT m."subject_code",
         CASE WHEN l."disabled_at" IS NOT NULL THEN 'lead-disabled'
              WHEN o."state" = 'lost' THEN 'opportunity-lost'
              ELSE 'lead-disqualified' END AS "cause"
    FROM "sales"."meeting" m
    LEFT JOIN "sales"."opportunity" o ON o."code" = m."subject_code"
    JOIN "sales"."lead" l ON l."code" = COALESCE(o."lead_code", m."subject_code")
   WHERE m."held_at" IS NULL AND m."cancelled_at" IS NULL AND m."at" > now()
     AND (l."disabled_at" IS NOT NULL OR o."state" = 'lost'
          OR (m."subject_code" LIKE 'LD-%' AND l."state" = 'disqualified'))
   ORDER BY 1`

@Module({ imports: [ConfigModule, DbModule, MeetingModule] })
class BackfillMeetingCancelModule {}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(BackfillMeetingCancelModule, {
    logger: ['error', 'warn'],
  })
  try {
    const db = app.get<Db>(DB)
    say(`Target: ${app.get<DbHandle>(DB_HANDLE).kind} · ${APPLY ? 'APPLY (writing)' : 'preview'}`)
    const found = (await db.execute(CANDIDATES)) as {
      rows: { subject_code: string; cause: MeetingCancelCause }[]
    }
    for (const r of found.rows) say(`  ${r.subject_code} · ${r.cause}`)
    say(`${found.rows.length} subject(s) with future meetings to cancel.`)
    if (!APPLY) {
      say('Nothing written. Add --apply to write.')
      return
    }

    const cancel = app.get(MeetingCancel)
    const byCause = new Map<MeetingCancelCause, string[]>()
    for (const r of found.rows)
      byCause.set(r.cause, [...(byCause.get(r.cause) ?? []), r.subject_code])
    const gone = await db.transaction(async (tx) => {
      const rows: MeetingRowDb[] = []
      for (const [cause, codes] of byCause)
        rows.push(...(await cancel.cancelFor(tx, null, codes, cause)))
      return rows
    })
    say(`sales.meeting  ${gone.length} row(s) cancelled`)
    await cancel.forgetCancelled(gone)
    say(`Google: ${gone.filter((r) => r.googleEventId).length} event(s) sent for removal`)
  } finally {
    await app.close()
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  )
  process.exitCode = 1
})
