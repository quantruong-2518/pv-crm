import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import {
  COMM_AI_JOB_ACTIVE,
  type CommAiJobErrorKind,
  type CommAiJobState,
  type CommAiReport,
} from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { commAiJob, type CommAiJobRowDb, type CommAiJobValues } from './comm-ai-job.schema'
import { debrief } from './comms.schema'

/** The comm report's job rows (ADR 0135). Decides nothing. Every write that ends
 *  or advances a job is conditional on the row still being active, so a sweeper,
 *  a redelivery or a second worker can never overwrite a finished job. */

/** A finished job's note and report, customer content, are held this long. */
export const COMM_AI_JOB_SHOWN_MS = 24 * 60 * 60_000

const ACTIVE: CommAiJobState[] = [...COMM_AI_JOB_ACTIVE]

/** Active, or finished within the day and not dismissed. */
const shown = () =>
  and(
    isNull(commAiJob.dismissedAt),
    or(
      inArray(commAiJob.state, ACTIVE),
      gt(commAiJob.finishedAt, new Date(Date.now() - COMM_AI_JOB_SHOWN_MS)),
    ),
  )

export type CommAiJobJoined = { job: CommAiJobRowDb; subjectCode: string }

const JOINED = { job: commAiJob, subjectCode: debrief.subjectCode }

@Injectable()
export class CommAiJobRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  async insert(tx: Db, values: CommAiJobValues): Promise<CommAiJobRowDb> {
    const [row] = await tx.insert(commAiJob).values(values).returning()
    return row!
  }

  /** Serialises one person's presses until the transaction ends, so the
   *  quota count and the insert it admits cannot interleave. */
  async lockActor(tx: Db, actorId: string): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`comm-ai-job:${actorId}`}))`)
  }

  async activeCount(actorId: string, db: Db = this.db): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(commAiJob)
      .where(and(eq(commAiJob.actorId, actorId), inArray(commAiJob.state, ACTIVE)))
    return row?.n ?? 0
  }

  /** → RUNNING with this delivery's `started_at`, which the sweeper ages. Null = not
   *  claimable: finished, or past step 0, where an earlier delivery reached the
   *  model and running again would bill the whole recording twice. */
  async claim(id: string): Promise<CommAiJobRowDb | null> {
    const [row] = await this.db
      .update(commAiJob)
      .set({ state: 'RUNNING', startedAt: sql`now()` })
      .where(and(eq(commAiJob.id, id), inArray(commAiJob.state, ACTIVE), eq(commAiJob.step, 0)))
      .returning()
    return row ?? null
  }

  /** `step` and `step_ms` in one UPDATE, for the per-step CHECK. False = no longer
   *  running: swept meanwhile, so the caller stops before the model call. */
  async step(id: string, ms: number): Promise<boolean> {
    const rows = await this.db
      .update(commAiJob)
      .set({
        step: sql`${commAiJob.step} + 1`,
        stepMs: sql`${commAiJob.stepMs} || jsonb_build_array(${ms}::int)`,
      })
      .where(and(eq(commAiJob.id, id), eq(commAiJob.state, 'RUNNING')))
      .returning({ id: commAiJob.id })
    return rows.length > 0
  }

  /** False = no longer running: swept meanwhile, so the report is dropped. */
  async done(id: string, result: CommAiReport, stepMs: readonly number[]): Promise<boolean> {
    const rows = await this.db
      .update(commAiJob)
      .set({
        state: 'DONE',
        result,
        step: stepMs.length,
        stepMs: sql`${JSON.stringify(stepMs)}::jsonb`,
        finishedAt: sql`now()`,
      })
      .where(and(eq(commAiJob.id, id), eq(commAiJob.state, 'RUNNING')))
      .returning({ id: commAiJob.id })
    return rows.length > 0
  }

  /** `stepMs` given = progress as the worker knows it; absent = left as stored. */
  async fail(
    id: string,
    kind: CommAiJobErrorKind,
    error: string,
    stepMs?: readonly number[],
  ): Promise<void> {
    const progress = stepMs
      ? { step: stepMs.length, stepMs: sql`${JSON.stringify(stepMs)}::jsonb` }
      : {}
    await this.db
      .update(commAiJob)
      .set({ state: 'FAILED', errorKind: kind, error, finishedAt: sql`now()`, ...progress })
      .where(and(eq(commAiJob.id, id), inArray(commAiJob.state, ACTIVE)))
  }

  /** Sweeper: active jobs whose current delivery (or, never started, whose press)
   *  is older than `before`, failed in one statement. */
  async expire(before: Date, error: string): Promise<number> {
    const age = sql`COALESCE(${commAiJob.startedAt}, ${commAiJob.createdAt})`
    const rows = await this.db
      .update(commAiJob)
      .set({ state: 'FAILED', errorKind: 'failed', error, finishedAt: sql`now()` })
      .where(and(inArray(commAiJob.state, ACTIVE), lt(age, before)))
      .returning({ id: commAiJob.id })
    return rows.length
  }

  /** Sweeper: deleted, not flagged, because `note` and `result` are customer content. */
  async purge(before: Date): Promise<number> {
    const rows = await this.db
      .delete(commAiJob)
      .where(lt(commAiJob.finishedAt, before))
      .returning({ id: commAiJob.id })
    return rows.length
  }

  async actorDisabled(id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ disabledAt: actor.disabledAt })
      .from(actor)
      .where(eq(actor.id, id))
      .limit(1)
    return !row || row.disabledAt !== null
  }

  /** The tray's read, newest first, through `ai_job_actor_idx`. */
  async listFor(actorId: string): Promise<CommAiJobJoined[]> {
    return this.db
      .select(JOINED)
      .from(commAiJob)
      .innerJoin(debrief, eq(debrief.id, commAiJob.debriefId))
      .where(and(eq(commAiJob.actorId, actorId), shown()))
      .orderBy(desc(commAiJob.createdAt))
  }

  /** The form's read: `actorId`'s latest job on this record. */
  async latestOn(actorId: string, debriefId: string): Promise<CommAiJobRowDb | null> {
    const [row] = await this.db
      .select()
      .from(commAiJob)
      .where(and(eq(commAiJob.actorId, actorId), eq(commAiJob.debriefId, debriefId), shown()))
      .orderBy(desc(commAiJob.createdAt))
      .limit(1)
    return row ?? null
  }

  /** Finished jobs of `actorId`'s leave the tray. */
  async dismissFinished(actorId: string): Promise<void> {
    await this.db
      .update(commAiJob)
      .set({ dismissedAt: sql`now()` })
      .where(
        and(
          eq(commAiJob.actorId, actorId),
          isNotNull(commAiJob.finishedAt),
          isNull(commAiJob.dismissedAt),
        ),
      )
  }
}
