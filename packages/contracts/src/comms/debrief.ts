import { z } from 'zod'
import { PageQuery, paged } from '../pagination'
import { Day, Moment, ObjectCode, textInput, textInputOptional } from '../primitives'
import { ConfigCode } from '../sales/config'
import { NextStepDoneBody, NextStepKind, NextStepSetBody } from '../sales/next-step'
import { TouchSubject } from '../sales/touch'
import { CommsChannel, LinkableCode } from './identity'
import { CommRecordState, DebriefId, MessageId, ThreadChannel, ThreadId, ThreadRow } from './thread'

/** Comm record — one comm, its fixed subject, and the owner's close-out (ADR 0074, 0075).
 *
 *      POST /comms/debriefs                  `comm.view` + reach on subject · 201, empty record
 *      GET  /comms/debriefs?subjectCode= | workstreamCode=  `comm.view` + reach · comm timeline of one object or run
 *      GET  /comms/debriefs/target           `comm.view` + reach · what a new comm would ask, no write
 *      GET  /comms/debriefs/pending          `comm.view` · my open records (`workstreamCode` narrows)
 *      GET  /comms/debriefs/counts           `comm.view` · pending per owner (`ownOnly` → own row)
 *      GET  /comms/debriefs/:id              `comm.view` + reach · one record
 *      POST /comms/debriefs/:id/close        `comm.view` · owner only (the confirm button)
 *
 *  `POST /comms/messages` opens or joins a debrief too (`MessageCreateResponse.debriefId`).
 *  Config ids are stored with name copies, so renaming an entry never rewrites a
 *  closed debrief. The step lands on the subject through the sales hook, which
 *  is why its shape is borrowed from `NextStepSetBody` rather than restated. */

export const DEBRIEF_SUMMARY_MAX = 2000
export const DEBRIEF_TITLE_MAX = 120

// ---------------------------------------------------------------------------
// POST /comms/debriefs — the call / Zalo / mail action buttons
// ---------------------------------------------------------------------------

/** The three channels a button can open; the web opens tel:/Zalo/mail only after 201. */
export const CommActionChannel = CommsChannel.extract(['phone', 'zalo-oa', 'email'])

/** `contactCode` absent = the lead's own contact person, who has no `sales.contact` row.
 *  No text here: what was said is stored once, as the confirm summary. */
export const CommRecordCreateBody = z.object({
  channel: CommActionChannel,
  subjectCode: LinkableCode,
  contactCode: ObjectCode.optional(),
})

export const CommRecordCreateResponse = z.object({ debriefId: DebriefId, threadId: ThreadId })

// ---------------------------------------------------------------------------
// POST /comms/debriefs/:id/close
// ---------------------------------------------------------------------------

export const DebriefAnswerInput = z.object({ criterionId: ConfigCode, answerId: ConfigCode })

/** No target code: the step always lands on the debrief's subject. Kind is
 *  required here, unlike the step card; `previousDone` names the step the
 *  closer saw, so it takes the existing done path (`closing`) under the lock. */
export const DebriefStepInput = NextStepSetBody.extend({
  kindId: ConfigCode,
  previousDone: NextStepDoneBody.shape.closing.optional(),
})

/** `step` is absent exactly when the subject takes none (contracts, closed
 *  objects); that rule needs the branch, so the sales hook judges it. */
export const DebriefClose = z.object({
  /** Optional: the mobile log has no title step; the desktop form asks for one. */
  title: textInputOptional(DEBRIEF_TITLE_MAX),
  summary: textInput(DEBRIEF_SUMMARY_MAX),
  answers: z
    .array(DebriefAnswerInput)
    .refine((a) => new Set(a.map((x) => x.criterionId)).size === a.length, {
      message: 'Mỗi câu hỏi chỉ chọn một câu trả lời',
    }),
  step: DebriefStepInput.optional(),
})

// ---------------------------------------------------------------------------
// THE READ SHAPE — also the close response
// ---------------------------------------------------------------------------

/** Summary is content, so it splits like `MessageContent`: a `comm.view` reader
 *  without `comm.view-content` gets `hidden`; an open debrief has `none`. */
export const DebriefSummary = z.discriminatedUnion('state', [
  z.object({ state: z.literal('none') }),
  z.object({ state: z.literal('hidden') }),
  z.object({ state: z.literal('visible'), text: textInput(DEBRIEF_SUMMARY_MAX) }),
])

export const DebriefAnswer = z.object({
  criterionId: ConfigCode,
  criterionName: z.string().min(1),
  answerId: ConfigCode,
  answerName: z.string().min(1),
})

/** The step as it was set — a copy, because `sales.next_step` is replaced later. */
export const DebriefStepCopy = z.object({ kind: NextStepKind, text: z.string().min(1), due: Day })

/** The one object the comm belongs to, fixed at creation; `label` is the
 *  `platform.object` display name. */
export const DebriefSubject = z.object({ code: LinkableCode, label: z.string().min(1) })

/** Present only while the subject can take a step from this caller (an open
 *  lead or opportunity). `currentStep` is what the form offers to mark done. */
export const DebriefStepTarget = z.object({
  kind: TouchSubject,
  currentStep: NextStepDoneBody.shape.closing.nullable(),
})

/** GET /comms/debriefs/target?subjectCode= — what a new comm on this subject
 *  would ask, read before anything is written. `confirmable` false = the caller
 *  could not confirm it (open subject, no right to set its step), so create is refused. */
export const DebriefTargetQuery = z.object({ subjectCode: LinkableCode })
export const DebriefTargetResponse = z.object({
  stepTarget: DebriefStepTarget.nullable(),
  confirmable: z.boolean(),
})

/** Also the contact-history timeline row: channel, when, summary, state, step. */
export const DebriefView = z.object({
  id: DebriefId,
  threadId: ThreadId,
  channel: ThreadChannel,
  /** The anchor — moves to the newest turn while the debrief is open. */
  messageId: MessageId,
  state: CommRecordState,
  late: z.boolean(),
  subject: DebriefSubject,
  stepTarget: DebriefStepTarget.nullable(),
  owner: z.object({ id: z.string().min(1).max(64), name: z.string().min(1) }),
  createdAt: Moment,
  closedAt: Moment.nullable(),
  /** Plain label, not content: no view right gates it. NULL on a record closed before 0077. */
  title: z.string().min(1).max(DEBRIEF_TITLE_MAX).nullable(),
  summary: DebriefSummary,
  answers: z.array(DebriefAnswer),
  step: DebriefStepCopy.nullable(),
})

/** `summary=none`: a visible summary arrives as `hidden` and no read is audited —
 *  for screens that only count or map comms, never show what was said. */
export const DebriefListQuery = z
  .object({
    subjectCode: LinkableCode.optional(),
    /** Every subject of one sales run: its lead, deals and contract. */
    workstreamCode: ObjectCode.optional(),
    summary: z.enum(['none']).optional(),
  })
  .refine((q) => (q.subjectCode === undefined) !== (q.workstreamCode === undefined), {
    message: 'Pass exactly one of subjectCode and workstreamCode.',
  })

/** Not paged: scoped to one object or one run, the bound `ThreadListResponse` relies on. */
export const DebriefListResponse = z.object({ rows: z.array(DebriefView) })

// ---------------------------------------------------------------------------
// GET /comms/debriefs/pending — the "my comms" queue and step 2 of the manual log flow
// ---------------------------------------------------------------------------

export const PendingDebriefQuery = PageQuery.extend({ workstreamCode: ObjectCode.optional() })

export const PendingDebriefRow = z.object({
  id: DebriefId,
  thread: ThreadRow,
  anchorMessageId: MessageId,
  anchorAt: Moment,
  createdAt: Moment,
  turnsCovered: z.number().int().positive(),
  state: CommRecordState.exclude(['done']),
  late: z.boolean(),
  subject: DebriefSubject,
  stepTarget: DebriefStepTarget.nullable(),
})

export const PendingDebriefResponse = paged(PendingDebriefRow)

// ---------------------------------------------------------------------------
// GET /comms/debriefs/counts
// ---------------------------------------------------------------------------

/** An owner with nothing pending is absent, not a zero row. Not paged: one row
 *  per person in reach is bounded by headcount. */
export const DebriefCountRow = z.object({
  ownerId: z.string().min(1).max(64),
  name: z.string().min(1),
  pending: z.number().int().positive(),
  oldestAt: Moment,
})

export const DebriefCountsResponse = z.object({ rows: z.array(DebriefCountRow) })

export type CommActionChannel = z.infer<typeof CommActionChannel>
export type CommRecordCreateBody = z.infer<typeof CommRecordCreateBody>
export type CommRecordCreateResponse = z.infer<typeof CommRecordCreateResponse>
export type DebriefAnswerInput = z.infer<typeof DebriefAnswerInput>
export type DebriefStepInput = z.infer<typeof DebriefStepInput>
export type DebriefClose = z.infer<typeof DebriefClose>
export type DebriefSummary = z.infer<typeof DebriefSummary>
export type DebriefAnswer = z.infer<typeof DebriefAnswer>
export type DebriefStepCopy = z.infer<typeof DebriefStepCopy>
export type DebriefSubject = z.infer<typeof DebriefSubject>
export type DebriefStepTarget = z.infer<typeof DebriefStepTarget>
export type DebriefTargetQuery = z.infer<typeof DebriefTargetQuery>
export type DebriefTargetResponse = z.infer<typeof DebriefTargetResponse>
export type DebriefView = z.infer<typeof DebriefView>
export type DebriefListQuery = z.infer<typeof DebriefListQuery>
export type DebriefListResponse = z.infer<typeof DebriefListResponse>
export type PendingDebriefQuery = z.infer<typeof PendingDebriefQuery>
export type PendingDebriefRow = z.infer<typeof PendingDebriefRow>
export type PendingDebriefResponse = z.infer<typeof PendingDebriefResponse>
export type DebriefCountRow = z.infer<typeof DebriefCountRow>
export type DebriefCountsResponse = z.infer<typeof DebriefCountsResponse>
