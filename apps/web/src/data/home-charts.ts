import { queryOptions } from '@tanstack/react-query'
import { SalesExitsResponse, SalesPerformanceResponse } from '@pv/contracts'
import { api } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** The overview's own reads, both live and both fenced on the picked period. */

const NEED = { branch: 'Sales', permission: 'performance.view' } as const

export const PERFORMANCE_KEY = ['sales', 'performance'] as const

/** `GET /sales/performance/:period`. Its figures move with writes to three
 *  books; only a pushed `entity` event (`entity-sync.ts`) and a contract
 *  termination invalidate this key, otherwise it is up to a minute behind. */
export const salesPerformanceQuery = (period: string) =>
  queryOptions({
    queryKey: [...PERFORMANCE_KEY, 'live', period] as const,
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<SalesPerformanceResponse>(`/sales/performance/${period}`, {
        need: NEED,
        schema: SalesPerformanceResponse,
        signal,
      }),
  })

/** `GET /sales/performance/:period/exits` — why leads and deals left, same
 *  span as the figures above and as late for the same reason. */
export const salesExitsQuery = (period: string) =>
  queryOptions({
    queryKey: [...PERFORMANCE_KEY, 'exits', period] as const,
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<SalesExitsResponse>(`/sales/performance/${period}/exits`, {
        need: NEED,
        schema: SalesExitsResponse,
        signal,
      }),
  })
