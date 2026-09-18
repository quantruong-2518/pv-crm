import { queryOptions, useQueryClient } from '@tanstack/react-query'
import {
  WorkstreamBookQuery,
  WorkstreamBookResponse,
  WorkstreamProfileResponse,
  type WorkstreamCloseReason,
  type WorkstreamFootprint,
  type WorkstreamHolder,
  type WorkstreamRow,
  type WorkstreamStep,
} from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'

/** Workstream book — `/sales/workstreams`. One row per customer journey run.
 *
 *  No `load:` — this book was born on the real door and never read a fixture.
 *  `scoped: true`, unlike the account book: a run belongs to the people
 *  holding it, so the server cuts rows and reports the cut in `hidden`. */

const BOOK_PATH = '/sales/workstreams'

export const WORKSTREAM_BOOK_KEY = ['sales', 'workstreams'] as const

const READ_NEED: ApiNeed = { branch: 'Sales', permission: 'workstream.view', scoped: true }

export const DEFAULT_WORKSTREAM_BOOK_QUERY: WorkstreamBookQuery = WorkstreamBookQuery.parse({})

/** The enum key is English; every workstream screen prints this instead. */
export const CLOSE_REASON_LABEL: Record<WorkstreamCloseReason, string> = {
  WON: 'Thắng',
  LOST: 'Thua',
  CHURNED: 'Rời bỏ',
}

/** Every channel is always present on the wire, so a sum of 0 is a real 0.
 *  Lives here, not in `components/workstream-bits.tsx`: fast refresh allows a
 *  component file to export components only. */
export function footprintTotal(footprint: WorkstreamFootprint): number {
  return Object.values(footprint.byChannel).reduce((sum, n) => sum + n, 0)
}

/** Only non-default fields reach the URL, so a shared address stays short and
 *  `queryKey` does not change over values that never changed. */
export function workstreamBookQueryToParams(q: WorkstreamBookQuery): string {
  const d = DEFAULT_WORKSTREAM_BOOK_QUERY
  const p = new URLSearchParams()
  if (q.page !== d.page) p.set('page', String(q.page))
  if (q.size !== d.size) p.set('size', String(q.size))
  if (q.status !== d.status) p.set('status', q.status)
  if (q.sort !== d.sort) p.set('sort', q.sort)
  if (q.dir !== d.dir) p.set('dir', q.dir)
  if (q.accountCode !== undefined) p.set('accountCode', q.accountCode)
  if (q.q !== undefined) p.set('q', q.q)
  return p.toString()
}

/** Never throws: a hand-edited address still opens the book. */
export function parseWorkstreamBookQuery(params: URLSearchParams): WorkstreamBookQuery {
  const parsed = WorkstreamBookQuery.safeParse(Object.fromEntries(params))
  return parsed.success ? parsed.data : DEFAULT_WORKSTREAM_BOOK_QUERY
}

export function workstreamBookQuery(q: WorkstreamBookQuery) {
  return queryOptions({
    queryKey: [...WORKSTREAM_BOOK_KEY, 'page', q] as const,
    queryFn: ({ signal }) =>
      api.read<WorkstreamBookResponse>(`${BOOK_PATH}?${workstreamBookQueryToParams(q)}`, {
        need: READ_NEED,
        schema: WorkstreamBookResponse,
        signal,
      }),
  })
}

/** Missing and out-of-scope runs both answer 404 on purpose — see
 *  `WorkstreamService.profile`. */
export function workstreamProfileQuery(code: string) {
  return queryOptions({
    queryKey: [...WORKSTREAM_BOOK_KEY, 'one', code] as const,
    queryFn: ({ signal }) =>
      api.read<WorkstreamProfileResponse>(`${BOOK_PATH}/${encodeURIComponent(code)}`, {
        need: READ_NEED,
        schema: WorkstreamProfileResponse,
        signal,
      }),
  })
}

/** Every run counts to the day it closed; an open one counts to `now`, which
 *  the caller reads once per mount so a redraw never changes the figure. */
export function runDays(ws: Pick<WorkstreamRow, 'openedAt' | 'closedAt'>, now: number): number {
  const end = ws.closedAt === null ? now : Date.parse(ws.closedAt)
  return Math.max(0, Math.floor((end - Date.parse(ws.openedAt)) / 86_400_000))
}

/** A lead lane and a deal lane read alike once the outcome is folded into `open`. */
export type WorkstreamLane = {
  kind: 'LD' | 'OP'
  code: string
  owner: WorkstreamHolder | null
  steps: WorkstreamStep[]
  open: boolean
}

export type StepRef = { lane: string; step: string }

export function lanesOf(ws: WorkstreamProfileResponse): WorkstreamLane[] {
  const lead = { kind: 'LD' as const, ...ws.lead, open: ws.lead.outcome === 'open' }
  const deals = ws.deals.map((d) => ({ kind: 'OP' as const, ...d, open: d.outcome === 'open' }))
  return [lead, ...deals]
}

export const currentStepOf = (lane: WorkstreamLane) => lane.steps.find((s) => s.state === 'current')

/** The rung a lane actually stands on once it stopped moving — `at(-1)` would
 *  answer the LAST rung of the ladder instead, which for a deal lost or won
 *  before the final column is an `upcoming` rung nothing ever reached. */
const lastReachedOf = (lane: WorkstreamLane | undefined) =>
  lane && [...lane.steps].reverse().find((s) => s.state !== 'upcoming')

/** The newest open deal is what somebody opens a run to push forward; the lead
 *  and the last deal are fallbacks for a run with nothing moving. */
export function defaultStepOf(ws: WorkstreamProfileResponse): StepRef | null {
  const [lead, ...deals] = lanesOf(ws)
  const newest = deals.at(-1)
  const ref = (lane: WorkstreamLane | undefined, step: WorkstreamStep | undefined) =>
    lane && step ? { lane: lane.code, step: step.key } : null
  const open = [...deals].reverse().find((d) => d.open)
  return (
    ref(open, open && currentStepOf(open)) ??
    ref(lead, lead && currentStepOf(lead)) ??
    ref(newest, lastReachedOf(newest)) ??
    ref(lead, lastReachedOf(lead))
  )
}

export function findStep(ws: WorkstreamProfileResponse, ref: StepRef | null) {
  const lane = lanesOf(ws).find((l) => l.code === ref?.lane)
  const step = lane?.steps.find((s) => s.key === ref?.step)
  return lane && step ? { lane, step } : null
}

/** "Owner deal" in the header: whoever holds the newest open deal, else the
 *  newest deal of any outcome. */
export function dealOwnerOf(ws: WorkstreamProfileResponse): WorkstreamHolder | null {
  const deal = [...ws.deals].reverse().find((d) => d.outcome === 'open') ?? ws.deals.at(-1)
  return deal?.owner ?? null
}

/** A deal created from the lead lane changes the lanes, and `usePromoteLead`
 *  only invalidates the opportunity book. */
export function useRefreshWorkstream(code: string) {
  const client = useQueryClient()
  return () => void client.invalidateQueries({ queryKey: workstreamProfileQuery(code).queryKey })
}
