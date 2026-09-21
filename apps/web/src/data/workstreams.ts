import { infiniteQueryOptions, queryOptions, useQueryClient } from '@tanstack/react-query'
import {
  WORKSTREAM_JOURNEY_STEPS,
  WorkstreamBoardResponse,
  WorkstreamBookQuery,
  WorkstreamBookResponse,
  WorkstreamProfileResponse,
  type WorkstreamBoardColumn,
  type WorkstreamDealLane,
  type WorkstreamFootprint,
  type WorkstreamHolder,
  type WorkstreamRow,
  type WorkstreamStatus,
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

/** Re-exported, not re-declared: the label set lives in `@pv/contracts`
 *  beside its enum so the board door and this screen print the same word. */
export { CLOSE_REASON_LABEL } from '@pv/contracts'

/** One name per status, so the table's tab and the board's filter chip cannot
 *  call the same filter two different things. */
export const WORKSTREAM_STATUS_LABEL: Record<WorkstreamStatus, string> = {
  open: 'Đang chạy',
  closed: 'Đã đóng',
  all: 'Tất cả',
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
  if (q.standKind !== undefined) p.set('standKind', q.standKind)
  if (q.standKey !== undefined) p.set('standKey', q.standKey)
  if (q.closeReason !== undefined) p.set('closeReason', q.closeReason)
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

// ---------------------------------------------------------------------------
// THE BOARD — one catalogue call, then one paging call per column
// ---------------------------------------------------------------------------

/** What the catalogue and its columns must ASK ALIKE. Paging and sorting are
 *  left out — they change which rows come back, never how many match — but
 *  `status`, `q` and `accountCode` go to both doors or the header counts a book
 *  the cards below it are no longer showing. */
export function workstreamBoardFilterParams(q: WorkstreamBookQuery): string {
  const d = DEFAULT_WORKSTREAM_BOOK_QUERY
  const p = new URLSearchParams()
  if (q.status !== d.status) p.set('status', q.status)
  if (q.accountCode !== undefined) p.set('accountCode', q.accountCode)
  if (q.q !== undefined) p.set('q', q.q)
  return p.toString()
}

/** The column catalogue. Its `total` is the ONLY number a column header prints:
 *  a page of the book answers the same question for one moment of one read, and
 *  two sources for one figure is how two figures start to disagree. The filter
 *  is part of the key — without it React Query would re-serve the catalogue of
 *  a search nobody is running any more. */
export function workstreamBoardColumnsQuery(base: WorkstreamBookQuery) {
  const filters = workstreamBoardFilterParams(base)
  return queryOptions({
    queryKey: [...WORKSTREAM_BOOK_KEY, 'board', filters] as const,
    queryFn: ({ signal }) =>
      api.read<WorkstreamBoardResponse>(
        filters === '' ? `${BOOK_PATH}/board` : `${BOOK_PATH}/board?${filters}`,
        { need: READ_NEED, schema: WorkstreamBoardResponse, signal },
      ),
  })
}

/** Smaller than the book's own page: a column is read at a glance and scrolled
 *  rarely, so a first paint waits for one short page per column instead of six
 *  long ones. */
const COLUMN_PAGE_SIZE = 20

/** WHETHER rows were cut for scope, never how many.
 *
 *  The door's `hidden` is two counts added together (`workstream.service.ts`):
 *  one cut made in SQL over the WHOLE book, identical on every page, plus one
 *  E2 makes over THAT PAGE alone. No arithmetic on this side recovers the true
 *  figure — summing the pages double-counts the first half, reading the last
 *  page drops every earlier second half. So the fact is declared and the number
 *  is not. It comes back the day the door splits the two. */
export type WorkstreamColumnCards = { rows: WorkstreamRow[]; anyHidden: boolean }

/** A run can change rung between two page reads, so page 2 may repeat a card
 *  page 1 already holds. First copy wins — the column keeps the order the
 *  server sent and never prints one `code` twice. */
function dedupeByCode(pages: readonly WorkstreamBookResponse[]): WorkstreamRow[] {
  const seen = new Set<string>()
  const rows: WorkstreamRow[] = []
  for (const page of pages) {
    for (const row of page.rows) {
      if (seen.has(row.code)) continue
      seen.add(row.code)
      rows.push(row)
    }
  }
  return rows
}

/** The door params one column is fetched with. The column CARRIES them, all of
 *  them — the screen narrows on the `by` tag and infers nothing, `status`
 *  included: which runs a rung counts is the server's fact, and a literal here
 *  would be a second copy of it that can only drift. */
function columnFilter(column: WorkstreamBoardColumn): Partial<WorkstreamBookQuery> {
  const asks =
    column.by === 'stand'
      ? { standKind: column.kind, standKey: column.key }
      : { closeReason: column.closeReason }
  return { ...asks, status: column.status }
}

/** One key per column, and one identity for a `key=` prop. */
export function boardColumnId(column: WorkstreamBoardColumn): string {
  return column.by === 'stand'
    ? `stand:${column.kind}:${column.key}`
    : `closed:${column.closeReason}`
}

/** One column = one call to the book door narrowed to that column's question.
 *  Same key prefix as the book, so one write invalidates the table view and
 *  every column of the board together. The screen never re-sorts: `sort`/`dir`
 *  ride on `base`. The three filters are cleared before the column's own are
 *  laid on, so nothing left on the address narrows a column twice. */
export function workstreamColumnQuery(base: WorkstreamBookQuery, column: WorkstreamBoardColumn) {
  const q: WorkstreamBookQuery = {
    ...base,
    standKind: undefined,
    standKey: undefined,
    closeReason: undefined,
    ...columnFilter(column),
    size: COLUMN_PAGE_SIZE,
    page: 1,
  }
  return infiniteQueryOptions({
    queryKey: [...WORKSTREAM_BOOK_KEY, 'column', q] as const,
    initialPageParam: q.page,
    queryFn: ({ pageParam, signal }) =>
      api.read<WorkstreamBookResponse>(
        `${BOOK_PATH}?${workstreamBookQueryToParams({ ...q, page: pageParam })}`,
        { need: READ_NEED, schema: WorkstreamBookResponse, signal },
      ),
    /* Counted over rows actually received, and an empty page ends the column
       whatever `total` says — scope can cut rows a count still includes, and
       that gap would otherwise ask for page after page forever. */
    getNextPageParam: (last, pages, lastParam) => {
      if (last.rows.length === 0) return undefined
      const got = pages.reduce((n, page) => n + page.rows.length, 0)
      return got < last.total ? lastParam + 1 : undefined
    },
    select: (data): WorkstreamColumnCards => ({
      rows: dedupeByCode(data.pages),
      anyHidden: data.pages.some((page) => page.hidden > 0),
    }),
  })
}

export type JourneyStep = (typeof WORKSTREAM_JOURNEY_STEPS)[number]
export type JourneyStepKey = JourneyStep['key']

/** Which step a column hangs under — off the `by` tag and the MACHINE key,
 *  never off `phaseLabel`: one catalogue rename would otherwise move a column
 *  to another step. A closed run grouped by WHY it ended is the dropped step;
 *  a live run reads at the step of the object it stands on, and nothing is
 *  quietly swept into `dropped` — a rung off its own ladder is a data fault,
 *  and it has to stay visible at its own kind's step to be seen at all. */
export function journeyStepOfColumn(column: WorkstreamBoardColumn): JourneyStepKey {
  if (column.by === 'closeReason') return 'dropped'
  if (column.kind === 'HĐ') return 'contract'
  return column.kind === 'OP' ? 'opportunity' : 'lead'
}

export type BoardStepGroup = {
  step: JourneyStep
  columns: WorkstreamBoardColumn[]
  /** The catalogue has answered and sent this step no column. THE ABSENCE IS
   *  THE FLAG (`WorkstreamBoardResponse`) — the screen holds no list of which
   *  steps are built, or the day one of them gains a book the screen would keep
   *  locking a step whose columns are already arriving. */
  locked: boolean
  /** Every column of this step is counted under `status: 'closed'` — read off
   *  the columns' own `status`, not off the `by` tag: the contract step counts
   *  closed runs through a `stand` column (a signed run is a closed run), and
   *  grouping-by-close-reason would miss it. Such a step answers a different
   *  question from its neighbours, so it says so on the card. */
  closedOnly: boolean
  /** Null is two different absences, and both print a dash rather than a zero:
   *  the catalogue has not answered yet, or this step has no book at all. */
  total: number | null
}

export function boardStepGroups(columns: WorkstreamBoardColumn[] | undefined): BoardStepGroup[] {
  return WORKSTREAM_JOURNEY_STEPS.map((step) => {
    const own = (columns ?? []).filter((c) => journeyStepOfColumn(c) === step.key)
    const locked = columns !== undefined && own.length === 0
    return {
      step,
      columns: own,
      locked,
      closedOnly: own.length > 0 && own.every((c) => c.status === 'closed'),
      total: columns === undefined || locked ? null : own.reduce((n, c) => n + c.total, 0),
    }
  })
}

// ---------------------------------------------------------------------------
// WHICH VIEW, WHICH STEP — both on the address so a board is pasteable
// ---------------------------------------------------------------------------

export type BoardView = 'table' | 'kanban'

const VIEW_PARAM = 'view'
const STEP_PARAM = 'step'

/** The first step of the journey: the rung a run starts on, and the one a
 *  reader who pasted no step means. */
const DEFAULT_BOARD_STEP: JourneyStepKey = 'lead'

export const parseBoardView = (params: URLSearchParams): BoardView =>
  params.get(VIEW_PARAM) === 'kanban' ? 'kanban' : 'table'

/** A step nobody has heard of opens the first one instead of a blank board. */
export function parseBoardStep(params: URLSearchParams): JourneyStepKey {
  const asked = params.get(STEP_PARAM)
  return WORKSTREAM_JOURNEY_STEPS.find((s) => s.key === asked)?.key ?? DEFAULT_BOARD_STEP
}

/** Every other parameter stays: switching view or step may not drop the search
 *  somebody typed or the sort they chose. */
export function withBoardParams(
  params: URLSearchParams,
  next: { view?: BoardView; step?: JourneyStepKey },
): URLSearchParams {
  const out = new URLSearchParams(params)
  if (next.view === 'table') {
    out.delete(VIEW_PARAM)
    out.delete(STEP_PARAM)
  }
  if (next.view === 'kanban') out.set(VIEW_PARAM, next.view)
  if (next.step !== undefined) out.set(STEP_PARAM, next.step)
  return out
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

/** A deal lane carries its own outcome, so nothing has to pair a lane back to
 *  a `WorkstreamDealLane` by array index. */
export type WorkstreamDealLaneView = WorkstreamLane &
  Pick<WorkstreamDealLane, 'outcome' | 'outcomeAt' | 'contractCode'>

/* No backbone patching: `stepsOf` maps over `LEAD_LANE_BACKBONE`, so all five
   rungs always arrive in order — and the day they do not, the screen should
   show the gap instead of drawing a ladder nobody sent. */
export const leadLaneOf = (ws: WorkstreamProfileResponse): WorkstreamLane => ({
  kind: 'LD',
  ...ws.lead,
  open: ws.lead.outcome === 'open',
})

export const dealLanesOf = (ws: WorkstreamProfileResponse): WorkstreamDealLaneView[] =>
  ws.deals.map((d) => ({ kind: 'OP', ...d, open: d.outcome === 'open' }))

export function lanesOf(ws: WorkstreamProfileResponse): WorkstreamLane[] {
  return [leadLaneOf(ws), ...dealLanesOf(ws)]
}

export const currentStepOf = (lane: WorkstreamLane) => lane.steps.find((s) => s.state === 'current')

/** The rung a lane actually stands on once it stopped moving — `at(-1)` would
 *  answer the LAST rung of the ladder instead, which for a deal lost or won
 *  before the final column is an `upcoming` rung nothing ever reached. */
export const lastReachedOf = (lane: WorkstreamLane | undefined) =>
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

/** A deal created from the lead lane changes the lanes, and `usePromoteLead`
 *  only invalidates the opportunity book. */
export function useRefreshWorkstream(code: string) {
  const client = useQueryClient()
  return () => void client.invalidateQueries({ queryKey: workstreamProfileQuery(code).queryKey })
}

/** A contract IS the other side of a won deal, so it is read off the deals
 *  rather than asked for: the profile door sends no contract lane. `dealWonAt`
 *  is null unless the deal was actually won — `outcomeAt` is the day a deal
 *  ENDED either way, so reading it as a win date labels a lost deal's closing
 *  day as its victory. */
export type JourneyContract = { code: string; dealCode: string; dealWonAt: string | null }

export function contractsOf(ws: WorkstreamProfileResponse): JourneyContract[] {
  return ws.deals.flatMap((d) =>
    d.contractCode === null
      ? []
      : [
          {
            code: d.contractCode,
            dealCode: d.code,
            dealWonAt: d.outcome === 'won' ? d.outcomeAt : null,
          },
        ],
  )
}
