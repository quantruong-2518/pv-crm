import { queryOptions } from '@tanstack/react-query'
import {
  KpiBdOriginsResponse,
  KpiFunnelResponse,
  KpiMarketingSourcesResponse,
  KpiPresalesCollectionResponse,
  KpiTrendResponse,
  type RoleId,
} from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** The personal role boards (ADR 0160 §8–9): display-only reads under
 *  `/sales/kpi/:period/people/:actorId/…`, shown and never scored.
 *
 *  Keys sit under the month's `['sales', 'kpi', period]`, so a KPI write
 *  refetches them like every other card of the screen. Funnel and trend are
 *  per role: one person may hold several. */

const need: ApiNeed = { branch: 'Sales', permission: 'kpi.view' }

const keyOf = (period: string, actorId: string, part: string, role?: RoleId) =>
  ['sales', 'kpi', period, 'board', part, actorId, role ?? 'any'] as const

const pathOf = (period: string, actorId: string, part: string, role?: RoleId) =>
  `/sales/kpi/${period}/people/${encodeURIComponent(actorId)}/${part}${role ? `?role=${role}` : ''}`

export const kpiFunnelQuery = (period: string, actorId: string, role: RoleId) =>
  queryOptions({
    queryKey: keyOf(period, actorId, 'funnel', role),
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<KpiFunnelResponse>(pathOf(period, actorId, 'funnel', role), {
        need,
        schema: KpiFunnelResponse,
        signal,
      }),
  })

export const kpiTrendQuery = (period: string, actorId: string, role: RoleId) =>
  queryOptions({
    queryKey: keyOf(period, actorId, 'trend', role),
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<KpiTrendResponse>(pathOf(period, actorId, 'trend', role), {
        need,
        schema: KpiTrendResponse,
        signal,
      }),
  })

export const kpiMarketingSourcesQuery = (period: string, actorId: string) =>
  queryOptions({
    queryKey: keyOf(period, actorId, 'marketing-sources'),
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<KpiMarketingSourcesResponse>(pathOf(period, actorId, 'marketing-sources'), {
        need,
        schema: KpiMarketingSourcesResponse,
        signal,
      }),
  })

export const kpiBdOriginsQuery = (period: string, actorId: string) =>
  queryOptions({
    queryKey: keyOf(period, actorId, 'bd-origins'),
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<KpiBdOriginsResponse>(pathOf(period, actorId, 'bd-origins'), {
        need,
        schema: KpiBdOriginsResponse,
        signal,
      }),
  })

export const kpiPresalesCollectionQuery = (period: string, actorId: string) =>
  queryOptions({
    queryKey: keyOf(period, actorId, 'presales-collection'),
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<KpiPresalesCollectionResponse>(pathOf(period, actorId, 'presales-collection'), {
        need,
        schema: KpiPresalesCollectionResponse,
        signal,
      }),
  })
