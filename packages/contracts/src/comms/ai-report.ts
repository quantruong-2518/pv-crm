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
 *  A recording takes minutes of model time, so it goes through a job (ADR 0135):
 *
 *      POST   /comms/debriefs/:id/ai-report/job   the same gate · 202 `CommAiJob`
 *      GET    /comms/debriefs/:id/ai-report/job   the same gate · the caller's latest job here
 *      GET    /comms/ai-jobs                      `comm.view` · the caller's own jobs, for the tray
 *      DELETE /comms/ai-jobs                      `comm.view` · dismiss the caller's finished jobs
 *
 *  A proposal: each part reaches the record only through the person's own press
 *  and the close door. A job holds its note and report on its own row for one day.
 *  `note` is what is typed in the form now: the draft lives in the browser until confirm. */

/** Off until the route is switched on: the buttons stay hidden rather than refuse.
 *  `recording`: the audio route is on too, so a recording can be listened to. */
export const CommAiReportStatus = z.object({ available: z.boolean(), recording: z.boolean() })
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
  /** Names of files left out: past the per-press cap, or a recording no job listened to. */
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

export const CommAiPart = z.enum(['summary', 'minutes'])
export type CommAiPart = z.infer<typeof CommAiPart>

export const CommAiJobState = z.enum(['QUEUED', 'RUNNING', 'DONE', 'FAILED'])
export type CommAiJobState = z.infer<typeof CommAiJobState>

export const COMM_AI_JOB_ACTIVE = ['QUEUED', 'RUNNING'] as const satisfies readonly CommAiJobState[]

export const COMM_AI_JOB_STEPS = ['read-sources', 'listen', 'write'] as const
export const CommAiJobStepKey = z.enum(COMM_AI_JOB_STEPS)
export type CommAiJobStepKey = z.infer<typeof CommAiJobStepKey>

export const CommAiJobErrorKind = z.enum(['unavailable', 'busy', 'failed'])
export type CommAiJobErrorKind = z.infer<typeof CommAiJobErrorKind>

/** `recordingNotice`: the web sends `true` after a tick in the browser, so it
 *  proves the presser ticked the box and nothing more (ADR 0135 §2). */
export const CommAiJobBody = CommAiReportBody.extend({
  part: CommAiPart,
  recordingNotice: z.literal(true),
})
export type CommAiJobBody = z.infer<typeof CommAiJobBody>

/** The tray's row. Carries no customer content: `step` counts completed steps in
 *  `COMM_AI_JOB_STEPS` order, and on FAILED the failing step is `step + 1`. */
export const CommAiJob = z.object({
  id: z.uuid(),
  debriefId: z.uuid(),
  subjectCode: z.string().min(1),
  part: CommAiPart,
  state: CommAiJobState,
  step: z.number().int().min(0).max(COMM_AI_JOB_STEPS.length),
  stepMs: z.array(z.number().int().nonnegative()),
  errorKind: CommAiJobErrorKind.nullable(),
  error: z.string().nullable(),
  createdAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
})
export type CommAiJob = z.infer<typeof CommAiJob>

export const CommAiJobList = z.array(CommAiJob)
export type CommAiJobList = z.infer<typeof CommAiJobList>

/** The form's read: the report, behind the same gate as the press. `note` is what
 *  the press sent, so the other button can reuse the report for free. */
export const CommAiJobDetail = CommAiJob.extend({
  note: z.string(),
  report: CommAiReport.nullable(),
})
export type CommAiJobDetail = z.infer<typeof CommAiJobDetail>

export const CommAiJobCurrent = z.object({ job: CommAiJobDetail.nullable() })
export type CommAiJobCurrent = z.infer<typeof CommAiJobCurrent>
