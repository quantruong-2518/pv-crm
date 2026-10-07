import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { sql } from 'drizzle-orm'
import { MeetingModule } from '@api/branches/sales/meeting/meeting.module'
import { MeetingService } from '@api/branches/sales/meeting/meeting.service'
import { NextStepDebriefHook } from '@api/branches/sales/next-step/comm-debrief.hook'
import { NextStepModule } from '@api/branches/sales/next-step/next-step.module'
import { COMM_DEBRIEF_HOOK } from '@api/platform/comms/comm-debrief.hook'
import { ConfigModule } from '@api/platform/config/config.module'
import type { DbHandle } from '@api/platform/db/create-db'
import { DB, DB_HANDLE, DbModule, type Db } from '@api/platform/db/db.module'
import { PvError } from '@api/platform/http/problem'

/** One-off: every meeting booked before records opened at booking, not held,
 *  with no comm thread, gets its `scheduled` record — through
 *  `MeetingService.fileBooked`, the opener `record` itself uses. A meeting
 *  already started or over is filed too: close-meeting then closes it.
 *
 *  Idempotent: a meeting that has a thread is not listed, and `open` is a
 *  no-op per (meeting, owner) anyway. A meeting the opener refuses (no address
 *  for the guest, an owner who could never confirm, a stopped deal) is
 *  reported and left. Preview unless `--apply`. Delete once it has run.
 *
 *      DATABASE_URL=pglite://… node -r ts-node/register -r tsconfig-paths/register \
 *        src/scripts/backfill-meeting-comms.ts            # dry run
 *      … src/scripts/backfill-meeting-comms.ts --apply    # write */

const APPLY = process.argv.includes('--apply')
const say = (line: string): void => void process.stdout.write(`${line}\n`)

@Module({
  imports: [ConfigModule, DbModule, MeetingModule, NextStepModule],
  /* `app.module.ts` binds this through `CommsModule.withHook`; this context
     mounts no comms controllers, so it binds the one token itself. */
  providers: [{ provide: COMM_DEBRIEF_HOOK, useExisting: NextStepDebriefHook }],
})
class BackfillMeetingCommsModule {}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(BackfillMeetingCommsModule, {
    logger: ['error', 'warn'],
  })
  try {
    const db = app.get<Db>(DB)
    const r = (await db.execute(sql`
      SELECT m."id", m."subject_code", m."at" FROM "sales"."meeting" m
       WHERE m."held_at" IS NULL
         AND NOT EXISTS (SELECT 1 FROM "comms"."thread" t
                          WHERE t."channel" = 'meeting' AND t."external_id" = m."id"::text)
       ORDER BY m."at"`)) as { rows: { id: string; subject_code: string; at: string }[] }
    say(`Target: ${app.get<DbHandle>(DB_HANDLE).kind} · ${APPLY ? 'APPLY (writing)' : 'preview'}`)
    say(`${r.rows.length} meeting(s) not held with no comm record.`)

    const meetings = app.get(MeetingService)
    for (const m of r.rows) {
      if (!APPLY) {
        say(`  · ${m.subject_code} ${m.id} at ${new Date(m.at).toISOString()}`)
        continue
      }
      try {
        say(`  ${await meetings.fileBooked(m.id)} ${m.subject_code} ${m.id}`)
      } catch (error) {
        if (!(error instanceof PvError)) throw error
        say(`  ! ${m.subject_code} ${m.id}: ${error.message}`)
      }
    }
    if (!APPLY) say('Nothing written. Add --apply to write.')
  } finally {
    await app.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
