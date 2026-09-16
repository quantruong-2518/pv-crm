import { queryOptions } from '@tanstack/react-query'
import {
  WorkstreamBookQuery,
  WorkstreamBookResponse,
  WorkstreamProfileResponse,
  type WorkstreamChannel,
  type WorkstreamCloseReason,
  type WorkstreamFootprint,
} from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'
import { COMMS_CHANNEL_LABEL } from '@/data/comms'

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

/** Five channels borrow the comms labels. `mail` counts letters actually sent
 *  to the customer (internal alerts are excluded server-side), not a captured
 *  conversation, so it must not read as a second "Email". */
export const WORKSTREAM_CHANNEL_LABEL: Record<WorkstreamChannel, string> = {
  ...COMMS_CHANNEL_LABEL,
  meeting: 'Cuộc gặp',
  mail: 'Thư đã gửi',
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
