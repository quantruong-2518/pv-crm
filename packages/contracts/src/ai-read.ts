import { z } from 'zod'
import { paged, PageQuery } from './pagination'
import { Moment } from './primitives'

/** The trail of what the AI read: `GET /audit/ai-reads`, permission `ai-read.view`.
 *
 *  A line says who, which record and when; it never holds a question, an answer
 *  or a field of the record. Kept 12 months (ADR 0134, question 142). */
export const AiReadQuery = PageQuery.extend({
  actorId: z.string().trim().min(1).max(64).optional(),
  code: z.string().trim().min(1).max(64).optional(),
})

export const AiReadRow = z.object({
  id: z.uuid(),
  at: Moment,
  actorId: z.string(),
  /** Null when the account is gone: `audit.actor_id` carries no foreign key. */
  actorName: z.string().nullable(),
  /** Null on a tool result with no records, which writes one code-less line. */
  code: z.string().nullable(),
  note: z.string().nullable(),
})

export const AiReadListResponse = paged(AiReadRow)

export type AiReadQuery = z.infer<typeof AiReadQuery>
export type AiReadRow = z.infer<typeof AiReadRow>
export type AiReadListResponse = z.infer<typeof AiReadListResponse>
