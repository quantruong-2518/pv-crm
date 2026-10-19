import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { AiCostReport, AiPrice, AiPriceList, type AiPriceSet, type AiCostLine } from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

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
  })

export const aiPricesQuery = queryOptions({
  queryKey: PRICES_KEY,
  queryFn: ({ signal }) => api.read('/ai/prices', { need: COST_NEED, schema: AiPriceList, signal }),
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

const WIDE = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const FINE = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const COUNT = new Intl.NumberFormat('vi-VN')

/** The word for a cost nobody priced yet — never 0, which would read as free. */
export const UNPRICED = 'Chưa tính được'

/** One call costs a fraction of a cent, so below 1 USD four decimals are kept,
 *  and a real spend too small even for those never prints as zero. */
export function usd(value: number): string {
  if (value > 0 && value < 0.0001) return '< 0,0001 USD'
  return `${(value >= 1 ? WIDE : FINE).format(value)} USD`
}

export const costText = (cost: number | null): string => (cost === null ? UNPRICED : usd(cost))

/** A unit price keeps every digit the admin typed (the column is `numeric(12,4)`). */
export const priceText = (value: number): string => `${FINE.format(value)} USD`

export const count = (value: number): string => COUNT.format(value)

/** The line's cost leaves calls out: say how many, beside the number. */
export const missingText = (line: AiCostLine): string | null =>
  line.costUsd !== null && line.unpricedCalls > 0
    ? `Còn ${count(line.unpricedCalls)} lượt chưa có giá`
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
