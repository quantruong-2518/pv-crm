import { queryOptions } from '@tanstack/react-query'
import { WorkstreamJourneyResponse } from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'

/** Journey detail (canvas row E) — `/sales/workstreams/:code`.
 *
 *  CUT OVER: no `load:`, so the query reads the real door, which now sends
 *  `WorkstreamJourneyResponse`. `schema` stays as the seam that turns a drifting
 *  server into a named contract mismatch. The `scoped` need means an unknown or
 *  out-of-scope code is the door's 404, and `hiddenDeals` counts deals cut by
 *  that scope. */

const READ_NEED: ApiNeed = { branch: 'Sales', permission: 'workstream.view', scoped: true }

export function workstreamJourneyQuery(code: string) {
  return queryOptions({
    queryKey: ['sales', 'workstreams', 'journey', code] as const,
    queryFn: ({ signal }) =>
      api.read<WorkstreamJourneyResponse>(`/sales/workstreams/${encodeURIComponent(code)}`, {
        need: READ_NEED,
        schema: WorkstreamJourneyResponse,
        signal,
      }),
  })
}
