import { z } from 'zod'
import { Day, Moment } from './primitives'
import { KpiPeriodKey } from './sales/kpi'

/** AI cost ledger — `platform.ai_call` (counts only) priced on read by `platform.ai_price`.
 *
 *      GET /ai/costs?month=YYYY-MM   permission `cost.view`   → AiCostReport
 *      GET /ai/prices                permission `cost.view`   → AiPriceList
 *      PUT /ai/prices                permission `cost.view`   body AiPriceSet → AiPrice
 *
 *  Cost is tokens × the unit price an admin entered, NOT the vendor's bill. A call
 *  with no price row is "unpriced": `costUsd` is `null`, never 0, so a missing
 *  price cannot read as a free call. Months and days are Asia/Ho_Chi_Minh.
 *  Prompt and answer text are never stored. Decision: ADR 0102. */

/** Closed list, widened by migration with the `ai_call.task` CHECK. */
export const AiTask = z.enum(['lead-scan'])
export type AiTask = z.infer<typeof AiTask>

/** Display labels only — never keys. */
export const AI_TASK_LABEL: Record<AiTask, string> = {
  'lead-scan': 'Nạp lead từ ảnh',
}

export const AiCallOutcome = z.enum(['ok', 'error'])
export type AiCallOutcome = z.infer<typeof AiCallOutcome>

/** Vendor model id as it appears in the ledger, e.g. `gemini-3.8-flash`. */
const AiModelId = z
  .string()
  .trim()
  .min(1, 'Nhập tên mô hình.')
  .max(100, 'Tối đa 100 ký tự.')
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, 'Tên mô hình chỉ gồm chữ không dấu, số và . _ : / -')

/** USD per 1M tokens, at most six decimals — the column's scale, so nothing rounds to free. */
const UsdPerMTok = z
  .number('Nhập giá.')
  .nonnegative('Giá không được âm.')
  .multipleOf(0.000001, 'Tối đa 6 chữ số sau dấu phẩy.')

export const AiCostQuery = z.object({ month: KpiPeriodKey })
export type AiCostQuery = z.infer<typeof AiCostQuery>

/** `costUsd` sums priced calls only; `null` when every call in the line is unpriced. */
export const AiCostLine = z.object({
  calls: z.number().int().nonnegative(),
  errorCalls: z.number().int().nonnegative(),
  tokensIn: z.number().int().nonnegative(),
  /** Includes thinking tokens: they are billed as output. */
  tokensOut: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().nullable(),
  unpricedCalls: z.number().int().nonnegative(),
})
export type AiCostLine = z.infer<typeof AiCostLine>

export const AiCostReport = z.object({
  month: KpiPeriodKey,
  currency: z.literal('USD'),
  totals: AiCostLine,
  /** Days with no calls may be omitted. */
  byDay: z.array(AiCostLine.extend({ day: Day })),
  byTask: z.array(AiCostLine.extend({ task: AiTask })),
  byModel: z.array(AiCostLine.extend({ model: z.string() })),
  /** `actorId: null` is a system job. */
  byActor: z.array(AiCostLine.extend({ actorId: z.string().nullable(), name: z.string() })),
})
export type AiCostReport = z.infer<typeof AiCostReport>

export const AiPrice = z.object({
  model: AiModelId,
  inputUsdPerMTok: UsdPerMTok,
  outputUsdPerMTok: UsdPerMTok,
  effectiveFrom: Day,
  /** Display name of the admin who entered it. */
  setBy: z.string(),
  setAt: Moment,
})
export type AiPrice = z.infer<typeof AiPrice>

/** `rows` newest first; `unpricedModels` = models seen in the ledger with no price row at all. */
export const AiPriceList = z.object({
  rows: z.array(AiPrice),
  unpricedModels: z.array(z.string()),
})
export type AiPriceList = z.infer<typeof AiPriceList>

/** Upsert on (model, effectiveFrom). */
export const AiPriceSet = AiPrice.pick({
  model: true,
  inputUsdPerMTok: true,
  outputUsdPerMTok: true,
  effectiveFrom: true,
})
export type AiPriceSet = z.infer<typeof AiPriceSet>
