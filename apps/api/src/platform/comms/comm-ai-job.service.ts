import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type {
  CommAiJob,
  CommAiJobBody,
  CommAiJobCurrent,
  CommAiJobDetail,
  CommAiJobList,
} from '@pv/contracts'
import { AiGateway } from '@api/platform/ai/ai-gateway'
import { AiRouteRepository } from '@api/platform/ai/ai-route.repository'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { conflict, rateLimited } from '@api/platform/http/problem'
import { COMM_AI_ENQUEUE, type CommAiEnqueue } from '@api/platform/queue/comm-ai-jobs'
import { CommAiJobRepository } from './comm-ai-job.repository'
import type { CommAiJobRowDb } from './comm-ai-job.schema'
import { CommAttachmentRepository } from './comm-attachment.repository'
import { isAudio } from './comm-report.files'
import { CommReportService, NO_RECORDING, REFUSED, refusal } from './comm-report.service'

/** The press of a report on a record with a recording, and the tray's doors
 *  (ADR 0135). The press asks what the synchronous door asks, then only opens a
 *  job and enqueues it. The job row, the press's word that the people on the
 *  recording were told (§2) and the quota count share one transaction.
 *
 *  A job is its presser's alone: every read and the dismissal are cut to the
 *  caller's own rows. The form's read is the only one carrying `note` and
 *  `report`, customer content, so it stands behind the same gate as the press
 *  and leaves an audit line once a report exists. */

const TASK = 'comm-audio-report'
const NOT_SENT = 'Chưa bắt đầu được. Thử lại sau ít phút.'

@Injectable()
export class CommAiJobService {
  private readonly log = new Logger('CommAiJob')

  constructor(
    private readonly jobs: CommAiJobRepository,
    private readonly reports: CommReportService,
    private readonly attachments: CommAttachmentRepository,
    private readonly ai: AiGateway,
    private readonly routes: AiRouteRepository,
    private readonly audit: AuditRepository,
    @Inject(COMM_AI_ENQUEUE) private readonly queue: CommAiEnqueue,
  ) {}

  async press(who: Actor, id: string, body: CommAiJobBody): Promise<CommAiJob> {
    const { row } = await this.reports.gate(who, id)
    await this.ai.check(TASK, who.id).catch((error: unknown) => {
      throw refusal(error)
    })
    const files = await this.attachments.listOf(id)
    if (!files.some((f) => isAudio(f.row.mime))) throw conflict(NO_RECORDING)

    const job = await this.jobs.run(async (tx) => {
      await this.jobs.lockActor(tx, who.id)
      /* First: a press on a running record is told so (`ai_job_one_active_uq`), never a 429. */
      const opened = await this.jobs.insert(tx, {
        debriefId: id,
        actorId: who.id,
        part: body.part,
        note: body.note ?? '',
      })
      await this.reserve(tx, who.id)
      await this.audit.write(
        {
          actorId: who.id,
          action: 'edit',
          code: row.subjectCode,
          note: `comms.debrief ${id} · AI report job ${opened.id} · recording notice confirmed`,
        },
        tx,
      )
      return opened
    })
    /* After the insert committed: the worker must find the row it is handed. */
    try {
      await this.queue.enqueue(job.id)
    } catch (error) {
      const kind = error instanceof Error ? error.name : 'unknown'
      this.log.error(`comm report ${job.id}: enqueue failed (${kind})`)
      await this.jobs.fail(job.id, 'busy', NOT_SENT)
      /* 429, not `BusyError`, for `comm-report.service`'s reason: the overlay would hide the form. */
      throw rateLimited(NOT_SENT)
    }
    return toCommAiJob(job, row.subjectCode)
  }

  /** The gateway's check counts the ledger, where a job not yet run has no row, and
   *  the worker runs it as admitted: without this, a person could queue past the
   *  limit. `active` holds the job just opened. The budget stays the gateway's. */
  private async reserve(tx: Db, actorId: string): Promise<void> {
    const perUser = (await this.routes.get(TASK, tx))?.dailyCallsPerUser ?? 0
    if (perUser <= 0) return
    const calls = await this.routes.callsLastDay(TASK, actorId, tx)
    const active = await this.jobs.activeCount(actorId, tx)
    if (calls + active > perUser) throw REFUSED['user-limit']()
  }

  async current(who: Actor, id: string): Promise<CommAiJobCurrent> {
    const { row } = await this.reports.gate(who, id)
    const job = await this.jobs.latestOn(who.id, id)
    /* `trailContentRead`'s rule: one line per request, before the content leaves. */
    if (job?.result) {
      await this.audit.write({
        actorId: who.id,
        action: 'view',
        code: row.subjectCode,
        note: `comms.debrief ${id} · read AI report of job ${job.id}`,
      })
    }
    return { job: job && toDetail(job, row.subjectCode) }
  }

  async list(who: Actor): Promise<CommAiJobList> {
    const rows = await this.jobs.listFor(who.id)
    return rows.map(({ job, subjectCode }) => toCommAiJob(job, subjectCode))
  }

  dismissFinished(who: Actor): Promise<void> {
    return this.jobs.dismissFinished(who.id)
  }
}

function toCommAiJob(job: CommAiJobRowDb, subjectCode: string): CommAiJob {
  return {
    id: job.id,
    debriefId: job.debriefId,
    subjectCode,
    part: job.part,
    state: job.state,
    step: job.step,
    stepMs: job.stepMs,
    errorKind: job.errorKind,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  }
}

const toDetail = (job: CommAiJobRowDb, subjectCode: string): CommAiJobDetail => ({
  ...toCommAiJob(job, subjectCode),
  note: job.note,
  report: job.result,
})
