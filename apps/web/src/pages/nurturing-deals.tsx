import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, ColumnFilterList, ColumnFilterRange, SearchField } from '@pv/ui'
import { OWNER_NONE, OpportunityBookQuery, type OpportunityBookRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { searchHint } from '@/lib/search-box'
import { opportunityBookQuery, opportunityFacetQuery, saleOwnersOf } from '@/data/opportunities'
import { BookCount, BookPage, type BookTable } from '@/components/book-page'
import { csvOf, peopleOptions } from '@/components/book-columns'
import { FilterSection, ViewSwitch } from '@/components/book-cards'
import { GRID_PAGE_SIZE, noop } from '@/components/book-view'
import { DealNurtureCards } from '@/components/nurture-cards'
import { FilterMenu, TableFooter } from '@/components/table-bits'
import { CloseCell, PeopleCell } from './opportunities-cells'
import { useOpportunityFilterChips, useOpportunityFilters } from './opportunities-filters'
import { StopReasonFilter } from './opportunities-parts'
import { withTab, withoutTab, type NurtureBookProps } from './nurturing-model'

/** The deal tab of the nurturing page: every deal that was stopped, with the
 *  reason and the day. It reuses the deal book's own stop-reason, close-day and
 *  Sale filters, so a link from the overview narrows it the same way. */

const PAGE_SIZE = 10
const SCHEMA = withTab(OpportunityBookQuery)
const FILTER_KEYS = ['stopReason', 'closedFrom', 'closedTo', 'sale'] as const

/** The table view, as the tab drew it before cards. */
function dealNurtureTable(
  rows: OpportunityBookRow[],
  columns: ReturnType<typeof useOpportunityFilters>,
  navigate: (to: string) => void,
): BookTable {
  return {
    minWidth: 'min-w-[880px]',
    columns: [
      { header: 'Cơ hội / Khách hàng', width: 'minmax(0,2.2fr)' },
      { header: 'Lý do dừng', width: 'minmax(0,1.6fr)' },
      { header: 'Ngày dừng', filter: columns.closed, width: 'minmax(0,1fr)', align: 'center' },
      { header: 'Sale phụ trách', filter: columns.sale, width: '140px', align: 'center' },
    ],
    rows: rows.map((op) => ({
      id: op.code,
      onOpen: () => navigate(`/sales/opportunities/${encodeURIComponent(op.code)}`),
      cells: [
        <span key="n" className="flex min-w-0 flex-col gap-1" title={`${op.code} · ${op.name}`}>
          <span className="truncate text-[13px] font-semibold">{op.name}</span>
          <span className="text-muted-foreground truncate text-[11.5px] italic">{op.account}</span>
        </span>,
        <span key="r" className="truncate text-[13px]" title={op.stopReasonLabel ?? undefined}>
          {op.stopReasonLabel ?? '—'}
        </span>,
        <CloseCell key="d" op={op} />,
        <PeopleCell key="s" owners={saleOwnersOf(op)} missing="Chưa có Sale phụ trách" />,
      ],
    })),
  }
}

/** The grid's menu holds the two header filters the cards hide: the same close
 *  range and the same Sale list, read from the facet the header reads. */
function useDealMenu(
  query: OpportunityBookQuery,
  patch: (next: Partial<OpportunityBookQuery>) => void,
) {
  const { data: choices } = useQuery(opportunityFacetQuery({}))
  const closedOn = query.closedFrom !== undefined || query.closedTo !== undefined
  const saleOn = query.sale !== undefined
  return (
    <FilterMenu label="Bộ lọc nhóm chờ chăm sóc" active={Number(closedOn) + Number(saleOn)}>
      <FilterSection title="Ngày dừng">
        <ColumnFilterRange
          from={query.closedFrom}
          to={query.closedTo}
          close={noop}
          onApply={({ from, to }) => patch({ closedFrom: from, closedTo: to })}
        />
      </FilterSection>
      <FilterSection title="Sale phụ trách">
        <ColumnFilterList
          options={[
            { value: OWNER_NONE, label: 'Chưa có Sale' },
            ...peopleOptions(choices?.saleOwners ?? []),
          ]}
          selected={csvOf(query.sale)}
          close={noop}
          onApply={(v) => patch({ sale: v.length ? v.join(',') : undefined })}
        />
      </FilterSection>
    </FilterMenu>
  )
}

export function DealNurtureBook({ tabs, view, onView }: NurtureBookProps) {
  const navigate = useNavigate()
  const pageSize = view === 'grid' ? GRID_PAGE_SIZE : PAGE_SIZE
  const book = useBookQuery(SCHEMA, { size: pageSize, filterKeys: FILTER_KEYS })
  const query = { ...withoutTab(book.query), state: 'lost' as const }
  const { data, isPending, error, refetch } = useQuery(opportunityBookQuery(query))
  const { pageIndex } = useBookPageClamp(book, data?.total)
  const columns = useOpportunityFilters(query, book.patch)
  const chips = useOpportunityFilterChips(query, book.patch, data?.rows ?? [])
  const menu = useDealMenu(query, book.patch)
  const rows = data?.rows ?? []

  return (
    <BookPage
      title="Nhóm chờ chăm sóc"
      tabs={tabs}
      count={data && <BookCount total={data.total} noun="cơ hội" hidden={data.hidden} />}
      filters={chips}
      tools={
        <>
          <SearchField
            placeholder="Tìm theo tên cơ hội, mã cơ hội hoặc khách hàng…"
            value={book.text}
            meta={searchHint(book.text)}
            onChange={book.setText}
            className="min-w-0 flex-1 sm:max-w-[320px]"
          />
          <StopReasonFilter query={query} patch={book.patch} />
          {view === 'grid' && menu}
          <ViewSwitch value={view} onChange={onView} />
          {book.dirty && (
            <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={book.clear}>
              Bỏ hết bộ lọc
            </Button>
          )}
        </>
      }
      pending={isPending}
      failure={
        error
          ? {
              message: `Không tải được danh sách cơ hội. ${isApiError(error) ? userMessage(error) : 'Thử lại.'}`,
              onRetry: () => void refetch(),
            }
          : undefined
      }
      empty={
        rows.length === 0
          ? book.dirty
            ? {
                message: 'Không có cơ hội nào khớp bộ lọc.',
                action: { label: 'Bỏ hết bộ lọc', onClick: book.clear },
              }
            : {
                message: 'Chưa có cơ hội nào bị dừng.',
                action: { label: 'Tải lại', onClick: () => void refetch() },
              }
          : undefined
      }
      cards={
        view === 'grid' ? (
          <DealNurtureCards rows={rows} stopDate={(op) => <CloseCell op={op} />} />
        ) : undefined
      }
      table={view === 'table' ? dealNurtureTable(rows, columns, navigate) : undefined}
      footer={
        <TableFooter
          page={pageIndex}
          pageSize={pageSize}
          total={data?.total ?? 0}
          onPage={book.goPage}
        />
      }
    />
  )
}
