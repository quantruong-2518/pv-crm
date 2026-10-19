import { queryOptions } from '@tanstack/react-query'
import { KpiContributionsResponse, type KpiContributionKind } from '@pv/contracts'
import { api } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** `GET /sales/kpi/:period/people/:actorId/contributions` — the records each
 *  figure of one person counted (ADR 0099 §5). Live, no `load:`.
 *
 *  `need` mirrors the controller's one door on `kpi.view`; reading another
 *  person's line is cut by the server (`kpi.view-all`), so that refusal comes
 *  back as a `forbidden` error rather than being decided here. */

export const kpiContributionsQuery = (period: string, actorId: string) =>
  queryOptions({
    queryKey: ['sales', 'kpi', period, 'contributions', actorId] as const,
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<KpiContributionsResponse>(
        `/sales/kpi/${period}/people/${encodeURIComponent(actorId)}/contributions`,
        {
          need: { branch: 'Sales', permission: 'kpi.view' },
          schema: KpiContributionsResponse,
          signal,
        },
      ),
  })

/** The screen a record opens, or null where none exists (a meeting has no page). */
export function contributionHref(kind: KpiContributionKind, code: string): string | null {
  const at = encodeURIComponent
  if (kind === 'lead') return `/sales/leads/${at(code)}`
  if (kind === 'opportunity') return `/sales/opportunities/${at(code)}`
  if (kind === 'contract') return `/sales/contracts/${at(code)}`
  if (kind === 'installment') {
    /* The server joins contract code and installment number with the last '/'. */
    const cut = code.lastIndexOf('/')
    if (cut <= 0) return null
    return `/sales/contracts/${at(code.slice(0, cut))}/installments/${at(code.slice(cut + 1))}`
  }
  return null
}
