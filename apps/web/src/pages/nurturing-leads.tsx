import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  ColumnFilter,
  ColumnFilterList,
  ColumnFilterRange,
  SearchField,
  Select,
} from '@pv/ui'
import { LEAD_STOP_REASON_OTHER, LeadBookQuery, type LeadRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { searchHint } from '@/lib/search-box'
import { leadBookQuery, leadStopReasonsQuery } from '@/data/leads'
import { leadLabelOptionsQuery } from '@/data/lead-labels'
import { stopReasonLabel } from '@/data/sales-config'
import { dayRangeChip, listChip } from '@/components/active-filters'
import { BookCount, BookPage, type BookTable } from '@/components/book-page'
import { FilterSection, ViewSwitch } from '@/components/book-cards'
import { GRID_PAGE_SIZE, noop } from '@/components/book-view'
import { ClaimLeadButton } from '@/components/lead-claim'
import { LabelChips } from '@/components/lead-labels'
import { CompanyCell, MomentCell } from '@/components/lead-cells'
import { LeadNurtureCards } from '@/components/nurture-cards'
import { FilterMenu, TableFooter } from '@/components/table-bits'
import { SourceCell } from './leads-parts'
import { withTab, withoutTab, type NurtureBookProps } from './nurturing-model'

/** The lead tab of the nurturing page: every lead parked in the pool, with the
 *  reason and the moment it went in. Reason, entry day and label narrow it; the
 *  overview's links land here with the first two already set. */

const PAGE_SIZE = 10
const SCHEMA = withTab(LeadBookQuery)
const FILTER_KEYS = ['exitReason', 'exitedFrom', 'exitedTo', 'label'] as const

const csvOf = (v?: string) => (v ? v.split(',') : [])

/** The reason list, the two header filters and the chips for what is narrowed.
 *  Each filter's body is written once: in a column popover for the table, or in
 *  a section of the grid's filter menu. */
function useNurtureFilters(query: LeadBookQuery, patch: (next: Partial<LeadBookQuery>) => void) {
  const { data: reasons } = useQuery(leadStopReasonsQuery)
  const { data: labels } = useQuery(leadLabelOptionsQuery)
  const reasonName = (id?: string) => stopReasonLabel(reasons?.rows, id)
  const labelName = (id: string) => labels?.rows.find((l) => l.id === id)?.name ?? id

  const dayBody = (close: () => void) => (
    <ColumnFilterRange
      from={query.exitedFrom}
      to={query.exitedTo}
      close={close}
      onApply={({ from, to }) => patch({ exitedFrom: from, exitedTo: to })}
    />
  )
  const labelBody = (close: () => void) => (
    <ColumnFilterList
      options={(labels?.rows ?? []).map((l) => ({ value: l.id, label: l.name }))}
      selected={csvOf(query.label)}
      close={close}
      onApply={(v) => patch({ label: v.length ? v.join(',') : undefined })}
    />
  )
  const dayOn = Boolean(query.exitedFrom || query.exitedTo)
  const labelOn = Boolean(query.label)

  const dayFilter = (
    <ColumnFilter iconOnly label="Ngày vào nhóm" active={dayOn}>
      {dayBody}
    </ColumnFilter>
  )
  const labelFilter = (
    <ColumnFilter label="Nhãn" active={labelOn}>
      {labelBody}
    </ColumnFilter>
  )
  const menu = (
    <FilterMenu label="Bộ lọc nhóm chờ chăm sóc" active={Number(dayOn) + Number(labelOn)}>
      <FilterSection title="Ngày vào nhóm">{dayBody(noop)}</FilterSection>
      <FilterSection title="Nhãn">{labelBody(noop)}</FilterSection>
    </FilterMenu>
  )

  const chips = [
    ...(query.exitReason
      ? [
          {
            id: 'exitReason',
            label: `Lý do: ${reasonName(query.exitReason)}`,
            onDrop: () => patch({ exitReason: undefined }),
          },
        ]
      : []),
    ...dayRangeChip('exited', 'Ngày vào nhóm', query.exitedFrom, query.exitedTo, () =>
      patch({ exitedFrom: undefined, exitedTo: undefined }),
    ),
    ...listChip('label', 'Nhãn', query.label, labelName, () => patch({ label: undefined })),
  ]

  return { reasons, reasonName, dayFilter, labelFilter, menu, chips }
}

/** The table view, as the tab drew it before cards. */
function leadNurtureTable(
  rows: LeadRow[],
  filters: ReturnType<typeof useNurtureFilters>,
  canClaim: boolean,
  navigate: (to: string) => void,
): BookTable {
  const { reasonName, dayFilter, labelFilter } = filters
  return {
    minWidth: 'min-w-[960px]',
    columns: [
      { header: 'Công ty / Người liên hệ', width: 'minmax(0,2.2fr)' },
      { header: 'Lý do', width: 'minmax(0,1.4fr)' },
      { header: 'Ngày vào nhóm', filter: dayFilter, width: 'minmax(0,1fr)' },
      { header: labelFilter, width: 'minmax(0,1.2fr)' },
      { header: 'Nguồn lead', width: 'minmax(0,1.3fr)' },
      ...(canClaim
        ? [
            {
              header: <span className="sr-only">Nhận lead</span>,
              width: '144px',
              align: 'center' as const,
            },
          ]
        : []),
    ],
    rows: rows.map((l) => ({
      id: l.code,
      onOpen: () => navigate(`/sales/leads/${encodeURIComponent(l.code)}`),
      cells: [
        <CompanyCell key="c" lead={l} />,
        <span key="r" className="truncate text-[13px]" title={reasonName(l.exitReason)}>
          {reasonName(l.exitReason) ?? '—'}
        </span>,
        <MomentCell key="d" iso={l.exitedAt} />,
        <LabelChips key="l" labels={l.labels} max={2} className="flex-nowrap" />,
        <SourceCell key="s" lead={l} />,
        ...(canClaim ? [<ClaimLeadButton key="a" code={l.code} />] : []),
      ],
    })),
  }
}

export function LeadNurtureBook({ tabs, view, onView }: NurtureBookProps) {
  const navigate = useNavigate()
  const canClaim = useCan('lead.edit')
  const pageSize = view === 'grid' ? GRID_PAGE_SIZE : PAGE_SIZE
  const book = useBookQuery(SCHEMA, { size: pageSize, filterKeys: FILTER_KEYS })
  const query = { ...withoutTab(book.query), state: 'nurturing' as const }
  const { data, isPending, error, refetch } = useQuery(leadBookQuery(query))
  const { pageIndex } = useBookPageClamp(book, data?.total)
  const filters = useNurtureFilters(query, book.patch)
  const { reasons, chips } = filters
  const rows = data?.rows ?? []

  return (
    <BookPage
      title="Nhóm chờ chăm sóc"
      tabs={tabs}
      count={data && <BookCount total={data.total} noun="lead" hidden={data.hidden} />}
      filters={chips}
      tools={
        <>
          <SearchField
            placeholder="Tìm theo tên công ty, người liên hệ hoặc mã lead…"
            value={book.text}
            meta={searchHint(book.text)}
            onChange={book.setText}
            className="min-w-0 flex-1 sm:max-w-[320px]"
          />
          <Select
            label="Lý do"
            value={query.exitReason ?? ''}
            neutralValue=""
            options={[
              { value: '', label: 'Tất cả' },
              ...(reasons?.rows ?? []).map((r) => ({ value: r.id, label: r.name })),
              { value: LEAD_STOP_REASON_OTHER, label: 'Khác' },
            ]}
            onChange={(value) => book.patch({ exitReason: value === '' ? undefined : value })}
            className="pointer-coarse:[&>button]:h-12 max-w-[240px]"
          />
          {view === 'grid' && filters.menu}
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
              message: `Không tải được danh sách lead. ${isApiError(error) ? userMessage(error) : 'Thử lại.'}`,
              onRetry: () => void refetch(),
            }
          : undefined
      }
      empty={
        rows.length === 0
          ? book.dirty
            ? {
                message: 'Không có lead nào khớp bộ lọc.',
                action: { label: 'Bỏ hết bộ lọc', onClick: book.clear },
              }
            : {
                message: 'Chưa có lead nào trong nhóm chờ.',
                action: { label: 'Tải lại', onClick: () => void refetch() },
              }
          : undefined
      }
      cards={
        view === 'grid' ? (
          <LeadNurtureCards rows={rows} reasonName={filters.reasonName} canClaim={canClaim} />
        ) : undefined
      }
      table={view === 'table' ? leadNurtureTable(rows, filters, canClaim, navigate) : undefined}
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
