import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  ColumnFilter,
  ColumnFilterList,
  ColumnFilterRange,
  SearchField,
  SegmentedControl,
  Select,
} from '@pv/ui'
import { LEAD_STOP_REASON_OTHER, LeadBookQuery, vnDayOf, type LeadRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { searchHint } from '@/lib/search-box'
import { leadBookQuery, leadStopReasonsQuery } from '@/data/leads'
import { leadLabelOptionsQuery } from '@/data/lead-labels'
import { recareCountsQuery } from '@/data/stop-log'
import { stopReasonLabel } from '@/data/sales-config'
import { dayRangeChip, listChip } from '@/components/active-filters'
import { BookCount, BookPage, type BookTable } from '@/components/book-page'
import { FilterSection, ViewSwitch } from '@/components/book-cards'
import { GRID_PAGE_SIZE, noop, useBookView } from '@/components/book-view'
import { ClaimLeadButton } from '@/components/lead-claim'
import { LabelChips } from '@/components/lead-labels'
import { CompanyCell, MomentCell } from '@/components/lead-cells'
import { LeadNurtureCards, RecontactCell } from '@/components/nurture-cards'
import { FilterMenu, TableFooter } from '@/components/table-bits'
import { SourceCell } from './leads-parts'
import {
  PAGE_TITLE,
  RECARE_GROUPS,
  RECARE_GROUP_LABEL,
  defaultGroup,
  groupQuery,
  withPageKeys,
  withoutPageKeys,
  type NurtureTabProps,
  type RecareGroup,
} from './nurturing-model'

/** The re-contact tab (ADR 0125): parked leads by re-contact day, and
 *  the leads a customer reply brought back. The group lives in the address;
 *  with none there, fresh replies open first while there are any. Reason and
 *  entry day narrow only the parked groups — a reply clears both on the lead. */

const PAGE_SIZE = 10
const SCHEMA = withPageKeys(LeadBookQuery)
const FILTER_KEYS = ['exitReason', 'exitedFrom', 'exitedTo', 'label'] as const
const NO_POOL_FILTERS = { exitReason: undefined, exitedFrom: undefined, exitedTo: undefined }

const EMPTY: Record<RecareGroup, string> = {
  replied: 'Chưa có khách nào vừa phản hồi.',
  due: 'Không có lead nào đến hạn liên hệ lại.',
  later: 'Không có lead nào hẹn liên hệ lại sau.',
  none: 'Không có lead nào chưa hẹn ngày liên hệ lại.',
}

const csvOf = (v?: string) => (v ? v.split(',') : [])

/** The header filters and the chips for what is narrowed. Each filter's body is
 *  written once: in a column popover for the table, or in the grid's menu. */
function useRecareFilters(
  query: LeadBookQuery,
  replied: boolean,
  patch: (next: Partial<LeadBookQuery>) => void,
) {
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
    <FilterMenu label="Bộ lọc khách đã dừng" active={Number(dayOn) + Number(labelOn)}>
      {!replied && <FilterSection title="Ngày vào nhóm">{dayBody(noop)}</FilterSection>}
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

type Filters = ReturnType<typeof useRecareFilters>

/** A parked lead: why, since when, when to call again, and the claim. */
function parkedTable(
  rows: LeadRow[],
  filters: Filters,
  today: string,
  canClaim: boolean,
  open: (code: string) => void,
): BookTable {
  const { reasonName, dayFilter, labelFilter } = filters
  return {
    minWidth: 'min-w-[1040px]',
    columns: [
      { header: 'Công ty / Người liên hệ', width: 'minmax(0,2.2fr)' },
      { header: 'Lý do', width: 'minmax(0,1.4fr)' },
      { header: 'Ngày vào nhóm', filter: dayFilter, width: 'minmax(0,1fr)' },
      { header: 'Liên hệ lại', width: 'minmax(0,1fr)' },
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
      onOpen: () => open(l.code),
      cells: [
        <CompanyCell key="c" lead={l} />,
        <span key="r" className="truncate text-[13px]" title={reasonName(l.exitReason)}>
          {reasonName(l.exitReason) ?? '—'}
        </span>,
        <MomentCell key="d" iso={l.exitedAt} />,
        <RecontactCell key="n" on={l.recontactOn} today={today} />,
        <LabelChips key="l" labels={l.labels} max={2} className="flex-nowrap" />,
        <SourceCell key="s" lead={l} />,
        ...(canClaim ? [<ClaimLeadButton key="a" code={l.code} />] : []),
      ],
    })),
  }
}

/** A lead a reply brought back: in `new`, assigned the usual way from its page. */
function repliedTable(rows: LeadRow[], filters: Filters, open: (code: string) => void): BookTable {
  return {
    minWidth: 'min-w-[800px]',
    columns: [
      { header: 'Công ty / Người liên hệ', width: 'minmax(0,2.2fr)' },
      { header: 'Phản hồi lúc', width: 'minmax(0,1fr)' },
      { header: filters.labelFilter, width: 'minmax(0,1.2fr)' },
      { header: 'Nguồn lead', width: 'minmax(0,1.3fr)' },
    ],
    rows: rows.map((l) => ({
      id: l.code,
      onOpen: () => open(l.code),
      cells: [
        <CompanyCell key="c" lead={l} />,
        <MomentCell key="t" iso={l.repliedFromPoolAt ?? undefined} />,
        <LabelChips key="l" labels={l.labels} max={2} className="flex-nowrap" />,
        <SourceCell key="s" lead={l} />,
      ],
    })),
  }
}

export function RecareBook({ nav }: NurtureTabProps) {
  const navigate = useNavigate()
  const canClaim = useCan('lead.edit')
  const [view, setView] = useBookView('pv.nurturing.view')
  const [today] = useState(() => vnDayOf(new Date()))
  const pageSize = view === 'grid' ? GRID_PAGE_SIZE : PAGE_SIZE
  const book = useBookQuery(SCHEMA, { size: pageSize, filterKeys: FILTER_KEYS })
  const counts = useQuery(recareCountsQuery)
  /* Unset in the address: wait for the counts, or the book would flash `due` first. */
  const group = book.query.group ?? (counts.isPending ? undefined : defaultGroup(counts.data))
  const replied = group === 'replied'
  const query: LeadBookQuery = {
    ...withoutPageKeys(book.query),
    ...(replied ? NO_POOL_FILTERS : {}),
    ...groupQuery(group ?? 'due'),
  }
  const { data, isPending, error, refetch } = useQuery({
    ...leadBookQuery(query),
    enabled: group !== undefined,
  })
  const { pageIndex } = useBookPageClamp(book, data?.total)
  const filters = useRecareFilters(query, replied, book.patch)
  const rows = data?.rows ?? []
  const open = (code: string) => navigate(`/sales/leads/${encodeURIComponent(code)}`)

  const groups = (
    <SegmentedControl
      label="Nhóm"
      hideLabel
      tone="quiet"
      value={group ?? ''}
      options={RECARE_GROUPS.map((g) => ({
        value: g,
        label: RECARE_GROUP_LABEL[g],
        count: counts.data?.[g],
      }))}
      onChange={(value) =>
        book.patch({ group: value as RecareGroup, ...(value === 'replied' ? NO_POOL_FILTERS : {}) })
      }
    />
  )

  return (
    <BookPage
      title={PAGE_TITLE}
      nav={nav}
      tabs={groups}
      count={data && <BookCount total={data.total} noun="lead" hidden={data.hidden} />}
      filters={filters.chips}
      tools={
        <>
          <SearchField
            placeholder="Tìm theo tên công ty, người liên hệ hoặc mã lead…"
            value={book.text}
            meta={searchHint(book.text)}
            onChange={book.setText}
            className="min-w-0 flex-1 sm:max-w-[320px]"
          />
          {!replied && (
            <Select
              label="Lý do"
              value={query.exitReason ?? ''}
              neutralValue=""
              options={[
                { value: '', label: 'Tất cả' },
                ...(filters.reasons?.rows ?? []).map((r) => ({ value: r.id, label: r.name })),
                { value: LEAD_STOP_REASON_OTHER, label: 'Khác' },
              ]}
              onChange={(value) => book.patch({ exitReason: value === '' ? undefined : value })}
              className="pointer-coarse:[&>button]:h-12 max-w-[240px]"
            />
          )}
          {view === 'grid' && filters.menu}
          <ViewSwitch value={view} onChange={setView} />
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
                message: EMPTY[group ?? 'due'],
                action: { label: 'Tải lại', onClick: () => void refetch() },
              }
          : undefined
      }
      cards={
        view === 'grid' ? (
          <LeadNurtureCards
            rows={rows}
            replied={replied}
            today={today}
            reasonName={filters.reasonName}
            canClaim={canClaim}
          />
        ) : undefined
      }
      table={
        view === 'table'
          ? replied
            ? repliedTable(rows, filters, open)
            : parkedTable(rows, filters, today, canClaim, open)
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
  )
}
