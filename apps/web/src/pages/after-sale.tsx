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
import { useI18n } from '@/app/i18n'
import { searchHint } from '@/lib/search-box'
import { AFTER_SALE_FILTER_KEYS, afterSaleBookQuery } from '@/data/after-sale'
import { AFTER_SALE_COPY as COPY, careStatusText, temperatureText } from '@/data/after-sale-copy'
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

const ALL = 'all'

function useFilters(book: ReturnType<typeof useBookQuery<AfterSaleBookQuery>>) {
  const { lang, t } = useI18n()
  const { query } = book
  const people = useSalesPeople()
  const carerName = personNameOf(people)
  const temperatureOptions = [
    { value: ALL, label: t(COPY.anyTemperature) },
    ...AfterSaleTemperatureFilter.options.map((value) => ({
      value,
      label: temperatureText(value, lang),
    })),
  ]

  const temperature = (
    <Select
      label={t(COPY.temperature)}
      hideLabel
      className="pointer-coarse:[&>button]:h-12"
      value={query.temperature ?? ALL}
      options={temperatureOptions}
      neutralValue={ALL}
      onChange={(v) => book.patch({ temperature: AfterSaleTemperatureFilter.safeParse(v).data })}
    />
  )
  const carer = (
    <Select
      label={t(COPY.carer)}
      hideLabel
      className="pointer-coarse:[&>button]:h-12"
      value={query.carer ?? ALL}
      options={[
        { value: ALL, label: t(COPY.anyCarer) },
        ...people.map((p) => ({ value: p.id, label: p.name })),
      ]}
      neutralValue={ALL}
      onChange={(v) => book.patch({ carer: v === ALL ? undefined : v })}
    />
  )
  const completed = (iconOnly: boolean) => (
    <DayRangeFilter
      label={t(COPY.completedDay)}
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
            label: `${t(COPY.temperature)}: ${temperatureText(query.temperature, lang)}`,
            onDrop: () => book.patch({ temperature: undefined }),
          },
        ]
      : []),
    ...(query.carer
      ? [
          {
            id: 'carer',
            label: `${t(COPY.carer)}: ${carerName(query.carer)}`,
            onDrop: () => book.patch({ carer: undefined }),
          },
        ]
      : []),
    ...dayRangeChip('completed', t(COPY.completed), query.completedFrom, query.completedTo, () =>
      book.patch({ completedFrom: undefined, completedTo: undefined }),
    ),
  ]

  return { temperature, carer, completed, chips }
}

export default function AfterSalePage() {
  const { lang, t } = useI18n()
  const searchHintText = t(COPY.search)
  const chrome = useAppChrome({ searchPlaceholder: searchHintText })
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
  const careTabs = AfterSaleCareStatus.options.map((value) => ({
    value,
    label: careStatusText(value, lang),
  }))
  const tabCounts = useQueries({
    queries: careTabs.map((tab) =>
      afterSaleBookQuery({ ...book.urlQuery, care: tab.value, page: 1, size: 1 }),
    ),
  })
  const tabs = careTabs.map((tab, i) => ({ ...tab, count: tabCounts[i]?.data?.total }))

  const openJourney = (row: AfterSaleRow) =>
    navigate(`/sales/workstreams/${encodeURIComponent(row.code)}`)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title={t(COPY.title)}
          tabs={
            <SegmentedControl
              label={t(COPY.carePeriod)}
              hideLabel
              tone="quiet"
              value={query.care}
              options={tabs}
              onChange={(v) => book.patch({ care: AfterSaleCareStatus.safeParse(v).data })}
            />
          }
          count={
            data && (
              <BookCount total={data.total} noun={t(COPY.customerCount)} hidden={data.hidden} />
            )
          }
          filters={filters.chips}
          onClearFilters={book.dirty ? book.clear : undefined}
          tools={
            <>
              <SearchField
                placeholder={searchHintText}
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
                  message: `${t(COPY.loadFailed)} ${isApiError(error) ? userMessage(error) : t(COPY.retry)}`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? book.dirty
                ? {
                    message: t(COPY.noMatch),
                    action: { label: t(COPY.clearFilters), onClick: book.clear },
                  }
                : {
                    message: t(COPY.noCustomers),
                    action: {
                      label: t(COPY.viewContracts),
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
                  columns: afterSaleColumns(filters.completed(true), lang),
                  rows: rows.map((row) => ({
                    id: row.code,
                    onOpen: canOpenJourney ? () => openJourney(row) : undefined,
                    cells: afterSaleCells(row, <OpenDealButton row={row} go={navigate} />, lang),
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
