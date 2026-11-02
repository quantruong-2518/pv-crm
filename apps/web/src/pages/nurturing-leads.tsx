import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ColumnFilter, ColumnFilterList, ColumnFilterRange, SegmentedControl, Select } from '@pv/ui'
import { LEAD_STOP_REASON_OTHER, LeadBookQuery, vnDayOf, type LeadRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useI18n } from '@/app/i18n'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { leadBookQuery, leadStopReasonsQuery } from '@/data/leads'
import { leadLabelOptionsQuery } from '@/data/lead-labels'
import { recareCountsQuery } from '@/data/stop-log'
import { stopReasonLabel } from '@/data/sales-config'
import { NURTURING_COPY as COPY } from '@/data/nurturing-copy'
import { dayRangeChip, listChip } from '@/components/active-filters'
import { BookCount, BookPage, BookSearch, type BookTable } from '@/components/book-page'
import { FilterSection, ViewSwitch } from '@/components/book-cards'
import { GRID_PAGE_SIZE, noop, useBookView } from '@/components/book-view'
import { ClaimLeadButton } from '@/components/lead-claim'
import { LabelChips } from '@/components/lead-labels'
import { CompanyCell, MomentCell } from '@/components/lead-cells'
import { LeadNurtureCards, RecontactCell } from '@/components/nurture-cards'
import { FilterMenu, TableFooter } from '@/components/table-bits'
import { COL } from '@/components/book-columns'
import { SourceCell } from './leads-parts'
import {
  RECARE_GROUPS,
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

const csvOf = (v?: string) => (v ? v.split(',') : [])

/** The header filters and the chips for what is narrowed. Each filter's body is
 *  written once: in a column popover for the table, or in the grid's menu. */
function useRecareFilters(
  query: LeadBookQuery,
  replied: boolean,
  patch: (next: Partial<LeadBookQuery>) => void,
) {
  const { t } = useI18n()
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
    <ColumnFilter iconOnly label={t(COPY.dayEntered)} active={dayOn}>
      {dayBody}
    </ColumnFilter>
  )
  const labelFilter = (
    <ColumnFilter label={t(COPY.label)} active={labelOn}>
      {labelBody}
    </ColumnFilter>
  )
  const menu = (
    <FilterMenu label={t(COPY.filtersMenu)} active={Number(dayOn) + Number(labelOn)}>
      {!replied && <FilterSection title={t(COPY.dayEntered)}>{dayBody(noop)}</FilterSection>}
      <FilterSection title={t(COPY.label)}>{labelBody(noop)}</FilterSection>
    </FilterMenu>
  )

  /* The reason shows its pick in its own Select, so it gets no chip. */
  const chips = [
    ...dayRangeChip('exited', t(COPY.dayEntered), query.exitedFrom, query.exitedTo, () =>
      patch({ exitedFrom: undefined, exitedTo: undefined }),
    ),
    ...listChip('label', t(COPY.label), query.label, labelName, () => patch({ label: undefined })),
  ]

  return { reasons, reasonName, dayFilter, labelFilter, menu, chips }
}

type Filters = ReturnType<typeof useRecareFilters>
type Translate = ReturnType<typeof useI18n>['t']

/** A parked lead: why, since when, when to call again, and the claim. */
function parkedTable(
  rows: LeadRow[],
  filters: Filters,
  today: string,
  canClaim: boolean,
  open: (code: string) => void,
  t: Translate,
): BookTable {
  const { reasonName, dayFilter, labelFilter } = filters
  /* px floors: narrower, the card scrolls sideways instead of cells overlapping. */
  return {
    pageSize: PAGE_SIZE,
    columns: [
      { header: t(COPY.company), width: COL.name },
      { header: t(COPY.reason), width: 'minmax(136px,1.4fr)' },
      {
        header: t(COPY.dayEntered),
        filter: dayFilter,
        width: '144px',
      },
      { header: t(COPY.recontact), width: '112px' },
      { header: labelFilter, width: 'minmax(120px,1.2fr)' },
      { header: t(COPY.leadSource), width: 'minmax(120px,1.3fr)' },
      ...(canClaim
        ? [
            {
              header: <span className="sr-only">{t(COPY.claimLead)}</span>,
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
        <span key="r" className="block truncate text-[13px]" title={reasonName(l.exitReason)}>
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
function repliedTable(
  rows: LeadRow[],
  filters: Filters,
  open: (code: string) => void,
  t: Translate,
): BookTable {
  return {
    pageSize: PAGE_SIZE,
    columns: [
      { header: t(COPY.company), width: COL.name },
      { header: t(COPY.repliedAt), width: '144px' },
      { header: filters.labelFilter, width: 'minmax(120px,1.2fr)' },
      { header: t(COPY.leadSource), width: 'minmax(120px,1.3fr)' },
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
  const { t } = useI18n()
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
  /* Replies ignore the pool keys a link may still carry; they would offer a
     clear button with no chip to say what it clears. */
  const dirty = replied ? book.text.trim() !== '' || query.label !== undefined : book.dirty
  const rows = data?.rows ?? []
  const open = (code: string) => navigate(`/sales/leads/${encodeURIComponent(code)}`)
  const groups = (
    <SegmentedControl
      label={t(COPY.groupLabel)}
      hideLabel
      tone="quiet"
      value={group ?? ''}
      options={RECARE_GROUPS.map((g) => ({
        value: g,
        label: t(COPY.groups[g]),
        count: counts.data?.[g],
      }))}
      onChange={(value) =>
        book.patch({
          group: value as RecareGroup,
          ...(value === 'replied' ? NO_POOL_FILTERS : {}),
        })
      }
    />
  )

  return (
    <BookPage
      title={t(COPY.title)}
      nav={nav}
      tabs={groups}
      count={data && <BookCount total={data.total} noun={t(COPY.leadNoun)} hidden={data.hidden} />}
      filters={filters.chips}
      onClearFilters={dirty ? book.clear : undefined}
      tools={
        <>
          <BookSearch placeholder={t(COPY.search)} value={book.text} onChange={book.setText} />
          {!replied && (
            <Select
              label={t(COPY.reason)}
              value={query.exitReason ?? ''}
              neutralValue=""
              options={[
                { value: '', label: t(COPY.all) },
                ...(filters.reasons?.rows ?? []).map((r) => ({ value: r.id, label: r.name })),
                { value: LEAD_STOP_REASON_OTHER, label: t(COPY.other) },
              ]}
              onChange={(value) => book.patch({ exitReason: value === '' ? undefined : value })}
              className="pointer-coarse:[&>button]:h-12 max-w-[240px]"
            />
          )}
          {view === 'grid' && filters.menu}
          <ViewSwitch value={view} onChange={setView} />
        </>
      }
      pending={isPending}
      failure={
        error
          ? {
              message: `${t(COPY.leadsFailed)} ${isApiError(error) ? userMessage(error) : t(COPY.retry)}`,
              onRetry: () => void refetch(),
            }
          : undefined
      }
      empty={
        rows.length === 0
          ? dirty
            ? {
                message: t(COPY.noMatch),
                action: { label: t(COPY.clearFilters), onClick: book.clear },
              }
            : {
                message: t(COPY.empty[group ?? 'due']),
                action: { label: t(COPY.reload), onClick: () => void refetch() },
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
            ? repliedTable(rows, filters, open, t)
            : parkedTable(rows, filters, today, canClaim, open, t)
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
