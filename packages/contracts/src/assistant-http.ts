import { z } from 'zod'
import { AssistantQuestion, AssistantSubject } from './assistant'
import { PageQuery, paged } from './pagination'
import { Moment } from './primitives'

/** CRM assistant chat, wave 1 — what crosses HTTP. Rows and stream events are in
 *  `./assistant`; this file only imports from there.
 *
 *  GET /assistant/availability · POST /assistant/turns (text/event-stream of
 *  `AssistantEvent`) · POST /assistant/turns/:id/stop · GET /assistant/sessions ·
 *  GET|PATCH|DELETE /assistant/sessions/:id · POST /assistant/messages/:id/report ·
 *  GET /assistant/reports (`assistant.review`).
 *
 *  Bodies are `.strict()`: an unknown field is a 400, not a silent drop. A report
 *  row carries the reported answer and the one question before it, nothing else
 *  of the session, because managers never read chats (ADR 0133 §2). */

/** True only when the `assistant` route is on AND the person holds `assistant.use`. */
export const AssistantAvailability = z.object({ enabled: z.boolean() })
export type AssistantAvailability = z.infer<typeof AssistantAvailability>

/** Absent `sessionId` opens a new session. `screen` may reach the prompt, so it is held to a path shape. */
export const AssistantTurnBody = z
  .object({
    sessionId: z.uuid().optional(),
    question: AssistantQuestion,
    screen: z
      .string()
      .max(200)
      .regex(/^\/[!-~]*$/)
      .optional(),
    subject: AssistantSubject.optional(),
  })
  .strict()
export type AssistantTurnBody = z.infer<typeof AssistantTurnBody>

/** `:id` on turns, sessions and messages alike; a turn id is its assistant message id. */
export const AssistantIdParams = z.object({ id: z.uuid() })
export type AssistantIdParams = z.infer<typeof AssistantIdParams>

/** Sessions per page of `GET /assistant/sessions`. */
export const ASSISTANT_SESSION_PAGE = 50

/** `before` is a page's `nextBefore`, passed back as it came; absent = the first page. */
export const AssistantSessionListQuery = z
  .object({ before: z.string().min(1).max(120).optional() })
  .strict()
export type AssistantSessionListQuery = z.infer<typeof AssistantSessionListQuery>

export const AssistantSessionPatchBody = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    pinned: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.title !== undefined || b.pinned !== undefined, 'Chưa có gì để lưu.')
export type AssistantSessionPatchBody = z.infer<typeof AssistantSessionPatchBody>

/** Values mirror the CHECK in migration 0162; widen both together. */
export const AssistantReportReason = z.enum(['wrong-figure', 'missing', 'off-target'])
export type AssistantReportReason = z.infer<typeof AssistantReportReason>

export const ASSISTANT_REPORT_REASON_LABEL = {
  'wrong-figure': 'Số liệu sai',
  missing: 'Thiếu thông tin',
  'off-target': 'Không đúng câu hỏi',
} as const satisfies Record<AssistantReportReason, string>

export const AssistantReportBody = z
  .object({
    reason: AssistantReportReason,
    note: z.string().trim().max(500).optional(),
  })
  .strict()
export type AssistantReportBody = z.infer<typeof AssistantReportBody>

export const AssistantReportQuery = PageQuery
export type AssistantReportQuery = z.infer<typeof AssistantReportQuery>

/** `question` and `answer` are empty, and `note` null, when the answer or an earlier
 *  one of its chat names a record the reader cannot read (`withheld`) or could not
 *  be re-checked (`unchecked`): `assistant.review` reads no further than the
 *  reader's own scope. */
export const AssistantReportRow = z.object({
  id: z.uuid(),
  at: Moment,
  reporterName: z.string(),
  reason: AssistantReportReason,
  note: z.string().nullable(),
  question: z.string(),
  answer: z.string(),
  withheld: z.boolean(),
  unchecked: z.boolean(),
})
export type AssistantReportRow = z.infer<typeof AssistantReportRow>

export const AssistantReportResponse = paged(AssistantReportRow)
export type AssistantReportResponse = z.infer<typeof AssistantReportResponse>
