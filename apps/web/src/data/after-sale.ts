import { queryOptions } from '@tanstack/react-query'
import {
  AfterSaleBookResponse,
  CUSTOMER_TEMPERATURE_LABEL,
  type AfterSaleBookQuery,
  type AfterSaleCareStatus,
  type AfterSaleTemperatureFilter,
} from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'
import { bookQueryParams, keepPageUnderSameFilters } from '@/app/book-query'

/** The bought-customer book (ADR 0121) — runs whose every live contract is
 *  fully collected, one row per run, in the server's fixed order.
 *
 *      GET /sales/after-sale        `contract.view` · scoped (carer or contract reader)
 *
 *  No `load:` — the door is real and no fixture backs this screen. */

export const AFTER_SALE_BOOK_KEY = ['sales', 'after-sale'] as const

const BOOK_NEED: ApiNeed = { branch: 'Sales', permission: 'contract.view', scoped: true }

export const AFTER_SALE_FILTER_KEYS = [
  'temperature',
  'carer',
  'care',
  'completedFrom',
  'completedTo',
] as const satisfies readonly (keyof AfterSaleBookQuery)[]

export const NO_READING_LABEL = 'Chưa đánh giá'

export const TEMPERATURE_FILTER_LABEL: Record<AfterSaleTemperatureFilter, string> = {
  ...CUSTOMER_TEMPERATURE_LABEL,
  none: NO_READING_LABEL,
}

export const CARE_STATUS_LABEL: Record<AfterSaleCareStatus, string> = {
  all: 'Tất cả',
  due: 'Đến kỳ chăm sóc',
  upcoming: 'Chưa đến kỳ',
}

/** The whole query rides the key, so page 2 never reads page 1's cache. */
export const afterSaleBookQuery = (query: AfterSaleBookQuery) =>
  queryOptions({
    placeholderData: keepPageUnderSameFilters(query),
    queryKey: [...AFTER_SALE_BOOK_KEY, 'page', query] as const,
    queryFn: ({ signal }) =>
      api.read<AfterSaleBookResponse>(`/sales/after-sale?${bookQueryParams(query)}`, {
        need: BOOK_NEED,
        schema: AfterSaleBookResponse,
        signal,
      }),
  })
