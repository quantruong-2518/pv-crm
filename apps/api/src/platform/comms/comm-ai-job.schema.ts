import {
  check,
  index,
  jsonb,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { CommAiJobErrorKind, CommAiJobState, CommAiPart, CommAiReport } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { comms, debrief } from './comms.schema'

/** One press of a comm's AI button on a record with a recording (ADR 0135).
 *
 *  A job rather than a request because one recording is minutes of model time,
 *  far past what the proxy holds open; `sales.lead_ai_job` is the same shape for
 *  the same reason.
 *
 *  No `platform.object` mirror, for `scan_batch`'s reason: the job is a working
 *  set, the debrief it reports on is the thing in the story.
 *
 *  `note` and `result` are customer content, the one difference from the lead's
 *  job, and they are why the tray's row leaves both out: only the form reads
 *  them, behind the same gate as the press. */
export const commAiJob = comms.table(
  'ai_job',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** CASCADE: a report on a record that is gone has nowhere to land. */
    debriefId: uuid('debrief_id')
      .notNull()
      .references(() => debrief.id, { onDelete: 'cascade' }),
    /** The person who pressed, the only one who sees the job. No CASCADE, like
     *  `lead_ai_job.actor_id`: a press happens signed in, so the row exists. */
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),
    /** Which button was pressed: the report holds both parts, this picks the one
     *  the form fills, so the other button can reuse the report for free. */
    part: text('part').$type<CommAiPart>().notNull(),
    state: text('state').$type<CommAiJobState>().notNull().default('QUEUED'),
    /** Steps completed in `COMM_AI_JOB_STEPS` order; on FAILED the failing one
     *  is `step + 1`. */
    step: smallint('step').notNull().default(0),
    /** Milliseconds of each completed step, one entry per `step`. */
    stepMs: jsonb('step_ms').$type<number[]>().notNull().default([]),
    /** What the press sent: the draft lives in the browser until confirm, so the
     *  worker has no other copy. '' for a press with nothing typed. */
    note: text('note').notNull().default(''),
    /** Kept whole after DONE because the form picks it up after the press; `jsonb`
     *  because it is only ever read whole, as the contract shape. */
    result: jsonb('result').$type<CommAiReport>(),
    errorKind: text('error_kind').$type<CommAiJobErrorKind>(),
    /** One Vietnamese sentence for the tray — display copy, not a key. */
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => [
    /** "Is a job already running for this record" — the 409 on a second press,
     *  and the fence that makes it true under two racing presses, so one
     *  recording is never billed twice at once. */
    uniqueIndex('ai_job_one_active_uq')
      .on(t.debriefId)
      .where(sql`"state" IN ('QUEUED', 'RUNNING')`),
    /** "My jobs, newest first" — the tray's read; the form's "my latest job on
     *  this record" walks the same few rows. */
    index('ai_job_actor_idx').on(t.actorId, t.createdAt.desc()),

    /** `CommAiJobState`, `CommAiPart` and `CommAiJobErrorKind`, copied by hand for
     *  `touch_kind_known`'s reason: a new value is a migration a person reads. */
    check('ai_job_state_known', sql`"state" IN ('QUEUED', 'RUNNING', 'DONE', 'FAILED')`),
    check('ai_job_part_known', sql`"part" IN ('summary', 'minutes')`),
    check(
      'ai_job_error_kind_known',
      sql`"error_kind" IS NULL OR "error_kind" IN ('unavailable', 'busy', 'failed')`,
    ),
    /** Three steps: `read-sources` · `listen` · `write`. */
    check('ai_job_step_range', sql`"step" BETWEEN 0 AND 3`),
    check(
      'ai_job_step_ms_per_step',
      sql`jsonb_typeof("step_ms") = 'array' AND jsonb_array_length("step_ms") = "step"`,
    ),
    check(
      'ai_job_done_has_result',
      sql`"state" <> 'DONE' OR ("result" IS NOT NULL AND "finished_at" IS NOT NULL)`,
    ),
    check(
      'ai_job_failed_has_error',
      sql`"state" <> 'FAILED' OR ("error_kind" IS NOT NULL AND "error" IS NOT NULL AND "error" <> '' AND "finished_at" IS NOT NULL)`,
    ),
    check(
      'ai_job_active_unfinished',
      sql`"state" NOT IN ('QUEUED', 'RUNNING') OR "finished_at" IS NULL`,
    ),
    check('ai_job_dismiss_only_finished', sql`"dismissed_at" IS NULL OR "finished_at" IS NOT NULL`),
  ],
)

export type CommAiJobRowDb = typeof commAiJob.$inferSelect
export type CommAiJobValues = typeof commAiJob.$inferInsert
