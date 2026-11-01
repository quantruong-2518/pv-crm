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
import type { LeadAiJobErrorKind, LeadAiJobResult, LeadAiJobState } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'
import { lead } from './lead.schema'

/** One press of the lead's AI fill button, run by the `lead.ai-fill` worker (ADR 0131).
 *
 *  No `platform.object` mirror, for `scan_batch`'s reason: the job is a working
 *  set, the lead it fills is the thing in the story. `result` is kept after DONE
 *  because the tray's Undo reads it for 24 h; `jsonb` because it is only ever
 *  read whole, as the contract shape. */
export const leadAiJob = sales.table(
  'lead_ai_job',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** CASCADE: a job means nothing once its lead is gone. */
    leadCode: text('lead_code')
      .notNull()
      .references(() => lead.code, { onDelete: 'cascade' }),
    /** The person who pressed — the only one who sees the job. */
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),
    state: text('state').$type<LeadAiJobState>().notNull().default('QUEUED'),
    /** Steps completed in `LEAD_AI_JOB_STEPS` order; on FAILED the failing one
     *  is `step + 1`. Written in the same UPDATE as `step_ms`. */
    step: smallint('step').notNull().default(0),
    /** Milliseconds of each completed step, one entry per `step`. */
    stepMs: jsonb('step_ms').$type<number[]>().notNull().default([]),
    result: jsonb('result').$type<LeadAiJobResult>(),
    errorKind: text('error_kind').$type<LeadAiJobErrorKind>(),
    /** One Vietnamese sentence for the tray — display copy, not a key. */
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    undoneAt: timestamp('undone_at', { withTimezone: true }),
  },
  (t) => [
    /** "Is a job already running for this lead" — the 409 on a second press,
     *  and the fence that makes it true under two racing presses. Also serves
     *  the sweeper's "which jobs are still active". */
    uniqueIndex('lead_ai_job_one_active_uq')
      .on(t.leadCode)
      .where(sql`"state" IN ('QUEUED', 'RUNNING')`),
    /** "My jobs, newest first" — the tray's only read. */
    index('lead_ai_job_actor_idx').on(t.actorId, t.createdAt.desc()),

    /** `LeadAiJobState` and `LeadAiJobErrorKind`, copied by hand for
     *  `touch_kind_known`'s reason: a new value is a migration a person reads. */
    check('lead_ai_job_state_known', sql`"state" IN ('QUEUED', 'RUNNING', 'DONE', 'FAILED')`),
    check(
      'lead_ai_job_error_kind_known',
      sql`"error_kind" IS NULL OR "error_kind" IN ('unavailable', 'busy', 'limit', 'failed')`,
    ),
    /** Five steps: `read-lead` · `web-search` · `tax-lookup` · `dup-check` · `write`. */
    check('lead_ai_job_step_range', sql`"step" BETWEEN 0 AND 5`),
    /** The tray draws one duration per done step; a mismatch draws a hole. */
    check(
      'lead_ai_job_step_ms_per_step',
      sql`jsonb_typeof("step_ms") = 'array' AND jsonb_array_length("step_ms") = "step"`,
    ),
    /** Undo reads `result`; the 24 h window counts from `finished_at`. */
    check(
      'lead_ai_job_done_has_result',
      sql`"state" <> 'DONE' OR ("result" IS NOT NULL AND "finished_at" IS NOT NULL)`,
    ),
    /** The failed card names a reason and offers a retry. */
    check(
      'lead_ai_job_failed_has_error',
      sql`"state" <> 'FAILED' OR ("error_kind" IS NOT NULL AND "error" IS NOT NULL
                                   AND "error" <> '' AND "finished_at" IS NOT NULL)`,
    ),
    check(
      'lead_ai_job_active_unfinished',
      sql`"state" NOT IN ('QUEUED', 'RUNNING') OR "finished_at" IS NULL`,
    ),
    /** Only a DONE job wrote anything to take back. */
    check('lead_ai_job_undo_only_done', sql`"undone_at" IS NULL OR "state" = 'DONE'`),
    /** A running job cannot leave the tray — it would come back on the next read. */
    check(
      'lead_ai_job_dismiss_only_finished',
      sql`"dismissed_at" IS NULL OR "finished_at" IS NOT NULL`,
    ),
  ],
)

export type LeadAiJobRowDb = typeof leadAiJob.$inferSelect
