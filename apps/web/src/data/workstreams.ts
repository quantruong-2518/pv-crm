import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { BadgeProps } from '@pv/ui'
import { keepPageUnderSameFilters } from '@/app/book-query'
import {
  WORKSTREAM_JOURNEY_STEPS,
  WorkstreamBoardResponse,
  WorkstreamBoardQuery,
  WorkstreamBookQuery,
  WorkstreamBookResponse,
  WorkstreamScorecard,
  type WorkstreamBoardColumn,
  type WorkstreamFootprint,
  type WorkstreamRow,
  type WorkstreamStandKind,
  type WorkstreamStatus,
} from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'
import { BADGE_INK } from '@/data/opportunities'
import type { Pic } from '@/components/book-cells'

/** Workstream book — `/sales/workstreams`. One row per customer journey run.
 *
 *  No `load:` — this book was born on the real door and never read a fixture.
 *  `scoped: true`, unlike the account book: a run belongs to the people
 *  holding it, so the server cuts rows and reports the cut in `hidden`. */

const BOOK_PATH = '/sales/workstreams'

export const WORKSTREAM_BOOK_KEY = ['sales', 'workstreams'] as const

const READ_NEED: ApiNeed = { branch: 'Sales', permission: 'workstream.view', scoped: true }

export const DEFAULT_WORKSTREAM_BOOK_QUERY: WorkstreamBookQuery = WorkstreamBookQuery.parse({})

/** Every key a scorecard card or the overdue toggle can set, cleared in one
 *  patch: what they open is that filter alone, so a press drops the others, the
 *  typed search and the company chip, and returns to the default tab. */
export const NARROWING_CLEARED = {
  q: undefined,
  accountCode: undefined,
  standKind: undefined,
  standKey: undefined,
  owner: undefined,
  closeReason: undefined,
  overdue: undefined,
  stopped: undefined,
  liveFrom: undefined,
  liveTo: undefined,
  openedFrom: undefined,
  openedTo: undefined,
  closedFrom: undefined,
  closedTo: undefined,
  status: DEFAULT_WORKSTREAM_BOOK_QUERY.status,
} satisfies Partial<WorkstreamBookQuery>

/** Re-exported, not re-declared: the label set lives in `@pv/contracts`
 *  beside its enum so the board door and this screen print the same word. */
export { CLOSE_REASON_LABEL } from '@pv/contracts'

/** One name per status, so the table's tab and the board's filter chip cannot
 *  call the same filter two different things. */
export const WORKSTREAM_STATUS_LABEL: Record<WorkstreamStatus, string> = {
  open: 'Đang hoạt động',
  closed: 'Đã kết thúc',
  all: 'Tất cả',
}

/** Said wherever a run has nobody in charge — the table's dash tooltip, the
 *  owner filter's "none" option and the board card's visible line. */
export const NO_PIC = 'Chưa có người phụ trách'

/** The one word per seat that heads a person in the book's column and the
 *  board's card (both draw `PicCell`). The deal's word names the seat, not a
 *  lane: the server's holder falls back to the acceptor or a BD when a deal
 *  has no seller, so "Sale" or a primary mark would be wrong for them. */
const IN_CHARGE_SEAT: Record<'lead' | 'deal' | 'contract', Pick<Pic, 'role'>> = {
  lead: { role: 'PIC lead' },
  deal: { role: 'Phụ trách cơ hội' },
  contract: { role: 'Người chốt' },
}

/** The people who answer for the object the run stands on, as `PicCell` takes
 *  them. `inCharge` absent is an API one deploy behind: it falls back to the
 *  Sale and BD the row always carried. */
export function inChargePics(
  row: Pick<WorkstreamRow, 'inCharge' | 'saleHolder' | 'bdHolder'>,
): Pic[] {
  const { inCharge, saleHolder, bdHolder } = row
  if (inCharge === undefined) {
    return [
      ...(saleHolder ? [{ ...saleHolder, role: 'Sale', primary: true }] : []),
      ...(bdHolder ? [{ ...bdHolder, role: 'BD' }] : []),
    ]
  }
  if (inCharge === null) return []
  return inCharge.people.map((p) => ({ ...p, ...IN_CHARGE_SEAT[inCharge.seat] }))
}

/** One hue per object kind, the pill shapes the opportunity book's stage cell
 *  already uses (law 16). The table's stand cell and the board's card chip
 *  both read it, so a rung is one colour on both views. Ink is `BADGE_INK` on
 *  all three: the tone inks fall under 4.5:1 on a hovered row and on the
 *  card's `surface-ink/5` ground (law 13); the tint still carries the hue. */
export const STAND_TONE: Record<
  WorkstreamStandKind,
  { tone: BadgeProps['tone']; className?: string }
> = {
  LD: { tone: 'draft', className: BADGE_INK },
  OP: { tone: 'running', className: BADGE_INK },
  HĐ: { tone: 'success', className: BADGE_INK },
}

export type JourneyStep = (typeof WORKSTREAM_JOURNEY_STEPS)[number]
export type JourneyStepKey = JourneyStep['key']

const STEP_LABEL = Object.fromEntries(
  WORKSTREAM_JOURNEY_STEPS.map((s) => [s.key, s.label]),
) as Record<JourneyStepKey, string>

/** The one word per journey step. Keyed by the step's own type, so a key the
 *  contract does not hold fails to compile instead of printing in English. */
export const stepLabel = (key: JourneyStepKey): string => STEP_LABEL[key]

const STEP_OF_KIND = { LD: 'lead', OP: 'opportunity', HĐ: 'contract' } as const satisfies Record<
  WorkstreamStandKind,
  JourneyStepKey
>

/** The journey step a live run sits at, by the kind of object it stands on. */
export const stepOfKind = (kind: WorkstreamStandKind): JourneyStepKey => STEP_OF_KIND[kind]

/** What a stand kind is called: the journey step it sits at, so the header
 *  filter, its chip and the board's step rail say the same word. */
export const STAND_KIND_LABEL: Record<WorkstreamStandKind, string> = {
  LD: stepLabel(STEP_OF_KIND.LD),
  OP: stepLabel(STEP_OF_KIND.OP),
  HĐ: stepLabel(STEP_OF_KIND.HĐ),
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
  if (q.owner !== undefined) p.set('owner', q.owner)
  if (q.closeReason !== undefined) p.set('closeReason', q.closeReason)
  if (q.overdue !== undefined) p.set('overdue', String(q.overdue))
  if (q.stopped !== undefined) p.set('stopped', String(q.stopped))
  if (q.liveFrom !== undefined) p.set('liveFrom', q.liveFrom)
  if (q.liveTo !== undefined) p.set('liveTo', q.liveTo)
  if (q.closedFrom !== undefined) p.set('closedFrom', q.closedFrom)
  if (q.closedTo !== undefined) p.set('closedTo', q.closedTo)
  if (q.openedFrom !== undefined) p.set('openedFrom', q.openedFrom)
  if (q.openedTo !== undefined) p.set('openedTo', q.openedTo)
  return p.toString()
}

/** Never throws: a hand-edited address still opens the book. */
export function parseWorkstreamBookQuery(params: URLSearchParams): WorkstreamBookQuery {
  const parsed = WorkstreamBookQuery.safeParse(Object.fromEntries(params))
  return parsed.success ? parsed.data : DEFAULT_WORKSTREAM_BOOK_QUERY
}

export function workstreamBookQuery(q: WorkstreamBookQuery) {
  return queryOptions({
    placeholderData: keepPageUnderSameFilters(q),
    queryKey: [...WORKSTREAM_BOOK_KEY, 'page', q] as const,
    queryFn: ({ signal }) =>
      api.read<WorkstreamBookResponse>(`${BOOK_PATH}?${workstreamBookQueryToParams(q)}`, {
        need: READ_NEED,
        schema: WorkstreamBookResponse,
        signal,
      }),
  })
}

/** `GET /sales/workstreams/scorecard?period=` — the strip above the book. Tab
 *  and filters never move it; the period does, and an API one deploy behind
 *  ignores `period` and answers without `inPeriod`.
 *
 *  The key nests under `WORKSTREAM_BOOK_KEY` on purpose: every writer already
 *  invalidates that prefix, so the cards follow the book with no list to keep
 *  in step (a sibling `workstream-scorecard` key would need adding to four).
 *  Aggregate tier, as the lead scorecard: the strip remounts on every return
 *  from a run. */
export const workstreamScorecardQuery = (period: string) =>
  queryOptions({
    queryKey: [...WORKSTREAM_BOOK_KEY, 'scorecard', period] as const,
    queryFn: ({ signal }) =>
      api.read<WorkstreamScorecard>(`${BOOK_PATH}/scorecard?period=${period}`, {
        need: READ_NEED,
        schema: WorkstreamScorecard,
        signal,
      }),
    placeholderData: keepPreviousData,
    ...cacheTier.aggregate,
  })

// ---------------------------------------------------------------------------
// THE BOARD — one catalogue call, then one paging call per column
// ---------------------------------------------------------------------------

/** The only narrowings the board offers, and the only ones its catalogue door
 *  takes (`status`, `accountCode`, `owner`, `q`). Columns are built from these
 *  alone, so a stray `stopped` or day range on the address cannot narrow a
 *  column the header above it does not count. */
export const BOARD_FILTER_KEYS = Object.keys(
  WorkstreamBoardQuery.shape,
) as (keyof WorkstreamBoardQuery)[]

/** The board's share of a book query: the catalogue and its columns both read
 *  this and nothing else. */
function boardFilterOf(q: WorkstreamBookQuery): Partial<WorkstreamBookQuery> {
  return Object.fromEntries(BOARD_FILTER_KEYS.map((key) => [key, q[key]]))
}

/** What the catalogue and its columns must ASK ALIKE. Paging and sorting are
 *  left out — they change which rows come back, never how many match. */
export function workstreamBoardFilterParams(q: WorkstreamBookQuery): string {
  const p = new URLSearchParams()
  for (const key of BOARD_FILTER_KEYS) {
    const value = q[key]
    if (value !== undefined && value !== DEFAULT_WORKSTREAM_BOOK_QUERY[key]) {
      p.set(key, String(value))
    }
  }
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
 *  ride on `base`. Of `base` only `BOARD_FILTER_KEYS` are kept, so the column
 *  counts exactly the set the catalogue header promised. */
export function workstreamColumnQuery(base: WorkstreamBookQuery, column: WorkstreamBoardColumn) {
  const q: WorkstreamBookQuery = {
    ...DEFAULT_WORKSTREAM_BOOK_QUERY,
    ...boardFilterOf(base),
    sort: base.sort,
    dir: base.dir,
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

/** Which step a column hangs under — off the `by` tag and the MACHINE key,
 *  never off `phaseLabel`: one catalogue rename would otherwise move a column
 *  to another step. A closed run grouped by WHY it ended is the dropped step;
 *  a live run reads at the step of the object it stands on, and nothing is
 *  quietly swept into `dropped` — a rung off its own ladder is a data fault,
 *  and it has to stay visible at its own kind's step to be seen at all. */
export function journeyStepOfColumn(column: WorkstreamBoardColumn): JourneyStepKey {
  return column.by === 'closeReason' ? 'dropped' : stepOfKind(column.kind)
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
 *  somebody typed or the sort they chose. Going to the board drops every
 *  narrowing it cannot show (`BOARD_FILTER_KEYS` are the ones it can), so a
 *  link never claims a filter the board does not apply. */
export function withBoardParams(
  params: URLSearchParams,
  next: { view?: BoardView; step?: JourneyStepKey },
): URLSearchParams {
  const out = new URLSearchParams(params)
  if (next.view === 'table') {
    out.delete(VIEW_PARAM)
    out.delete(STEP_PARAM)
  }
  if (next.view === 'kanban') {
    out.set(VIEW_PARAM, next.view)
    const kept = new Set<string>([...BOARD_FILTER_KEYS, 'sort', 'dir'])
    for (const key of Object.keys(WorkstreamBookQuery.shape)) if (!kept.has(key)) out.delete(key)
  }
  if (next.step !== undefined) out.set(STEP_PARAM, next.step)
  return out
}

/** Every run counts to the day it closed; an open one counts to `now`, which
 *  the caller reads once per mount so a redraw never changes the figure. */
export function runDays(ws: Pick<WorkstreamRow, 'openedAt' | 'closedAt'>, now: number): number {
  const end = ws.closedAt === null ? now : Date.parse(ws.closedAt)
  return Math.max(0, Math.floor((end - Date.parse(ws.openedAt)) / 86_400_000))
}
