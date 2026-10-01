import { z } from 'zod'
import { PageQuery, paged } from '../pagination'
import { Day, Moment, ObjectCode, textInput } from '../primitives'
import { ConfigCode } from '../sales/config'
import { NextStepDoneBody, NextStepKind, NextStepSetBody } from '../sales/next-step'
import { TouchSubject } from '../sales/touch'
import { LinkableCode } from './identity'
import { DebriefId, DebriefState, MessageId, ThreadId, ThreadRow } from './thread'

/** Comm close-out — the owner's summary, evaluation and next step on a comm.
 *
 *      GET  /comms/debriefs/pending    `comm.view` · my open debriefs, paged
 *      GET  /comms/debriefs/counts     `comm.view` · pending per owner (`ownOnly` → own row)
 *      POST /comms/debriefs/:id/close  `comm.view` · owner only
 *
 *  `POST /comms/messages` opens or joins the debrief (`MessageCreateResponse.debriefId`).
 *  Config ids (`COMM_CRITERION` · `COMM_ANSWER` · `STEP_KIND`) are stored by comms
 *  as plain text with name copies, so renaming or disabling an entry never
 *  rewrites a closed debrief. The step goes through the sales hook, which is why
 *  its shape is borrowed from `NextStepSetBody` rather than restated. */

export const DEBRIEF_SUMMARY_MAX = 4000

// ---------------------------------------------------------------------------
// POST /comms/debriefs/:id/close
// ---------------------------------------------------------------------------

export const DebriefAnswerInput = z.object({ criterionId: ConfigCode, answerId: ConfigCode })

/** Kind required here, unlike the step card. `previousDone` names the step the
 *  closer saw, so it takes the existing done path (`closing`) under the lock. */
export const DebriefStepInput = NextStepSetBody.extend({
  subjectCode: ObjectCode,
  kindId: ConfigCode,
  previousDone: NextStepDoneBody.shape.closing.optional(),
})

/** `step` is absent exactly when the comm has no step target (contracts, closed
 *  objects); that rule needs the branch's targets, so the sales hook judges it. */
export const DebriefClose = z.object({
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
export const DebriefStepCopy = z.object({
  subjectCode: ObjectCode,
  kind: NextStepKind,
  text: z.string().min(1),
  due: Day,
})

export const DebriefView = z.object({
  id: DebriefId,
  threadId: ThreadId,
  /** The anchor — moves to the newest turn while the debrief is open. */
  messageId: MessageId,
  state: DebriefState,
  owner: z.object({ id: z.string().min(1).max(64), name: z.string().min(1) }),
  createdAt: Moment,
  closedAt: Moment.nullable(),
  summary: DebriefSummary,
  answers: z.array(DebriefAnswer),
  step: DebriefStepCopy.nullable(),
})

// ---------------------------------------------------------------------------
// GET /comms/debriefs/pending
// ---------------------------------------------------------------------------

/** A linked object that can take the step from this caller. `currentStep` is
 *  what the form offers to mark done; `null` means there is nothing to close. */
export const DebriefStepTarget = z.object({
  code: ObjectCode,
  kind: TouchSubject,
  currentStep: NextStepDoneBody.shape.closing.nullable(),
})

export const PendingDebriefQuery = PageQuery

export const PendingDebriefRow = z.object({
  id: DebriefId,
  thread: ThreadRow,
  anchorMessageId: MessageId,
  anchorAt: Moment,
  turnsCovered: z.number().int().positive(),
  linkedCodes: z.array(LinkableCode),
  stepTargets: z.array(DebriefStepTarget),
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

export type DebriefAnswerInput = z.infer<typeof DebriefAnswerInput>
export type DebriefStepInput = z.infer<typeof DebriefStepInput>
export type DebriefClose = z.infer<typeof DebriefClose>
export type DebriefSummary = z.infer<typeof DebriefSummary>
export type DebriefAnswer = z.infer<typeof DebriefAnswer>
export type DebriefStepCopy = z.infer<typeof DebriefStepCopy>
export type DebriefView = z.infer<typeof DebriefView>
export type DebriefStepTarget = z.infer<typeof DebriefStepTarget>
export type PendingDebriefQuery = z.infer<typeof PendingDebriefQuery>
export type PendingDebriefRow = z.infer<typeof PendingDebriefRow>
export type PendingDebriefResponse = z.infer<typeof PendingDebriefResponse>
export type DebriefCountRow = z.infer<typeof DebriefCountRow>
export type DebriefCountsResponse = z.infer<typeof DebriefCountsResponse>
