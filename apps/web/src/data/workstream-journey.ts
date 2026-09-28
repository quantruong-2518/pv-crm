import { queryOptions } from '@tanstack/react-query'
import { WorkstreamJourneyResponse } from '@pv/contracts'
import { SAO_DO_FROZEN_AT, saoDoJourney } from '@pv/engines/fixtures/sao-do'
import { ApiError, api, type ApiNeed, type ApiRequest } from '@/app/api'

/** Journey detail (canvas row E) — `/sales/workstreams/:code`.
 *
 *  Still `load:` on the sao-do mock: the door at this path sends the OLD
 *  `WorkstreamProfileResponse`, so dropping `load` alone is NOT the cut — the
 *  door must first send this shape; `schema` below turns a premature cut into
 *  a named contract mismatch instead of a half-drawn screen. An unknown code is
 *  a 404 like the real door's; the mock does not apply the `scoped` cut. */

const READ_NEED: ApiNeed = { branch: 'Sales', permission: 'workstream.view', scoped: true }

async function loadJourney(req: ApiRequest, code: string): Promise<WorkstreamJourneyResponse> {
  const journey = saoDoJourney(code)
  if (journey === undefined) {
    throw new ApiError({
      kind: 'not-found',
      status: 404,
      path: req.path,
      message: `Không có hành trình ${code}.`,
    })
  }
  /* `dispatch` skips the schema on the `load` branch; parsing here keeps the
     mock honest against the contract the real door will be held to. */
  return WorkstreamJourneyResponse.parse(journey)
}

/** The instant a journey's day count runs to. A mock screen counts to its fixture's frozen
 *  clock, not `Date.now()`, or the figure drifts daily; the cut swaps this back. */
export function journeyNow(): number {
  return Date.parse(SAO_DO_FROZEN_AT)
}

export function workstreamJourneyQuery(code: string) {
  return queryOptions({
    queryKey: ['sales', 'workstreams', 'journey', code] as const,
    queryFn: ({ signal }) =>
      api.read<WorkstreamJourneyResponse>(`/sales/workstreams/${encodeURIComponent(code)}`, {
        need: READ_NEED,
        schema: WorkstreamJourneyResponse,
        signal,
        load: (req) => loadJourney(req, code),
      }),
  })
}
