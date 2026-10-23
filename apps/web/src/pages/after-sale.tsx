import { useNavigate } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { AppShell, ScreenLayout, SearchField, SegmentedControl, Select } from '@pv/ui'
import {
  AfterSaleBookQuery,
  AfterSaleCareStatus,
  AfterSaleTemperatureFilter,
  type AfterSaleRow,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { useAppChrome } from '@/app/chrome'
import { searchHint } from '@/lib/search-box'
import {
  AFTER_SALE_FILTER_KEYS,
  CARE_STATUS_LABEL,
  TEMPERATURE_FILTER_LABEL,
  afterSaleBookQuery,
} from '@/data/after-sale'
import { useSalesPeople } from '@/data/directory'
import { personNameOf, dayRangeChip, type ActiveFilter } from '@/components/active-filters'
import { AfterSaleCards, OpenDealButton } from '@/components/after-sale-cards'
import { BookCount, BookPage } from '@/components/book-page'
import { ViewSwitch } from '@/components/book-cards'
import { DayRangeFilter } from '@/components/book-filters'
import { BOOK_PAGE_SIZE } from '@/components/book-columns'
import { GRID_PAGE_SIZE, useBookView } from '@/components/book-view'
import { TableFooter } from '@/components/table-bits'
import { afterSaleCells, afterSaleColumns } from './after-sale-columns'

/** The bought-customer book — `/sales/after-sale` (ADR 0121). One row per run whose
 *  every live contract is fully collected; it answers who to call next, so the
 *  server fixes the order (hot first, earliest care day first) and nothing
 *  here sorts. The tabs split due from not yet; a hot row offers a repeat
 *  deal on the same lead. Filters, search and page live in the address. */

const SEARCH_HINT = 'Tìm theo mã hành trình hoặc tên công ty…'
const ALL = 'all'

const CARE_TABS = AfterSaleCareStatus.options.map((value) => ({
  value,
  label: CARE_STATUS_LABEL[value],
}))

const TEMPERATURE_OPTIONS = [
  { value: ALL, label: 'Mọi nhiệt độ' },
  ...AfterSaleTemperatureFilter.options.map((value) => ({
    value,
    label: TEMPERATURE_FILTER_LABEL[value],
  })),
]

function useFilters(book: ReturnType<typeof useBookQuery<AfterSaleBookQuery>>) {
  const { query } = book
  const people = useSalesPeople()
  const carerName = personNameOf(people)

  const temperature = (
    <Select
      label="Nhiệt độ"
      hideLabel
      className="pointer-coarse:[&>button]:h-12"
      value={query.temperature ?? ALL}
      options={TEMPERATURE_OPTIONS}
      neutralValue={ALL}
      onChange={(v) => book.patch({ temperature: AfterSaleTemperatureFilter.safeParse(v).data })}
    />
  )
  const carer = (
    <Select
      label="Người chăm sóc"
      hideLabel
      className="pointer-coarse:[&>button]:h-12"
      value={query.carer ?? ALL}
      options={[
        { value: ALL, label: 'Mọi người chăm sóc' },
        ...people.map((p) => ({ value: p.id, label: p.name })),
      ]}
      neutralValue={ALL}
      onChange={(v) => book.patch({ carer: v === ALL ? undefined : v })}
    />
  )
  const completed = (iconOnly: boolean) => (
    <DayRangeFilter
      label="Ngày hoàn tất"
      iconOnly={iconOnly}
      from={query.completedFrom}
      to={query.completedTo}
      onChange={({ from, to }) => book.patch({ completedFrom: from, completedTo: to })}
    />
  )

  const chips: ActiveFilter[] = [
    ...(query.temperature
      ? [
          {
            id: 'temperature',
            label: `Nhiệt độ: ${TEMPERATURE_FILTER_LABEL[query.temperature]}`,
            onDrop: () => book.patch({ temperature: undefined }),
          },
        ]
      : []),
    ...(query.carer
      ? [
          {
            id: 'carer',
            label: `Người chăm sóc: ${carerName(query.carer)}`,
            onDrop: () => book.patch({ carer: undefined }),
          },
        ]
      : []),
    ...dayRangeChip('completed', 'Hoàn tất', query.completedFrom, query.completedTo, () =>
      book.patch({ completedFrom: undefined, completedTo: undefined }),
    ),
  ]

  return { temperature, carer, completed, chips }
}

export default function AfterSalePage() {
  const chrome = useAppChrome({ searchPlaceholder: SEARCH_HINT })
  const navigate = useNavigate()
  const canOpenJourney = useCan('workstream.view')
  const [view, setView] = useBookView('pv.after-sale.view')
  const pageSize = view === 'grid' ? GRID_PAGE_SIZE : BOOK_PAGE_SIZE
  const book = useBookQuery(AfterSaleBookQuery, {
    size: pageSize,
    filterKeys: AFTER_SALE_FILTER_KEYS,
  })
  const { query } = book
  const { data, isPending, error, refetch } = useQuery(afterSaleBookQuery(query))
  const { pageIndex } = useBookPageClamp(book, data?.total)
  const rows = data?.rows ?? []
  const filters = useFilters(book)

  /* One `size=1` read per tab: its `total` under the other filters in force. */
  const tabCounts = useQueries({
    queries: CARE_TABS.map((tab) =>
      afterSaleBookQuery({ ...book.urlQuery, care: tab.value, page: 1, size: 1 }),
    ),
  })
  const tabs = CARE_TABS.map((tab, i) => ({ ...tab, count: tabCounts[i]?.data?.total }))

  const openJourney = (row: AfterSaleRow) =>
    navigate(`/sales/workstreams/${encodeURIComponent(row.code)}`)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Khách đã mua"
          tabs={
            <SegmentedControl
              label="Kỳ chăm sóc"
              hideLabel
              tone="quiet"
              value={query.care}
              options={tabs}
              onChange={(v) => book.patch({ care: AfterSaleCareStatus.safeParse(v).data })}
            />
          }
          count={data && <BookCount total={data.total} noun="khách" hidden={data.hidden} />}
          filters={filters.chips}
          onClearFilters={book.dirty ? book.clear : undefined}
          tools={
            <>
              <SearchField
                placeholder={SEARCH_HINT}
                value={book.text}
                meta={searchHint(book.text)}
                onChange={book.setText}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              {filters.temperature}
              {filters.carer}
              {view === 'grid' && filters.completed(false)}
              <ViewSwitch value={view} onChange={setView} />
            </>
          }
          pending={isPending}
          failure={
            error
              ? {
                  message: `Không tải được danh sách khách đã mua. ${
                    isApiError(error) ? userMessage(error) : 'Thử lại.'
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? book.dirty
                ? {
                    message: 'Không có khách nào khớp bộ lọc.',
                    action: { label: 'Bỏ hết bộ lọc', onClick: book.clear },
                  }
                : {
                    message: 'Chưa có khách nào trả đủ tiền hợp đồng.',
                    action: {
                      label: 'Xem sổ hợp đồng',
                      onClick: () => navigate('/sales/contracts'),
                    },
                  }
              : undefined
          }
          cards={
            view === 'grid' ? (
              <AfterSaleCards rows={rows} canOpenJourney={canOpenJourney} go={navigate} />
            ) : undefined
          }
          table={
            view === 'table'
              ? {
                  columns: afterSaleColumns(filters.completed(true)),
                  rows: rows.map((row) => ({
                    id: row.code,
                    onOpen: canOpenJourney ? () => openJourney(row) : undefined,
                    cells: afterSaleCells(row, <OpenDealButton row={row} go={navigate} />),
                  })),
                  pageSize: BOOK_PAGE_SIZE,
                }
              : undefined
          }
          footer={
            <TableFooter
              page={pageIndex}
              pageSize={pageSize}
              total={data?.total ?? 0}
              onPage={book.goPage}
            />
          }
        />
      </ScreenLayout>
    </AppShell>
  )
}
