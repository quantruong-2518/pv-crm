import { Inject, Injectable, Logger } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import type { CommAiJobErrorKind } from '@pv/contracts'
import { AiOutputError, AiTransientError, AiUnavailableError } from '@api/platform/ai/ai-errors'
import { ACCESS } from '@api/platform/engines/tokens'
import { busyCodeOf } from '@api/platform/http/db-error'
import { BusyError, conflict, PvError } from '@api/platform/http/problem'
import type { CommAiAttempt, CommAiJobHandler } from '@api/platform/queue/comm-ai-jobs'
import { ActorRepository } from '@api/platform/session/actor.repository'
import { StorageObjectMissingError } from '@api/platform/storage/storage.service'
import { CommAiJobRepository } from './comm-ai-job.repository'
import type { CommAiJobRowDb } from './comm-ai-job.schema'
import { CommReportService, REFUSED } from './comm-report.service'

/** One `comm.ai-report` delivery (ADR 0135): the press's work, in the presser's
 *  name. The presser is re-read, E2 re-asked and the gate re-run, so a person who
 *  lost access writes nothing and sends nothing. A refusal is final at once; a
 *  transient failure before the model call throws for pg-boss to retry; once the
 *  call has started the handler writes FAILED itself, because a redelivery bills
 *  the whole recording again. Thrown and logged text names error classes only. */

/** The job left RUNNING meanwhile: swept, or finished by another delivery. */
class NoLongerRunning extends Error {}

const BUSY = 'AI đang bận nên chưa tạo được tóm tắt và biên bản. Thử lại sau ít phút.'

@Injectable()
export class CommAiJobRunner implements CommAiJobHandler {
  private readonly log = new Logger('CommAiJob')

  constructor(
    private readonly jobs: CommAiJobRepository,
    private readonly reports: CommReportService,
    private readonly actors: ActorRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async run(jobId: string, attempt: CommAiAttempt): Promise<void> {
    const job = await this.jobs.claim(jobId)
    if (!job) {
      /* Conditional on active: a finished job stays as it is. One still active was
         cut after the model call started (a deploy, a crash), so it ends here. */
      await this.jobs.fail(jobId, 'busy', BUSY)
      return
    }
    const ms: number[] = []
    try {
      await this.work(job, ms)
    } catch (error) {
      if (error instanceof NoLongerRunning) return
      const kind = error instanceof Error ? error.name : 'unknown'
      const failure = failureOf(error)
      this.log.warn(`comm report ${jobId}: ${failure.kind} at step ${ms.length + 1} (${kind})`)
      /* Step 1 ends where the model call starts. */
      if (failure.retry && !attempt.final && ms.length === 0) {
        throw new Error(`comm report ${jobId}: transient failure (${kind})`)
      }
      await this.jobs.fail(jobId, failure.kind, failure.error, ms)
    }
  }

  private async work(job: CommAiJobRowDb, ms: number[]): Promise<void> {
    const t0 = Date.now()
    const who = await this.presser(job.actorId)
    const listening = await this.reports.prepareListening(who, job.debriefId, job.note || undefined)
    const read = Date.now() - t0
    if (!(await this.jobs.step(job.id, read))) throw new NoLongerRunning()
    ms.push(read)

    const t1 = Date.now()
    const report = await this.reports.listen(who, listening)
    if (!report) throw new BusyError()
    ms.push(Date.now() - t1)

    /* No step write between: a failed one would lose a report already paid for. */
    const t2 = Date.now()
    const done = await this.jobs.done(job.id, report, [...ms, Date.now() - t2])
    this.log.log(`comm report ${job.id}: ${done ? 'done' : 'swept meanwhile, report dropped'}`)
  }

  /** The route's own E2 question, re-asked now: the press may be minutes old. */
  private async presser(id: string): Promise<Actor> {
    const caller = await this.actors.byId(id)
    const live = caller && !(await this.jobs.actorDisabled(id))
    const may =
      live &&
      this.access.allows(caller.actor, 'comm.view') &&
      this.access.allows(caller.actor, 'comm.view-content')
    if (!caller || !may) throw conflict('Bạn không còn quyền xem nội dung liên hệ này.')
    return caller.actor
  }
}

type Failure = { kind: CommAiJobErrorKind; error: string; retry: boolean }

/** A refusal is final; busy vendors and a busy database are worth another
 *  delivery; a vendor that answered "no" will answer the same. */
function failureOf(error: unknown): Failure {
  if (error instanceof AiUnavailableError) {
    return { kind: 'unavailable', error: REFUSED[error.reason]().message, retry: false }
  }
  if (error instanceof AiTransientError || error instanceof BusyError || busyCodeOf(error)) {
    return { kind: 'busy', error: BUSY, retry: true }
  }
  if (error instanceof AiOutputError) {
    return { kind: 'failed', error: 'AI không nghe được ghi âm này.', retry: false }
  }
  if (error instanceof StorageObjectMissingError) {
    return {
      kind: 'failed',
      error: 'Không tìm thấy tệp ghi âm. Tải tệp lên lại.',
      retry: false,
    }
  }
  if (error instanceof PvError) return { kind: 'failed', error: error.message, retry: false }
  return {
    kind: 'failed',
    error: 'Chưa tạo được tóm tắt và biên bản. Thử lại sau ít phút.',
    retry: true,
  }
}
