import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FxRateListResponse,
  FxRatePutResponse,
  type FxCurrency,
  type FxRatePutBody,
  type FxRateRow,
  type FxSource,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'
import { message, type Message } from '@/app/i18n'
import { FX_KEY } from './fx-rate'

/** The rate screen's two doors, both `setting.manage` (ADR 0149 §6):
 *
 *      GET /platform/fx-rates?currency      every stored day, newest first
 *      PUT /platform/fx-rates/:currency/:day        writes a `manual` row
 *
 *  A correction moves every figure built on that day, so the shared key also
 *  drops today's rate, which the previews read. No window: a rate from any day
 *  can be wrong, and the screen is the only place to correct it. */

const NEED: ApiNeed = { permission: 'setting.manage' }

export const FX_CURRENCY: FxCurrency = 'USD'

/** The rate's unit, one wording on the table header and the drawer field. */
export const FX_RATE_LABEL = message('Tỷ giá (₫/USD)', 'Rate (₫/USD)', '환율 (₫/USD)')

export const fxRatesQuery = queryOptions({
  queryKey: [...FX_KEY, 'list', FX_CURRENCY] as const,
  queryFn: ({ signal }) =>
    api.read<FxRateListResponse>(`/platform/fx-rates?currency=${FX_CURRENCY}`, {
      need: NEED,
      schema: FxRateListResponse,
      signal,
    }),
  ...cacheTier.aggregate,
})

export function useSetFxRate() {
  const client = useQueryClient()

  return useMutation<FxRateRow, ApiError, { day: string } & FxRatePutBody>({
    mutationFn: ({ day, ...body }) =>
      api.write(`/platform/fx-rates/${FX_CURRENCY}/${day}`, {
        method: 'PUT',
        body,
        need: NEED,
        schema: FxRatePutResponse,
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: FX_KEY }),
  })
}

export const FX_SOURCE_LABEL: Record<FxSource, Message> = {
  vietcombank: message('Vietcombank', 'Vietcombank', 'Vietcombank'),
  manual: message('Sửa tay', 'Manual', '수동 수정'),
  legacy: message('Mặc định cũ', 'Old default', '기존 기본값'),
}

/** A rate as people type it here: dot for thousands, comma for decimals. Dot as
 *  a decimal mark is refused rather than guessed, since "26.400" is twenty-six
 *  thousand four hundred. `NaN` for anything else; `undefined` for empty. */
export function rateOf(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  return /^(\d+|\d{1,3}(\.\d{3})+)(,\d+)?$/.test(trimmed)
    ? Number(trimmed.replaceAll('.', '').replace(',', '.'))
    : Number.NaN
}
