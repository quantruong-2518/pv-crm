import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { AiCostReport, AiPrice, AiPriceList, type AiPriceSet, type AiCostLine } from '@pv/contracts'
import { LOCALE_TAG, getLang, formatNumber, message, translate } from '@/app/i18n'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** One Core · Admin · AI cost — AI spend per month and the unit prices behind it
 *  (ADR 0102). Live only: no `load:`, no scenario.
 *
 *  One permission for both doors, as on the notification policy: whoever may
 *  see what AI costs is who sets the price it is costed at. */

const COST_NEED: ApiNeed = { permission: 'cost.view' }

const COSTS_KEY = ['platform', 'ai-costs'] as const
const PRICES_KEY = ['platform', 'ai-prices'] as const

export const aiCostsQuery = (month: string) =>
  queryOptions({
    queryKey: [...COSTS_KEY, month] as const,
    queryFn: ({ signal }) =>
      api.read(`/ai/costs?month=${encodeURIComponent(month)}`, {
        need: COST_NEED,
        schema: AiCostReport,
        signal,
      }),
    ...cacheTier.aggregate,
  })

export const aiPricesQuery = queryOptions({
  queryKey: PRICES_KEY,
  queryFn: ({ signal }) => api.read('/ai/prices', { need: COST_NEED, schema: AiPriceList, signal }),
  ...cacheTier.reference,
})

export function useSetAiPrice() {
  const client = useQueryClient()

  return useMutation<AiPrice, ApiError, AiPriceSet>({
    mutationFn: (body) =>
      api.write('/ai/prices', {
        method: 'PUT',
        body,
        need: COST_NEED,
        schema: AiPrice,
      }),
    onSuccess: () => {
      /* A price re-costs every month it reaches back into, not only the one on screen. */
      void client.invalidateQueries({ queryKey: PRICES_KEY })
      void client.invalidateQueries({ queryKey: COSTS_KEY })
    },
  })
}

// ---------------------------------------------------------------------------
// Printing money — USD, VN separators (law 6)
// ---------------------------------------------------------------------------

const wide = () =>
  new Intl.NumberFormat(LOCALE_TAG[getLang()], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
const fine = () =>
  new Intl.NumberFormat(LOCALE_TAG[getLang()], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })

/** The word for a cost nobody priced yet — never 0, which would read as free. */
export const UNPRICED = message('Chưa tính được', 'Not priced yet', '단가 미산정')

/** One call costs a fraction of a cent, so below 1 USD four decimals are kept,
 *  and a real spend too small even for those never prints as zero. */
export function usd(value: number): string {
  if (value > 0 && value < 0.0001)
    return `< ${formatNumber(0.0001, getLang(), { minimumFractionDigits: 4, maximumFractionDigits: 4 })} USD`
  return `${(value >= 1 ? wide() : fine()).format(value)} USD`
}

export const costText = (cost: number | null): string =>
  cost === null ? translate(message('Chưa tính được', 'Not priced', '가격 미산정')) : usd(cost)

/** A unit price keeps every digit the admin typed (the column is `numeric(12,4)`). */
export const priceText = (value: number): string => `${fine().format(value)} USD`

export const count = (value: number): string => formatNumber(value)

/** The line's cost leaves calls out: say how many, beside the number. */
export const missingText = (line: AiCostLine): string | null =>
  line.costUsd !== null && line.unpricedCalls > 0
    ? translate(
        message(
          `Còn ${count(line.unpricedCalls)} lượt chưa có giá`,
          `${count(line.unpricedCalls)} calls are unpriced`,
          `가격 미설정 호출 ${count(line.unpricedCalls)}회`,
        ),
      )
    : null

// ---------------------------------------------------------------------------
// The screen's small sums
// ---------------------------------------------------------------------------

/** Models with calls this month that are not fully priced. `unpricedModels`
 *  (never priced at all) belongs to the price table, not to this month. */
export function unpricedModelsOf(report: AiCostReport): string[] {
  const seen = report.byModel.filter((m) => m.unpricedCalls > 0).map((m) => m.model)
  return seen
}

/** Every model id the screen knows, for the price form's suggestions. */
export function knownModelsOf(report?: AiCostReport, prices?: AiPriceList): string[] {
  return [
    ...new Set([
      ...(report?.byModel.map((m) => m.model) ?? []),
      ...(prices?.unpricedModels ?? []),
      ...(prices?.rows.map((r) => r.model) ?? []),
    ]),
  ]
}

export const firstDayOf = (month: string): string => `${month}-01`

/** A price typed the Vietnamese way ("0,3") reads as 0.3; blank stays blank so
 *  the box shows the contract's own missing-price message. */
export function priceOf(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  // One decimal mark, dot or comma: a pasted "$0.075" must not become 75.
  return /^\d+([.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(',', '.')) : Number.NaN
}
