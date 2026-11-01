import { Inject, Injectable, Logger } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import { LEAD_AI_JOB_STEPS, type LeadAiJobErrorKind, type LeadAiJobStepKey } from '@pv/contracts'
import { AiTransientError, AiUnavailableError } from '@api/platform/ai/ai-errors'
import { ACCESS } from '@api/platform/engines/tokens'
import { busyCodeOf } from '@api/platform/http/db-error'
import { BusyError, conflict, notFound, PvError } from '@api/platform/http/problem'
import type { AiFillAttempt, AiFillJobHandler } from '@api/platform/queue/ai-fill-jobs'
import { ActorRepository } from '@api/platform/session/actor.repository'
import { LeadAiFillRepository } from './lead-ai-fill.repository'
import { aiFillBlock, emptyFillable } from './lead-ai-fill.rule'
import { LeadAiFillService } from './lead-ai-fill.service'
import { AI_FILL_BLOCKED, AI_FILL_REFUSED, notHeld } from './lead-ai-fill.words'
import { LeadAiJobRepository } from './lead-ai-job.repository'
import type { LeadAiJobRowDb } from './lead-ai-job.schema'
import { LeadEnricher } from './lead-enrich'
import { LeadRepository } from './lead.repository'

/** One `lead.ai-fill` delivery (ADR 0131): the press's work, run in the
 *  presser's name. The presser is re-read and E2 re-asked, and `apply` re-checks
 *  the scope under its lock: a revoked person or a lead that changed hands
 *  writes nothing. DONE is written inside `apply`'s transaction, so values and
 *  the undoable result land together or not at all. A transient failure before
 *  the model calls finish throws for pg-boss to retry; after them, or on the
 *  final delivery, the handler writes FAILED itself, because a redelivery would
 *  pay for both calls again. Thrown and logged text names error classes only. */

const LEAD_EDIT = { branch: 'Sales', permission: 'lead.edit' } as const

/** The job left RUNNING meanwhile (swept, or finished by another delivery). */
class NoLongerRunning extends Error {}

@Injectable()
export class LeadAiFillRunner implements AiFillJobHandler {
  private readonly log = new Logger('LeadAiFill')

  constructor(
    private readonly jobs: LeadAiJobRepository,
    private readonly leads: LeadRepository,
    private readonly repo: LeadAiFillRepository,
    private readonly fills: LeadAiFillService,
    private readonly enricher: LeadEnricher,
    private readonly actors: ActorRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async run(jobId: string, attempt: AiFillAttempt): Promise<void> {
    const job = await this.jobs.claim(jobId)
    if (!job) return
    const trail = new StepTrail((step, ms) => this.jobs.step(jobId, step, ms))
    try {
      await this.fill(job, trail)
    } catch (error) {
      await trail.settled()
      if (error instanceof NoLongerRunning) return
      const kind = error instanceof Error ? error.name : 'unknown'
      const failure = failureOf(error)
      this.log.warn(`ai-fill ${jobId}: ${failure.kind} at step ${trail.ms.length + 1} (${kind})`)
      /* Past web-search the model calls are paid; a redelivery would pay them again. */
      const paid = trail.ms.length >= 2
      if (failure.retry && !attempt.final && !paid) {
        throw new Error(`ai-fill ${jobId}: transient failure (${kind})`)
      }
      await this.jobs.fail(jobId, failure.kind, failure.error, trail.ms)
    }
  }

  private async fill(job: LeadAiJobRowDb, trail: StepTrail): Promise<void> {
    const t0 = Date.now()
    const who = await this.presser(job.actorId)
    const code = job.leadCode
    const before = await this.leads.byCode(who, code)
    if (!before) throw notFound('lead', code)
    if (!before.holds) throw notHeld(code)
    const row = before.row
    const block = aiFillBlock(row, before.industries.length)
    if (block) throw conflict(AI_FILL_BLOCKED[block])
    const wanted = emptyFillable(row, before.industries.length)
    const lists = await this.repo.industryLists()
    trail.done('read-lead', Date.now() - t0)

    /* Admitted at the press: work already accepted is never cut by the quota. */
    const caller = { actorId: who.id, subjectCode: code, admitted: true }
    const found = await this.enricher.suggest(row, wanted, caller, lists, trail.done)
    await trail.flush()
    const t1 = Date.now()
    const conflicts = await this.fills.clash(found, row.accountCode)
    trail.done('dup-check', Date.now() - t1)
    await trail.flush()

    const t2 = Date.now()
    const at = new Date()
    await this.repo.run(async (tx) => {
      const written = await this.fills.apply(tx, who, code, found, at)
      const filled = written.map((field) => ({ field, ...found[field]! }))
      const missing = wanted.filter((f) => !found[f] && !conflicts.some((c) => c.field === f))
      const result = { filled, conflicts, notFound: missing }
      const stepMs = [...trail.ms, Date.now() - t2]
      if (!(await this.jobs.done(tx, job.id, result, stepMs, at))) throw new NoLongerRunning()
    })
    this.log.log(`ai-fill ${job.id}: done, ${conflicts.length} conflict(s)`)
  }

  /** The route's own E2 question, re-asked now, as `LeadScanCommit` does. */
  private async presser(id: string): Promise<Actor> {
    const caller = await this.actors.byId(id)
    const live = caller && !(await this.jobs.actorDisabled(id))
    if (!caller || !live || !this.access.check(caller.actor, LEAD_EDIT).ok) {
      throw conflict('Bạn không còn quyền sửa lead này.')
    }
    return caller.actor
  }
}

/** Steps finish out of order (identify and the registry run side by side);
 *  `step` counts them in `LEAD_AI_JOB_STEPS` order, so a later step's time
 *  waits in `held` until every earlier one is in. Writes are chained, never
 *  fire-and-forget: the final write must not race a progress write. */
class StepTrail {
  readonly ms: number[] = []
  private readonly held = new Map<LeadAiJobStepKey, number>()
  private chain: Promise<void> = Promise.resolve()
  private broken: unknown = null

  constructor(private readonly save: (step: number, ms: number) => Promise<void>) {}

  readonly done = (key: LeadAiJobStepKey, ms: number): void => {
    this.held.set(key, Math.max(0, Math.round(ms)))
    for (;;) {
      const next = LEAD_AI_JOB_STEPS[this.ms.length]
      const value = next === undefined ? undefined : this.held.get(next)
      if (value === undefined) return
      this.ms.push(value)
      const step = this.ms.length
      this.chain = this.chain
        .then(() => this.save(step, value))
        .catch((error: unknown) => {
          this.broken ??= error
        })
    }
  }

  /** Waits for the progress writes; a failed one fails the attempt. */
  async flush(): Promise<void> {
    await this.chain
    if (this.broken) throw this.broken
  }

  settled(): Promise<void> {
    return this.chain
  }
}

type Failure = { kind: LeadAiJobErrorKind; error: string; retry: boolean }

/** A refusal (route off, a limit, a lead out of reach) is final at once;
 *  busy vendors and a busy database are worth another delivery. */
function failureOf(error: unknown): Failure {
  if (error instanceof AiUnavailableError) return { ...AI_FILL_REFUSED[error.reason], retry: false }
  if (error instanceof AiTransientError || error instanceof BusyError || busyCodeOf(error)) {
    return {
      kind: 'busy',
      error: 'AI đang bận nên chưa điền gì.',
      retry: true,
    }
  }
  if (error instanceof PvError) return { kind: 'failed', error: error.message, retry: false }
  return { kind: 'failed', error: 'Có lỗi nên chưa điền gì.', retry: true }
}
