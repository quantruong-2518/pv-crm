import { queryOptions } from '@tanstack/react-query'
import {
  SalesExitsResponse,
  SalesMoneyEntriesResponse,
  SalesMoneyResponse,
  SalesPerformanceResponse,
  type SalesMoneyFigureKind,
} from '@pv/contracts'
import { api } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** The overview's own reads, all live and all fenced on the picked period. */

const NEED = { branch: 'Sales', permission: 'performance.view' } as const
/** Money reads need the contract book; the server also refuses an own-only reader
 *  (403), and the screen falls back to the signed tile on either refusal. */
const MONEY_NEED = { branch: 'Sales', permission: 'contract.view' } as const

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

/** `GET /sales/performance/:period/money` — money moved in the period, per bucket.
 *  Under the same key root, so whatever refreshes the figures refreshes this. */
export const salesMoneyQuery = (period: string) =>
  queryOptions({
    queryKey: [...PERFORMANCE_KEY, 'money', period] as const,
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<SalesMoneyResponse>(`/sales/performance/${period}/money`, {
        need: MONEY_NEED,
        schema: SalesMoneyResponse,
        signal,
      }),
  })

/** `GET /sales/performance/:period/money/entries` — the rows behind one figure of one bucket. */
export const salesMoneyEntriesQuery = (
  period: string,
  bucket: string,
  kind: SalesMoneyFigureKind,
) =>
  queryOptions({
    queryKey: [...PERFORMANCE_KEY, 'money', period, 'entries', bucket, kind] as const,
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<SalesMoneyEntriesResponse>(
        `/sales/performance/${period}/money/entries?${new URLSearchParams({ bucket, kind })}`,
        { need: MONEY_NEED, schema: SalesMoneyEntriesResponse, signal },
      ),
  })
