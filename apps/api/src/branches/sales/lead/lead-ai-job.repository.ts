import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  LEAD_AI_JOB_ACTIVE,
  type LeadAiJobErrorKind,
  type LeadAiJobResult,
  type LeadAiJobState,
} from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { LEAD_AI_JOB_SHOWN_MS } from './lead-ai-job.mapper'
import { leadAiJob, type LeadAiJobRowDb } from './lead-ai-job.schema'
import { leadHolderScope, leadLive } from './lead-scope'
import { lead, leadIndustry, type LeadRowDb } from './lead.schema'

/** The AI-fill job rows (ADR 0131). Decides nothing. Every write that ends or
 *  advances a job is conditional on the row still being active, so a sweeper,
 *  a redelivery or a second worker can never overwrite a finished job. */

const ACTIVE: LeadAiJobState[] = [...LEAD_AI_JOB_ACTIVE]
const shownSince = () => new Date(Date.now() - LEAD_AI_JOB_SHOWN_MS)

export type LeadAiJobJoined = { job: LeadAiJobRowDb; lead: LeadRowDb }
type Holder = Pick<Actor, 'id' | 'ownOnly'>

@Injectable()
export class LeadAiJobRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** In a savepoint: a unique violation rolls back only the insert, so the
   *  caller can still read the active job on the same transaction. */
  async insert(tx: Db, leadCode: string, actorId: string): Promise<LeadAiJobRowDb> {
    const [row] = await tx.transaction((sp) =>
      sp.insert(leadAiJob).values({ leadCode, actorId }).returning(),
    )
    return row!
  }

  /** Serialises one person's presses until the transaction ends, so the
   *  quota count and the insert it admits cannot interleave. */
  async lockActor(tx: Db, actorId: string): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`lead-ai-fill:${actorId}`}))`)
  }

  async activeCount(actorId: string, db: Db = this.db): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(leadAiJob)
      .where(and(eq(leadAiJob.actorId, actorId), inArray(leadAiJob.state, ACTIVE)))
    return row?.n ?? 0
  }

  async activeFor(leadCode: string, db: Db = this.db): Promise<string | null> {
    const [row] = await db
      .select({ id: leadAiJob.id })
      .from(leadAiJob)
      .where(and(eq(leadAiJob.leadCode, leadCode), inArray(leadAiJob.state, ACTIVE)))
      .limit(1)
    return row?.id ?? null
  }

  /** QUEUED or RUNNING → RUNNING with progress reset: a redelivery finds the
   *  row RUNNING from the attempt before. `started_at` is this delivery's start,
   *  which the sweeper ages. Null = finished already, nothing to do. */
  async claim(id: string): Promise<LeadAiJobRowDb | null> {
    const [row] = await this.db
      .update(leadAiJob)
      .set({
        state: 'RUNNING',
        startedAt: sql`now()`,
        step: 0,
        stepMs: sql`'[]'::jsonb`,
      })
      .where(and(eq(leadAiJob.id, id), inArray(leadAiJob.state, ACTIVE)))
      .returning()
    return row ?? null
  }

  /** `step` and `step_ms` in one UPDATE (`lead_ai_job_step_ms_per_step`). */
  async step(id: string, step: number, ms: number): Promise<void> {
    await this.db
      .update(leadAiJob)
      .set({
        step: sql`${leadAiJob.step} + 1`,
        stepMs: sql`${leadAiJob.stepMs} || jsonb_build_array(${ms}::int)`,
      })
      .where(
        and(eq(leadAiJob.id, id), eq(leadAiJob.state, 'RUNNING'), eq(leadAiJob.step, step - 1)),
      )
  }

  /** In the fill's own transaction; false = no longer running, the caller rolls back. */
  async done(
    tx: Db,
    id: string,
    result: LeadAiJobResult,
    stepMs: number[],
    at: Date,
  ): Promise<boolean> {
    const rows = await tx
      .update(leadAiJob)
      .set({
        state: 'DONE',
        result,
        step: stepMs.length,
        stepMs: sql`${JSON.stringify(stepMs)}::jsonb`,
        finishedAt: at,
      })
      .where(and(eq(leadAiJob.id, id), eq(leadAiJob.state, 'RUNNING')))
      .returning({ id: leadAiJob.id })
    return rows.length > 0
  }

  /** `stepMs` given = progress as the worker knows it; absent = left as stored. */
  async fail(
    id: string,
    kind: LeadAiJobErrorKind,
    error: string,
    stepMs?: readonly number[],
  ): Promise<void> {
    const progress = stepMs
      ? { step: stepMs.length, stepMs: sql`${JSON.stringify(stepMs)}::jsonb` }
      : {}
    await this.db
      .update(leadAiJob)
      .set({ state: 'FAILED', errorKind: kind, error, finishedAt: sql`now()`, ...progress })
      .where(and(eq(leadAiJob.id, id), inArray(leadAiJob.state, ACTIVE)))
  }

  /** Sweeper: active jobs whose current delivery (or, never started, whose
   *  press) is older than `before`, failed in one statement. */
  async expire(before: Date, error: string): Promise<number> {
    const age = sql`COALESCE(${leadAiJob.startedAt}, ${leadAiJob.createdAt})`
    const rows = await this.db
      .update(leadAiJob)
      .set({ state: 'FAILED', errorKind: 'failed', error, finishedAt: sql`now()` })
      .where(and(inArray(leadAiJob.state, ACTIVE), lt(age, before)))
      .returning({ id: leadAiJob.id })
    return rows.length
  }

  /** Sweeper: finished jobs past the tray's day. Deleted, not flagged: `result`
   *  holds customer values the lead already keeps. */
  async purge(before: Date): Promise<number> {
    const rows = await this.db
      .delete(leadAiJob)
      .where(lt(leadAiJob.finishedAt, before))
      .returning({ id: leadAiJob.id })
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

  /** The tray's read: active jobs, and finished ones neither dismissed nor
   *  older than a day, on live leads `who` still holds (the result carries the
   *  lead's values). Newest first, through `lead_ai_job_actor_idx`. */
  async listFor(who: Holder, db: Db = this.db): Promise<LeadAiJobJoined[]> {
    return db
      .select({ job: leadAiJob, lead })
      .from(leadAiJob)
      .innerJoin(lead, eq(lead.code, leadAiJob.leadCode))
      .where(
        and(
          eq(leadAiJob.actorId, who.id),
          leadLive,
          leadHolderScope(who, true),
          or(
            inArray(leadAiJob.state, ACTIVE),
            and(isNull(leadAiJob.dismissedAt), gt(leadAiJob.finishedAt, shownSince())),
          ),
        ),
      )
      .orderBy(desc(leadAiJob.createdAt))
  }

  /** One job of `who`'s, whatever its age, under the list's lead rule: null
   *  for someone else's or for a lead `who` no longer holds. */
  async mine(who: Holder, id: string, db: Db = this.db): Promise<LeadAiJobJoined | null> {
    const [row] = await db
      .select({ job: leadAiJob, lead })
      .from(leadAiJob)
      .innerJoin(lead, eq(lead.code, leadAiJob.leadCode))
      .where(
        and(
          eq(leadAiJob.id, id),
          eq(leadAiJob.actorId, who.id),
          leadLive,
          leadHolderScope(who, true),
        ),
      )
      .limit(1)
    return row ?? null
  }

  /** Industry ids each lead holds, for the undo comparison. */
  async industriesOf(codes: readonly string[], db: Db = this.db): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>()
    if (codes.length === 0) return out
    const rows = await db
      .select({ code: leadIndustry.leadCode, id: leadIndustry.industryId })
      .from(leadIndustry)
      .where(inArray(leadIndustry.leadCode, [...codes]))
    for (const r of rows) out.set(r.code, [...(out.get(r.code) ?? []), r.id])
    return out
  }

  /** False = undone already, not DONE, dismissed or past the day (ADR 0131 §6);
   *  the caller rolls its clears back. */
  async markUndone(tx: Db, id: string): Promise<boolean> {
    const rows = await tx
      .update(leadAiJob)
      .set({ undoneAt: sql`now()` })
      .where(
        and(
          eq(leadAiJob.id, id),
          eq(leadAiJob.state, 'DONE'),
          isNull(leadAiJob.undoneAt),
          isNull(leadAiJob.dismissedAt),
          gt(leadAiJob.finishedAt, shownSince()),
        ),
      )
      .returning({ id: leadAiJob.id })
    return rows.length > 0
  }

  /** Finished jobs of `actorId`'s leave the tray; `id` narrows it to one. */
  async dismiss(actorId: string, id?: string): Promise<number> {
    const rows = await this.db
      .update(leadAiJob)
      .set({ dismissedAt: sql`now()` })
      .where(
        and(
          eq(leadAiJob.actorId, actorId),
          id ? eq(leadAiJob.id, id) : undefined,
          isNotNull(leadAiJob.finishedAt),
          isNull(leadAiJob.dismissedAt),
        ),
      )
      .returning({ id: leadAiJob.id })
    return rows.length
  }
}
