import { queryOptions } from '@tanstack/react-query'
import { SalesExitsResponse, SalesPerformanceResponse } from '@pv/contracts'
import { api } from '@/app/api'

/** The overview's own reads, both live and both fenced on the picked period. */

const NEED = { branch: 'Sales', permission: 'performance.view' } as const

/** `GET /sales/performance/:period`. Always stale: its figures move with
 *  writes to three books, and no write invalidates this key. */
export const salesPerformanceQuery = (period: string) =>
  queryOptions({
    queryKey: ['sales', 'performance', 'live', period] as const,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<SalesPerformanceResponse>(`/sales/performance/${period}`, {
        need: NEED,
        schema: SalesPerformanceResponse,
        signal,
      }),
  })

/** `GET /sales/performance/:period/exits` — why leads and deals left, same
 *  span as the figures above and stale for the same reason. */
export const salesExitsQuery = (period: string) =>
  queryOptions({
    queryKey: ['sales', 'performance', 'exits', period] as const,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<SalesExitsResponse>(`/sales/performance/${period}/exits`, {
        need: NEED,
        schema: SalesExitsResponse,
        signal,
      }),
  })
