import { queryOptions } from '@tanstack/react-query'
import { RecareCountsResponse, StopLogResponse, type StopLogQuery } from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'
import { bookQueryParams, keepPageUnderSameFilters } from '@/app/book-query'

/** The two reads of the stopped-customers page (ADR 0125).
 *
 *      GET /sales/stop-log              `lead.view` · scoped — one row per stop decision
 *      GET /sales/leads/recare-counts   `lead.view` · scoped — size of each re-contact group
 *
 *  The counts key sits under the lead book's prefix, so every write that
 *  invalidates the book (`LEAD_STATE_KEYS`) refreshes the group switch too. */

const NEED: ApiNeed = { branch: 'Sales', permission: 'lead.view', scoped: true }

export const STOP_LOG_KEY = ['sales', 'stop-log'] as const

export const stopLogQuery = (query: StopLogQuery) =>
  queryOptions({
    placeholderData: keepPageUnderSameFilters(query),
    queryKey: [...STOP_LOG_KEY, query] as const,
    queryFn: ({ signal }) =>
      api.read(`/sales/stop-log?${bookQueryParams(query)}`, {
        need: NEED,
        schema: StopLogResponse,
        signal,
      }),
  })

export const recareCountsQuery = queryOptions({
  queryKey: ['sales', 'lead-book', 'recare-counts'] as const,
  queryFn: ({ signal }) =>
    api.read('/sales/leads/recare-counts', { need: NEED, schema: RecareCountsResponse, signal }),
})
