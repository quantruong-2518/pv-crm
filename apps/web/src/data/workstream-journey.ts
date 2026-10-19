import { queryOptions, type QueryClient } from '@tanstack/react-query'
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

/** Moves a lead's rungs in every cached journey as soon as a write answers
 *  200, so the progress bar turns at once rather than after the refetch that
 *  follows it — a round trip to Fly. That refetch still lands and has the last
 *  word. A rung the lead moved back from returns to `upcoming`. */
export function moveLeadRungs(
  client: QueryClient,
  lead: { code: string; state: string; stateSince: string },
) {
  client.setQueriesData<WorkstreamJourneyResponse>(
    { queryKey: ['sales', 'workstreams', 'journey'] },
    (journey) => {
      if (!journey || journey.lead.code !== lead.code) return journey
      const to = journey.lead.rungs.findIndex((r) => r.key === lead.state)
      if (to < 0 || journey.lead.rungs[to]!.state === 'current') return journey
      const rungs = journey.lead.rungs.map((r, i) => {
        if (i === to) return { ...r, state: 'current' as const, at: lead.stateSince, days: 0 }
        if (r.state !== 'current') return r
        return { ...r, state: i < to ? ('done' as const) : ('upcoming' as const) }
      })
      return { ...journey, lead: { ...journey.lead, rungs } }
    },
  )
}
