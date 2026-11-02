import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  CommAiReportStatus,
  TRANSCRIPT_MAX,
  type AiTask,
  type AiUnavailableReason,
  type CommAiReport,
  type CommAiReportBody,
  type CommAiSources,
} from '@pv/contracts'
import { AiCallError, AiUnavailableError } from '@api/platform/ai/ai-errors'
import type { AiPart } from '@api/platform/ai/ai-client'
import { AiGateway, type AiCaller } from '@api/platform/ai/ai-gateway'
import {
  COMM_AUDIO_REPORT,
  COMM_REPORT,
  CommReportModelOutput,
  reportParts,
} from '@api/platform/ai/prompts/comm-report.prompts'
import { renderPrompt } from '@api/platform/ai/prompts/prompt-spec'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, rateLimited } from '@api/platform/http/problem'
import type { AttachmentRowDb } from '@api/platform/storage/attachment.schema'
import { StorageService } from '@api/platform/storage/storage.service'
import { CommAttachmentRepository } from './comm-attachment.repository'
import {
  COMM_DEBRIEF_HOOK,
  unconfirmable,
  type CommDebriefHook,
  type CommReportContext,
} from './comm-debrief.hook'
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
 *  content or a file name. No transaction: the call is held open for seconds.
 *
 *  A record with a recording is heard by a job instead (ADR 0135): the runner
 *  calls `prepareListening`, then `listen`, on the sources this door reads too. */

export const NO_RECORDING = 'Liên hệ này chưa có ghi âm.'

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
  /** The one recording a listening job sends; null on the synchronous door. */
  heard: AttachmentRowDb | null
}

type Turn = Awaited<ReturnType<ThreadRepository['messagesOf']>>[number]
type Sources = { note: string | undefined; turns: Turn[]; files: Files }

/** One call's input but the recording's bytes, and what the audit line counts. */
type Brief = {
  found: DebriefRead
  context: CommReportContext
  lists: object
  data: object
  fileParts: AiPart[]
  sources: CommAiSources
  fileCount: number
  earlier: number
}

/** `prepareListening`'s answer, held for the one call that follows it. */
export type Listening = { brief: Brief; recording: { mime: string; bytes: Buffer } }

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
    const available = await this.routeOn('comm-report', who)
    const recording = await this.routeOn('comm-audio-report', who)
    return CommAiReportStatus.parse({ available, recording })
  }

  private async routeOn(task: AiTask, who: Actor): Promise<boolean> {
    try {
      await this.ai.check(task, who.id)
      return true
    } catch (error) {
      if (error instanceof AiUnavailableError) return false
      throw error
    }
  }

  async report(who: Actor, id: string, body: CommAiReportBody): Promise<CommAiReport> {
    const deadlineAt = Date.now() + PRESS_DEADLINE_MS
    const found = await this.gate(who, id)
    await this.ai.check('comm-report', who.id).catch((error: unknown) => {
      throw refusal(error)
    })

    const sources = await this.readSources(found, body.note, false)
    const { turns, files } = sources
    if (!body.note && turns.length === 0 && files.texts.length + files.parts.length === 0) {
      throw conflict(
        files.recording
          ? 'AI chưa nghe được ghi âm. Ghi chú hoặc tải tệp chữ lên trước.'
          : 'Chưa có gì để AI đọc. Ghi chú hoặc tải tệp lên trước.',
      )
    }

    const brief = await this.assemble(who, found, sources)
    const parts = reportParts(brief.lists, brief.data, brief.fileParts)
    await this.trailRead(who, brief)
    const { row } = found
    const model = await this.ask(parts, {
      actorId: who.id,
      subjectCode: row.subjectCode,
      deadlineAt,
    })
    const report = judgeReport(model, brief.context, row.booked, brief.sources)
    if (!report) throw busy()
    return report
  }

  /** The job's read-sources step, after the same gate as the press. The largest
   *  audio file is the one recording (vendor docs disagree on several per prompt);
   *  its bytes are read last, so a record that fails above holds no memory. */
  async prepareListening(who: Actor, id: string, note: string | undefined): Promise<Listening> {
    const found = await this.gate(who, id)
    const sources = await this.readSources(found, note, true)
    const { heard } = sources.files
    if (!heard) throw conflict(NO_RECORDING)
    const brief = await this.assemble(who, found, sources)
    const bytes = await this.storage.read(heard.storageKey)
    return { brief, recording: { mime: heard.mime, bytes } }
  }

  /** The job's one model call. Raw gateway errors on purpose: the runner decides
   *  from them, and the 429s are for a person waiting on a request. Null = nothing
   *  usable survived `judgeReport`. Admitted at the press: never cut by a quota. */
  async listen(who: Actor, { brief, recording }: Listening): Promise<CommAiReport | null> {
    const { row } = brief.found
    const parts = reportParts(brief.lists, brief.data, [...brief.fileParts, { recording }])
    await this.trailRead(who, brief, ' · 1 recording')
    /* Medium, not low: on a 2-hour meeting low dropped whole topics and every open point. */
    const request = { ...renderPrompt(COMM_AUDIO_REPORT), parts, effort: 'medium' as const }
    const caller = {
      actorId: who.id,
      subjectCode: row.subjectCode,
      admitted: true,
      oneAttempt: true,
    }
    const { value } = await this.ai.run('comm-audio-report', request, CommReportModelOutput, caller)
    return judgeReport(value, brief.context, row.booked, brief.sources)
  }

  /** Last before the call and after `check`: a refused press leaves no line, and a
   *  call that fails may still have sent this content to a vendor. */
  private async trailRead(who: Actor, brief: Brief, recording = ''): Promise<void> {
    const { found, sources, fileCount, earlier } = brief
    await this.audit.write({
      actorId: who.id,
      action: 'ai-read',
      code: found.row.subjectCode,
      note: `comms.debrief ${found.row.id} · AI report · note ${sources.note ? 1 : 0} · ${sources.turns} turn(s) · ${fileCount} file(s) · ${sources.unread.length} unread · ${earlier} past summary(ies)${recording}`,
    })
  }

  private async readSources(
    found: DebriefRead,
    note: string | undefined,
    listening: boolean,
  ): Promise<Sources> {
    const covered = (await this.threads.messagesOf(found.row.threadId)).filter(
      (m) => m.createdAt >= found.row.createdAt,
    )
    return {
      note,
      turns: latestTurns(covered),
      files: await this.readFiles(found.row.id, listening),
    }
  }

  private async assemble(who: Actor, found: DebriefRead, sources: Sources): Promise<Brief> {
    const { note, turns, files } = sources
    const { row, thread } = found
    const meetingId = row.booked && thread.channel === 'meeting' ? thread.externalId : null
    const context = await this.boundHook().reportContext(who, row.subjectCode, meetingId)
    const earlier = await this.earlierSummaries(who, found)
    const { subject, meeting, step, vocabulary } = context
    const lists = {
      criteria: vocabulary.criteria,
      takesStep: step !== null,
      freeEntry: step?.freeEntry ?? false,
      stepTemplates: step?.templates ?? [],
      stepKinds: step?.freeEntry ? vocabulary.stepKinds : [],
    }
    const heardName = files.heard ? [files.heard.name] : []
    const data = {
      today: VN_DAY.format(new Date()),
      subject: { code: row.subjectCode, ...subject },
      channel: thread.channel,
      meeting: meeting && { ...meeting, at: VN_TIME.format(meeting.at) },
      openNextStep: context.openStep,
      note: note ?? null,
      turns: turns.map((m) => ({
        at: VN_TIME.format(m.at),
        from: m.direction === 'in' ? 'customer' : 'team',
        text: m.bodyText,
      })),
      earlierSummaries: earlier,
      fileTexts: files.texts,
      attachedFiles: [...files.parts.map((f) => f.name), ...heardName],
    }
    const fileNames = [...files.texts, ...files.parts].map((f) => f.name)
    return {
      found,
      context,
      lists,
      data,
      fileParts: files.parts.map((f) => f.part),
      sources: {
        note: !!note,
        turns: turns.length,
        files: [...fileNames, ...heardName],
        unread: files.unread,
      },
      fileCount: fileNames.length,
      earlier: earlier.length,
    }
  }

  private boundHook(): CommDebriefHook {
    if (this.hook) return this.hook
    throw new Error('comms: COMM_DEBRIEF_HOOK is not bound; no subject to report on')
  }

  /** The doors this answer stands in for: the close gate, the content right, the
   *  thread's own read and the close's `unconfirmable`. `closable` alone lets an
   *  owner past reach so a hand-over cannot strand their record, which is no
   *  ground to hand them what those doors refuse them. */
  async gate(who: Actor, id: string): Promise<DebriefRead> {
    const hook = this.boundHook()
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
  private async readFiles(id: string, listening: boolean): Promise<Files> {
    const rows = (await this.attachments.listOf(id)).map((r) => r.row)
    const heard = listening ? largestAudio(rows) : null
    const files: Files = { texts: [], parts: [], unread: [], recording: false, heard }
    let chars = 0
    let bytes = 0
    let reads = 0
    for (const row of rows) {
      if (row === heard) continue
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

const largestAudio = (rows: readonly AttachmentRowDb[]): AttachmentRowDb | null =>
  rows
    .filter((row) => isAudio(row.mime))
    .reduce<AttachmentRowDb | null>(
      (best, row) => (best && best.bytes >= row.bytes ? best : row),
      null,
    )

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
export const refusal = (error: unknown): unknown =>
  error instanceof AiUnavailableError ? REFUSED[error.reason]() : error

/** The scan and fill split: off is a setting (409), a limit passes on its own (429). */
export const REFUSED: Record<AiUnavailableReason, () => Error> = {
  disabled: () => conflict('Chưa bật AI báo cáo. Báo quản trị viên.'),
  'no-key': () => conflict('Chưa bật AI báo cáo. Báo quản trị viên.'),
  'user-limit': () => rateLimited('Bạn đã hết lượt AI báo cáo trong 24 giờ qua. Thử lại sau.'),
  budget: () => rateLimited('Đã hết hạn mức AI báo cáo trong 24 giờ qua. Thử lại sau.'),
}
