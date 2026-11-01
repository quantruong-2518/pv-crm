import { z } from 'zod'
import { textInputOptional } from '../primitives'
import { ConfigCode } from '../sales/config'
import { NEXT_STEP_TEXT_MAX, NextStepKind, StepTemplateId } from '../sales/next-step'
import { StepTemplateOption } from '../sales/step-frame'
import { DEBRIEF_SUMMARY_MAX, DEBRIEF_TITLE_MAX } from './debrief'

/** AI report of one open comm (ADR 0132).
 *
 *      GET  /comms/debriefs/ai-report       `comm.view` · whether the route is on for the caller
 *      POST /comms/debriefs/:id/ai-report   `comm.view` + `comm.view-content`, the close gate · 200
 *
 *  A proposal, never a write: nothing here is stored, and each part reaches the
 *  record only through the person's own press and the existing close door.
 *  `note` is what is typed in the form now, because the draft lives in the
 *  browser until confirm. */

/** Off until the route is switched on: the buttons stay hidden rather than refuse. */
export const CommAiReportStatus = z.object({ available: z.boolean() })
export type CommAiReportStatus = z.infer<typeof CommAiReportStatus>

export const CommAiReportBody = z.object({ note: textInputOptional(DEBRIEF_SUMMARY_MAX) })
export type CommAiReportBody = z.infer<typeof CommAiReportBody>

/** Ids are checked against the live vocabulary; a row that fails is dropped. */
export const CommAiAnswer = z.object({
  criterionId: ConfigCode,
  criterionName: z.string().min(1),
  answerId: ConfigCode,
  answerName: z.string().min(1),
})
export type CommAiAnswer = z.infer<typeof CommAiAnswer>

/** `templateId` absent = typed words, offered only where the state allows free entry. */
export const CommAiStep = z.object({
  templateId: StepTemplateId.optional(),
  kind: NextStepKind,
  text: z.string().min(1).max(NEXT_STEP_TEXT_MAX),
  dueDays: StepTemplateOption.shape.dueDays,
  /** The model's words for why, shown as part of the proposal and never as the basis line. */
  reason: z.string().min(1),
})
export type CommAiStep = z.infer<typeof CommAiStep>

export const COMM_AI_MAX_STEPS = 3

/** What the model actually read: the law 9 basis line is drawn from these
 *  counts, not from anything the model says about itself. */
export const CommAiSources = z.object({
  note: z.boolean(),
  turns: z.number().int().nonnegative(),
  files: z.array(z.string().min(1)),
  /** Names of files left out: recordings, or past the per-press file cap. */
  unread: z.array(z.string().min(1)),
})
export type CommAiSources = z.infer<typeof CommAiSources>

export const CommAiReport = z.object({
  /** Null on a booked meeting, which keeps no title of its own. */
  title: z.string().min(1).max(DEBRIEF_TITLE_MAX).nullable(),
  summary: z.string().min(1).max(DEBRIEF_SUMMARY_MAX),
  /** Minutes as plain text, ready to edit and to save as a file. */
  minutes: z.string().min(1),
  answers: z.array(CommAiAnswer),
  steps: z.array(CommAiStep).max(COMM_AI_MAX_STEPS),
  sources: CommAiSources,
})
export type CommAiReport = z.infer<typeof CommAiReport>
