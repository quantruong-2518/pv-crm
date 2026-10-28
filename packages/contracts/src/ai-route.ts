import { z } from 'zod'
import { AiTask } from './ai-cost'
import { Moment } from './primitives'

/** AI routing — `platform.ai_route`, one row per AiTask, read on every call (no cache).
 *
 *      GET /ai/routes         permission `cost.view`                → AiRouteList
 *      PUT /ai/routes/:task   permission `cost.view`  body AiRouteSet → AiRoute
 *
 *  The vendor is derived from the model id prefix, so there is no provider field and
 *  no way for the two to disagree. Limits mirror the table CHECKs: the same rule is
 *  refused here first with a readable message. `AiUnavailableReason` is the pre-flight
 *  verdict a feature gets instead of a call. Decision: ADR 0102 and its gateway successor. */

/** Prefix picks the vendor (`claude-` Anthropic, `gemini-` Gemini); anything else is refused. */
export const AiModel = z
  .string()
  .trim()
  .max(100, 'Tối đa 100 ký tự.')
  .regex(/^(claude|gemini)-[a-z0-9.-]+$/, 'Tên mô hình phải bắt đầu bằng claude- hoặc gemini-.')
export type AiModel = z.infer<typeof AiModel>

export const AiUnavailableReason = z.enum(['disabled', 'no-key', 'user-limit', 'budget'])
export type AiUnavailableReason = z.infer<typeof AiUnavailableReason>

/** Three attempts at this fit under the scan queue's 300 s job expiry
 *  (`boss.provider.ts`); a longer wait would let pg-boss redeliver and bill twice.
 *  Copied by hand into the CHECK `ai_route_timeout_range`. */
export const AI_TIMEOUT_MAX_MS = 90_000

/** `0` on a daily limit means no limit; `maxTokensIn: null` means input is not counted. */
const AiRouteFields = z.object({
  primaryModel: AiModel,
  fallbackModel: AiModel.nullable(),
  maxTokensIn: z.number().int().positive().nullable(),
  maxTokensOut: z.number().int().positive(),
  timeoutMs: z.number().int().positive().max(AI_TIMEOUT_MAX_MS),
  dailyCallsPerUser: z.number().int().nonnegative(),
  /** Rolling 24 h, whole task. */
  dailyTokenBudget: z.number().int().nonnegative(),
  enabled: z.boolean(),
})

export const AiRouteSet = AiRouteFields.refine((r) => r.fallbackModel !== r.primaryModel, {
  message: 'Mô hình dự phòng phải khác mô hình chính.',
  path: ['fallbackModel'],
})
export type AiRouteSet = z.infer<typeof AiRouteSet>

export const AiRoute = AiRouteFields.extend({
  task: AiTask,
  updatedAt: Moment,
  /** Actor id; `null` for the seed row. */
  updatedBy: z.string().nullable(),
})
export type AiRoute = z.infer<typeof AiRoute>

export const AiRouteList = z.object({ routes: z.array(AiRoute) })
export type AiRouteList = z.infer<typeof AiRouteList>
