import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  CommAiReportStatus,
  TRANSCRIPT_MAX,
  type AiUnavailableReason,
  type CommAiReport,
  type CommAiReportBody,
} from '@pv/contracts'
import { AiCallError, AiUnavailableError } from '@api/platform/ai/ai-errors'
import type { AiPart } from '@api/platform/ai/ai-client'
import { AiGateway, type AiCaller } from '@api/platform/ai/ai-gateway'
import {
  COMM_REPORT,
  CommReportModelOutput,
  reportParts,
} from '@api/platform/ai/prompts/comm-report.prompts'
import { renderPrompt } from '@api/platform/ai/prompts/prompt-spec'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, rateLimited } from '@api/platform/http/problem'
import { StorageService } from '@api/platform/storage/storage.service'
import { CommAttachmentRepository } from './comm-attachment.repository'
import { COMM_DEBRIEF_HOOK, unconfirmable, type CommDebriefHook } from './comm-debrief.hook'
import { isAudio, partOf } from './comm-report.files'
import { judgeReport } from './comm-report.judge'
import { toObjectRef } from './comms.mapper'
import { DebriefRepository, type DebriefRead } from './debrief.repository'
import { DebriefService } from './debrief.service'
import { ThreadRepository } from './thread.repository'
import { ThreadService } from './thread.service'

/** One press, one model call, one whole report of an open comm (ADR 0132).
 *
 *  A proposal: this service writes no row but the audit line, and each part
 *  reaches the record through the person's press and the close door. The answer
 *  carries the thread's content, so the gate refuses whoever the close door or
 *  the thread's own read would refuse (`gate`).
 *
 *  Turns and files are untrusted customer content: they travel inside the data
 *  block only (`reportParts`), and `judgeReport` decides what of the answer
 *  survives. Logs and the audit line carry counts and error classes, never
 *  content or a file name. No transaction: the call is held open for seconds. */

const MAX_FILES = 5
const PAST_SUMMARIES = 3
/* Per press: the route sets no token ceiling, so these bound what one press sends. */
const MAX_TEXT_CHARS = TRANSCRIPT_MAX
/* Per press, on all its files: files go inline, and 15 MB is about 20 MB of base64. */
const MAX_FILE_BYTES = 10 * 1024 * 1024
/* Fly's proxy drops a silent connection at about 60 s; no attempt may outlive this. */
const PRESS_DEADLINE_MS = 55_000

const VN_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'short',
  timeStyle: 'short',
})

const VN_DAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'short',
})

type Files = {
  texts: { name: string; text: string }[]
  parts: { name: string; part: AiPart }[]
  unread: string[]
  /** A recording is attached: it can be the reason nothing was readable. */
  recording: boolean
}

@Injectable()
export class CommReportService {
  private readonly log = new Logger('CommReport')

  constructor(
    private readonly records: DebriefService,
    private readonly debriefs: DebriefRepository,
    private readonly threads: ThreadRepository,
    private readonly threadDoor: ThreadService,
    private readonly attachments: CommAttachmentRepository,
    private readonly storage: StorageService,
    private readonly ai: AiGateway,
    private readonly audit: AuditRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
    @Optional() @Inject(COMM_DEBRIEF_HOOK) private readonly hook?: CommDebriefHook,
  ) {}

  /** Asked fresh on every read; the screen holds the answer for its cache tier. */
  async status(who: Actor): Promise<CommAiReportStatus> {
    try {
      await this.ai.check('comm-report', who.id)
      return CommAiReportStatus.parse({ available: true })
    } catch (error) {
      if (error instanceof AiUnavailableError) return CommAiReportStatus.parse({ available: false })
      throw error
    }
  }

  async report(who: Actor, id: string, body: CommAiReportBody): Promise<CommAiReport> {
    const deadlineAt = Date.now() + PRESS_DEADLINE_MS
    const hook = this.hook
    if (!hook) throw new Error('comms: COMM_DEBRIEF_HOOK is not bound; no subject to report on')
    const found = await this.gate(who, id, hook)
    await this.ai.check('comm-report', who.id).catch((error: unknown) => {
      throw refusal(error)
    })

    const covered = (await this.threads.messagesOf(found.row.threadId)).filter(
      (m) => m.createdAt >= found.row.createdAt,
    )
    const turns = latestTurns(covered)
    const files = await this.readFiles(id)
    if (!body.note && turns.length === 0 && files.texts.length + files.parts.length === 0) {
      throw conflict(
        files.recording
          ? 'AI chưa nghe được ghi âm. Ghi chú hoặc tải tệp chữ lên trước.'
          : 'Chưa có gì để AI đọc. Ghi chú hoặc tải tệp lên trước.',
      )
    }

    const { row, thread } = found
    const meetingId = row.booked && thread.channel === 'meeting' ? thread.externalId : null
    const context = await hook.reportContext(who, row.subjectCode, meetingId)
    const earlier = await this.earlierSummaries(who, found)
    const { subject, meeting, step, vocabulary } = context
    const lists = {
      criteria: vocabulary.criteria,
      takesStep: step !== null,
      freeEntry: step?.freeEntry ?? false,
      stepTemplates: step?.templates ?? [],
      stepKinds: step?.freeEntry ? vocabulary.stepKinds : [],
    }
    const data = {
      today: VN_DAY.format(new Date()),
      subject: { code: row.subjectCode, ...subject },
      channel: thread.channel,
      meeting: meeting && { ...meeting, at: VN_TIME.format(meeting.at) },
      openNextStep: context.openStep,
      note: body.note ?? null,
      turns: turns.map((m) => ({
        at: VN_TIME.format(m.at),
        from: m.direction === 'in' ? 'customer' : 'team',
        text: m.bodyText,
      })),
      earlierSummaries: earlier,
      fileTexts: files.texts,
      attachedFiles: files.parts.map((f) => f.name),
    }
    const parts = reportParts(
      lists,
      data,
      files.parts.map((f) => f.part),
    )

    /* Last before the call and after `check`: a refused press leaves no line, and a
       call that fails may still have sent this content to a vendor. */
    await this.audit.write({
      actorId: who.id,
      action: 'ai-read',
      code: row.subjectCode,
      note: `comms.debrief ${id} · AI report · note ${body.note ? 1 : 0} · ${turns.length} turn(s) · ${files.texts.length + files.parts.length} file(s) · ${files.unread.length} unread · ${earlier.length} past summary(ies)`,
    })
    const model = await this.ask(parts, {
      actorId: who.id,
      subjectCode: row.subjectCode,
      deadlineAt,
    })
    const report = judgeReport(model, context, row.booked, {
      note: !!body.note,
      turns: turns.length,
      files: [...files.texts, ...files.parts].map((f) => f.name),
      unread: files.unread,
    })
    if (!report) throw busy()
    return report
  }

  /** The doors this answer stands in for: the close gate, the content right, the
   *  thread's own read and the close's `unconfirmable`. `closable` alone lets an
   *  owner past reach so a hand-over cannot strand their record, which is no
   *  ground to hand them what those doors refuse them. */
  private async gate(who: Actor, id: string, hook: CommDebriefHook): Promise<DebriefRead> {
    const found = await this.records.closable(who, id)
    const { threadId, subjectCode } = found.row
    if (!this.access.allows(who, 'comm.view-content')) {
      throw denied(
        'permission-denied',
        'Bạn không xem được nội dung liên hệ nên không dùng được AI.',
      )
    }
    await this.threadDoor.refuseUnreachableThread(who, threadId)
    if (!(await hook.slot(who, subjectCode)).confirmable) throw unconfirmable(subjectCode)
    return found
  }

  private async ask(parts: AiPart[], who: AiCaller) {
    try {
      const request = { ...renderPrompt(COMM_REPORT), parts, effort: 'low' as const }
      return (await this.ai.run('comm-report', request, CommReportModelOutput, who)).value
    } catch (error) {
      throw error instanceof AiCallError ? busy() : refusal(error)
    }
  }

  /** In declared order. Both caps count a read when it is tried, not when it
   *  succeeds, and `row.bytes` is checked before the download: they bound what one
   *  press pulls into memory, whatever the files turn out to hold. */
  private async readFiles(id: string): Promise<Files> {
    const files: Files = { texts: [], parts: [], unread: [], recording: false }
    let chars = 0
    let bytes = 0
    let reads = 0
    for (const { row } of await this.attachments.listOf(id)) {
      files.recording ||= isAudio(row.mime)
      const tried = !isAudio(row.mime) && reads < MAX_FILES && bytes + row.bytes <= MAX_FILE_BYTES
      if (tried) {
        reads += 1
        bytes += row.bytes
      }
      const part = tried ? await this.readFile(row) : null
      if (part && 'text' in part && chars + part.text.length <= MAX_TEXT_CHARS) {
        chars += part.text.length
        files.texts.push({ name: row.name, text: part.text })
      } else if (part && 'file' in part) files.parts.push({ name: row.name, part })
      else files.unread.push(row.name)
    }
    return files
  }

  /** Any failure, not only a missing object: the rest of the record still reads. */
  private async readFile(row: { storageKey: string; mime: string }): Promise<AiPart | null> {
    try {
      return partOf(row.mime, await this.storage.read(row.storageKey))
    } catch (error) {
      const kind = error instanceof Error ? error.name : 'unknown'
      this.log.warn(`comm report: ${row.mime} file left unread — ${kind}`)
      return null
    }
  }

  /** A thread can hang on several objects, so `gate`'s reach is not reach on this
   *  subject. Without `view` on it only the caller's own records stay in, the line
   *  `DebriefService.list` draws with a 403. */
  private async earlierSummaries(who: Actor, found: DebriefRead) {
    const { id, subjectCode } = found.row
    const subject = await this.threads.objectByCode(subjectCode)
    const reach =
      !!subject && this.access.check(who, { ref: toObjectRef(subject), action: 'view' }).ok
    return (await this.debriefs.bySubject(subjectCode))
      .filter((r) => r.row.id !== id && r.state === 'done' && (reach || r.row.ownerId === who.id))
      .flatMap(({ row }) =>
        row.summary && row.closedAt
          ? [{ at: VN_TIME.format(row.closedAt), text: row.summary }]
          : [],
      )
      .slice(0, PAST_SUMMARIES)
  }
}

/** Newest first as read, oldest first as sent: a long thread keeps its latest turns. */
function latestTurns<T extends { bodyText: string | null }>(messages: readonly T[]): T[] {
  let chars = 0
  const kept: T[] = []
  for (const message of messages) {
    const size = message.bodyText?.trim().length ?? 0
    if (size === 0) continue
    if (chars + size > MAX_TEXT_CHARS) break
    chars += size
    kept.push(message)
  }
  return kept.reverse()
}

/** 429, not `BusyError`: the web answers a 503 with its full-screen outage overlay,
 *  which would hide this sentence and the form behind it. */
const busy = () => rateLimited('AI đang bận. Thử lại sau ít phút.')

/** Any other error comes back as it went in. */
const refusal = (error: unknown): unknown =>
  error instanceof AiUnavailableError ? REFUSED[error.reason]() : error

/** The scan and fill split: off is a setting (409), a limit passes on its own (429). */
const REFUSED: Record<AiUnavailableReason, () => Error> = {
  disabled: () => conflict('Chưa bật AI báo cáo. Báo quản trị viên.'),
  'no-key': () => conflict('Chưa bật AI báo cáo. Báo quản trị viên.'),
  'user-limit': () => rateLimited('Bạn đã hết lượt AI báo cáo trong 24 giờ qua. Thử lại sau.'),
  budget: () => rateLimited('Đã hết hạn mức AI báo cáo trong 24 giờ qua. Thử lại sau.'),
}
