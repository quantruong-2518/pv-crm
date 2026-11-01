import { z } from 'zod'
import { ObjectCode } from '../primitives'
import { LeadAiJobResult } from './lead-ai-fill-result'

/** `POST /sales/leads/:code/ai-fill` answers 202 with a `LeadAiJob`;
 *  `GET /sales/ai-jobs` lists the caller's own jobs (`LeadAiJobList`);
 *  `POST /sales/ai-jobs/:id/undo` answers the updated job;
 *  `DELETE /sales/ai-jobs/:id` dismisses one finished job.
 *
 *  `step` counts completed steps in `LEAD_AI_JOB_STEPS` order; on FAILED the
 *  failing step is `step + 1`. `result` stays on the row so Undo works for 24 h. */
export const LeadAiJobState = z.enum(['QUEUED', 'RUNNING', 'DONE', 'FAILED'])
export type LeadAiJobState = z.infer<typeof LeadAiJobState>

export const LEAD_AI_JOB_STEPS = [
  'read-lead',
  'web-search',
  'tax-lookup',
  'dup-check',
  'write',
] as const
export const LeadAiJobStepKey = z.enum(LEAD_AI_JOB_STEPS)
export type LeadAiJobStepKey = z.infer<typeof LeadAiJobStepKey>

export const LeadAiJobErrorKind = z.enum(['unavailable', 'busy', 'limit', 'failed'])
export type LeadAiJobErrorKind = z.infer<typeof LeadAiJobErrorKind>

/** The states in which a job still holds its lead's single slot. */
export const LEAD_AI_JOB_ACTIVE = ['QUEUED', 'RUNNING'] as const satisfies readonly LeadAiJobState[]

export const LeadAiJob = z.object({
  id: z.uuid(),
  leadCode: ObjectCode,
  leadName: z.string(),
  state: LeadAiJobState,
  step: z.number().int().min(0).max(LEAD_AI_JOB_STEPS.length),
  stepMs: z.array(z.number().int().nonnegative()),
  result: LeadAiJobResult.nullable(),
  errorKind: LeadAiJobErrorKind.nullable(),
  error: z.string().nullable(),
  createdAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  canUndo: z.boolean(),
  undoneAt: z.string().datetime().nullable(),
})
export type LeadAiJob = z.infer<typeof LeadAiJob>

export const LeadAiJobList = z.array(LeadAiJob)
export type LeadAiJobList = z.infer<typeof LeadAiJobList>

export const LeadAiJobParams = z.object({ id: z.uuid() })
export type LeadAiJobParams = z.infer<typeof LeadAiJobParams>
