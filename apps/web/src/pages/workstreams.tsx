import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, ScreenLayout, SegmentedControl, type TableSort } from '@pv/ui'
import {
  WorkstreamBookQuery,
  WorkstreamSortKey,
  WorkstreamStatus,
  vnDayOf,
  type WorkstreamRow,
} from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { message, useI18n } from '@/app/i18n'
import { isApiError, userMessage } from '@/app/api'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { keyOf } from '@/data/period-pick'
import {
  WORKSTREAM_STATUS_COPY,
  parseBoardView,
  type BoardView,
  withBoardParams,
  workstreamBookQuery,
  workstreamScorecardQuery,
} from '@/data/workstreams'
import { ViewSwitch } from '@/components/book-cards'
import { BOOK_PAGE_SIZE } from '@/components/book-columns'
import { BookCount, BookPage, BookSearch } from '@/components/book-page'
import { PeriodPicker, PeriodProgress } from '@/components/period-picker'
import { TableFooter } from '@/components/table-bits'
import {
  CustomerLines,
  InChargeCell,
  LastContactCell,
  NextStepCell,
  StandCell,
} from '@/components/workstream-cells'
import { WorkstreamsBoard } from './workstreams-board'
import { VIEW_OPTIONS, WORKSTREAM_SEARCH_HINT, filterChips } from './workstreams-model'
import { useOwnerName, useWorkstreamColumns } from './workstreams-filters'
import { OverdueToggle } from './workstreams-parts'
import { useBookPeriod } from './workstreams-period'
import { WorkstreamScoreStrip } from './workstreams-score'

/** The workstream book — `/sales/workstreams`. One row per customer journey run.
 *
 *  Only what the server can filter is offered: status tabs, search, the overdue
 *  toggle, the four period cards and the stand and person headers. Sort is
 *  customer or the server's priority ladder (the default); the last-contact
 *  figure is folded per page, so the server has nothing to sort it by.
 *  Filters live in the address (`app/book-query.ts`), the
 *  period beside them (`workstreams-period.ts`). A filter held in the browser
 *  only filters the page the server happened to send, so none is offered.
 *
 *  No ContextRail (law 10), the same conscious debt `pages/opportunities.tsx`
 *  records: a book has no open object to build a chain from. */

/* Every query field the server narrows by, bar sort and paging: they drive
   `dirty` and "clear all". `status` counts only off its default tab. */
const FILTER_KEYS = [
  'status',
  'accountCode',
  'standKind',
  'standKey',
  'owner',
  'closeReason',
  'overdue',
  'stopped',
  'liveFrom',
  'liveTo',
  'closedFrom',
  'closedTo',
  'openedFrom',
  'openedTo',
] as const

/* Built from the shared label table, not typed out again: the board names the
   same three statuses on its filter chip. */
const STATUS_OPTIONS: { value: WorkstreamStatus; label: ReturnType<typeof message> }[] =
  WorkstreamStatus.options.map((value) => ({
    value,
    label: WORKSTREAM_STATUS_COPY[value],
  }))

function rowCells(row: WorkstreamRow, go: (path: string) => void, today: string) {
  return [
    <CustomerLines key="customer" row={row} go={go} />,
    <StandCell key="stand" row={row} go={go} />,
    <NextStepCell key="next" row={row} />,
    <InChargeCell key="charge" row={row} />,
    <LastContactCell key="contact" row={row} today={today} />,
  ]
}

/** Table or board, chosen by `?view=` and nothing else: the screen a link opens
 *  must be the screen the sender was looking at. */
export default function WorkstreamsPage() {
  const [params] = useSearchParams()
  return parseBoardView(params) === 'kanban' ? <WorkstreamsBoard /> : <WorkstreamsBook />
}

const TEXT = {
  noWorkstreamsMatchTheseFilters: message(
    'Không có hành trình nào khớp bộ lọc.',
    'No workstreams match these filters.',
    '필터와 일치하는 영업 건이 없습니다.',
  ),
  noWorkstreamsYet: message(
    'Chưa có hành trình nào.',
    'No workstreams yet.',
    '아직 영업 건이 없습니다.',
  ),
}

type Patch = (next: Partial<WorkstreamBookQuery>) => void

function sortHandlerOf(query: WorkstreamBookQuery, patch: Patch) {
  return (key: string) => {
    const parsed = WorkstreamSortKey.safeParse(key)
    if (!parsed.success) return
    if (parsed.data === 'priority') {
      if (query.sort !== 'priority') patch({ sort: 'priority', dir: 'desc' })
      return
    }
    patch(
      query.sort === parsed.data
        ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
        : { sort: parsed.data, dir: 'asc' },
    )
  }
}

/** What an empty page says: filters hide it, scope hides it, or there is truly nothing. */
function emptyOf(
  {
    dirty,
    hidden,
    onClear,
    onSeeLeads,
  }: { dirty: boolean; hidden: number; onClear: () => void; onSeeLeads: () => void },
  t: (copy: ReturnType<typeof message>) => string,
) {
  return {
    message: dirty
      ? t(TEXT.noWorkstreamsMatchTheseFilters)
      : hidden > 0
        ? t(
            message(
              `${hidden} hành trình nằm ngoài phạm vi của bạn.`,
              `${hidden} workstreams are outside your scope.`,
              `${hidden}개의 영업 건이 권한 범위 밖에 있습니다.`,
            ),
          )
        : t(TEXT.noWorkstreamsYet),
    action: dirty
      ? {
          label: t(message('Bỏ hết bộ lọc', 'Clear all filters', '필터 모두 지우기')),
          onClick: onClear,
        }
      : {
          label: t(message('Xem sổ lead', 'View leads', '리드 보기')),
          onClick: onSeeLeads,
        },
  }
}

function WorkstreamsBook() {
  const { t } = useI18n()
  const chrome = useAppChrome({
    searchPlaceholder: t(message(WORKSTREAM_SEARCH_HINT, 'Search workstreams…', '영업 건 검색…')),
  })
  const navigate = useNavigate()
  /* Only the view switch reads the raw address: `useBookQuery` writes schema
     keys alone, and `view` / `step` are not among them. */
  const [params, setParams] = useSearchParams()
  const book = useBookQuery(WorkstreamBookQuery, { size: BOOK_PAGE_SIZE, filterKeys: FILTER_KEYS })
  const { query, text, setText, patch, goPage, clear: clearAll, dirty } = book
  const columns = useWorkstreamColumns(query, patch)
  const ownerName = useOwnerName()

  const { data, isPending, error, refetch } = useQuery(workstreamBookQuery(query))
  const [pick, onPick] = useBookPeriod()
  const score = useQuery(workstreamScorecardQuery(keyOf(pick)))
  const inPeriod = score.data?.inPeriod
  /* One clock read for the screen: a redraw never moves "yesterday". */
  const [today] = useState(() => vnDayOf(new Date()))

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const hidden = data?.hidden ?? 0
  const { pageIndex } = useBookPageClamp(book, data?.total)
  /* `priority` is a fixed ladder the server reads without `dir`, so the arrow
     never shows a direction the order does not have. */
  const tableSort: TableSort = {
    key: query.sort,
    dir: query.sort === 'priority' ? 'desc' : query.dir,
  }

  const onSort = sortHandlerOf(query, patch)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title={t(message('Sổ hành trình', 'Workstreams', '영업 건'))}
          description={
            inPeriod ? (
              <PeriodProgress data={inPeriod} />
            ) : (
              <span aria-hidden className="block h-4" />
            )
          }
          actions={<PeriodPicker pick={pick} onPick={onPick} />}
          score={
            <WorkstreamScoreStrip
              query={query}
              patch={patch}
              data={inPeriod}
              stale={score.isPlaceholderData}
            />
          }
          tabs={
            <SegmentedControl
              label={t(message('Trạng thái', 'Status', '상태'))}
              hideLabel
              tone="quiet"
              value={query.overdue === true ? 'open' : query.status}
              options={STATUS_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
              onChange={(v) => {
                const parsed = WorkstreamStatus.safeParse(v)
                if (parsed.success) patch({ status: parsed.data })
              }}
            />
          }
          count={
            <BookCount
              total={total}
              noun={t(message('hành trình', 'workstreams', '영업 건'))}
              hidden={hidden}
            />
          }
          filters={filterChips(query, patch, ownerName)}
          onClearFilters={dirty ? clearAll : undefined}
          tools={
            <>
              <BookSearch
                value={text}
                onChange={setText}
                placeholder={t(
                  message(WORKSTREAM_SEARCH_HINT, 'Search workstreams…', '영업 건 검색…'),
                )}
                className="max-sm:basis-full"
              />
              <OverdueToggle query={query} patch={patch} count={score.data?.overdue} />
              <ViewSwitch<BoardView>
                value="table"
                options={VIEW_OPTIONS}
                onChange={(next) =>
                  setParams(withBoardParams(params, { view: next }), { replace: true })
                }
              />
            </>
          }
          pending={isPending}
          failure={
            error
              ? {
                  message: `${t(message('Không tải được danh sách hành trình.', 'Could not load workstreams.', '영업 건을 불러오지 못했습니다.'))} ${
                    isApiError(error)
                      ? userMessage(error)
                      : t(message('Thử lại.', 'Try again.', '다시 시도하세요.'))
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? emptyOf(
                  { dirty, hidden, onClear: clearAll, onSeeLeads: () => navigate('/sales/leads') },
                  t,
                )
              : undefined
          }
          table={{
            pageSize: BOOK_PAGE_SIZE,
            sort: tableSort,
            onSort,
            columns,
            rows: rows.map((row) => ({
              id: row.code,
              onOpen: () => navigate(`/sales/workstreams/${encodeURIComponent(row.code)}`),
              cells: rowCells(row, navigate, today),
            })),
          }}
          footer={
            <TableFooter page={pageIndex} pageSize={BOOK_PAGE_SIZE} total={total} onPage={goPage} />
          }
        />
      </ScreenLayout>
    </AppShell>
  )
}
