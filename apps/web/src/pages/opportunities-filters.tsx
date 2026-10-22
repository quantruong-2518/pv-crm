import { useQuery } from '@tanstack/react-query'
import { CalendarClock } from '@pv/ui'
import {
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  StageKey,
  type OpportunityBookQuery,
  type OpportunityBookRow,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import { NO_BD, NO_SALE, opportunityFacetQuery } from '@/data/opportunities'
import { opportunityStopReasonsQuery } from '@/data/opportunities-write'
import {
  amountChip,
  dayRangeChip,
  listChip,
  personNameOf,
  type ActiveFilter,
} from '@/components/active-filters'
import { csvOf, peopleOptions, toCsv } from '@/components/book-columns'
import { AmountRangeFilter, DayRangeFilter, ListFilter } from '@/components/book-filters'
import { closeDayOf } from './opportunities-model'

/** The deal book's column filters: `ListFilter` & co. in each header's `filter:`
 *  slot (iconOnly). Choices come from `/facets` over the whole visible book, so
 *  a list never collapses to its own pick.
 *
 *  Sale, BD, account and stage take a comma list, as the lead book's owner does. */

type Patch = (next: Partial<OpportunityBookQuery>) => void

/** Not a stage: the overdue flag rides in the stage column's list. */
const OVERDUE = 'overdue'

const byName = <T extends { name: string }>(people: readonly T[]) =>
  [...people].sort((a, b) => a.name.localeCompare(b.name, 'vi'))

export function useOpportunityFilters(query: OpportunityBookQuery, patch: Patch) {
  const { data: choices } = useQuery(opportunityFacetQuery({}))
  /* The csv filter cannot carry a name holding a comma, so it is not offered. */
  const accounts = (choices?.accounts ?? [])
    .filter((a) => !a.includes(','))
    .sort((a, b) => a.localeCompare(b, 'vi'))

  const stage = (
    <ListFilter
      label="Giai đoạn"
      searchable={false}
      options={[
        ...StageKey.options.map((s) => ({ value: s, label: OPPORTUNITY_STAGE_LABEL[s] })),
        { value: OVERDUE, label: 'Quá hạn ở giai đoạn hiện tại' },
      ]}
      value={toCsv([...csvOf(query.stage), ...(query.overdue ? [OVERDUE] : [])])}
      onChange={(csv) => {
        const v = csvOf(csv)
        const picked = StageKey.options.filter((s) => v.includes(s))
        patch({ stage: toCsv(picked), overdue: v.includes(OVERDUE) || undefined })
      }}
    />
  )

  /* The label names the date the funnel really filters, not the column's header. */
  const closeDay = closeDayOf(query)
  const closed =
    closeDay === 'closed' ? (
      <DayRangeFilter
        label="Ngày đóng"
        from={query.closedFrom}
        to={query.closedTo}
        onChange={({ from, to }) => patch({ closedFrom: from, closedTo: to })}
      />
    ) : closeDay === 'expected' ? (
      <DayRangeFilter
        label="Dự kiến chốt"
        from={query.expectedFrom}
        to={query.expectedTo}
        onChange={({ from, to }) => patch({ expectedFrom: from, expectedTo: to })}
      />
    ) : undefined

  return {
    account: (
      <ListFilter
        label="Khách hàng"
        options={accounts.map((a) => ({ value: a, label: a }))}
        value={query.account}
        onChange={(account) => patch({ account })}
      />
    ),
    stage,
    amount: (
      <AmountRangeFilter
        label="Giá trị (₫)"
        min={query.amountMin}
        max={query.amountMax}
        onChange={({ min, max }) => patch({ amountMin: min, amountMax: max })}
      />
    ),
    closed,
    bd: (
      <ListFilter
        label="BD phụ trách"
        options={peopleOptions(byName(choices?.bdOwners ?? []), NO_BD)}
        value={query.bd}
        onChange={(bd) => patch({ bd })}
      />
    ),
    sale: (
      <ListFilter
        label="Sale phụ trách"
        options={peopleOptions(byName(choices?.saleOwners ?? []), NO_SALE)}
        value={query.sale}
        onChange={(sale) => patch({ sale })}
      />
    ),
  }
}

const stageName = (s: string) => {
  const parsed = StageKey.safeParse(s)
  return parsed.success ? OPPORTUNITY_STAGE_LABEL[parsed.data] : s
}

/** The narrowings an overview link sets that a header dot alone would hide.
 *  The stop-reason list needs `opportunity.edit`; without it, or for a retired
 *  reason, the chip takes the label the server put on the loaded rows, else
 *  names its axis — never the bare id. */
export function useOpportunityFilterChips(
  query: OpportunityBookQuery,
  patch: Patch,
  rows: readonly OpportunityBookRow[],
): ActiveFilter[] {
  const canList = useCan('opportunity.edit')
  const { data: reasons } = useQuery({
    ...opportunityStopReasonsQuery,
    enabled: canList && query.stopReason !== undefined,
  })
  const { data: choices } = useQuery(opportunityFacetQuery({}))
  const owners = [...(choices?.saleOwners ?? []), ...(choices?.bdOwners ?? [])]
  const reasonName =
    query.stopReason === OPPORTUNITY_STOP_REASON_OTHER
      ? OPPORTUNITY_STOP_REASON_OTHER_LABEL
      : (reasons?.rows.find((r) => r.id === query.stopReason)?.name ??
        rows.find((r) => r.stopReason === query.stopReason)?.stopReasonLabel)
  return [
    ...(query.overdue === true
      ? [
          {
            id: 'overdue',
            label: 'Quá hạn',
            aria: 'Bỏ lọc quá hạn',
            icon: CalendarClock,
            className: 'text-on-tint-warning',
            onDrop: () => patch({ overdue: undefined }),
          },
        ]
      : []),
    ...listChip('stage', 'Giai đoạn', query.stage, stageName, () => patch({ stage: undefined })),
    ...listChip(
      'stoppedStage',
      'Dừng ở',
      query.stoppedStage,
      stageName,
      () => patch({ stoppedStage: undefined }),
      ' ',
    ),
    ...(query.stopReason
      ? [
          {
            id: 'stopReason',
            label: reasonName ? `Lý do dừng: ${reasonName}` : 'Lý do dừng',
            onDrop: () => patch({ stopReason: undefined }),
          },
        ]
      : []),
    ...(query.accepted === undefined
      ? []
      : [
          {
            id: 'accepted',
            label: `${query.accepted ? 'Đã qua' : 'Đang ở'} giai đoạn ${OPPORTUNITY_STAGE_LABEL.new}`,
            onDrop: () => patch({ accepted: undefined }),
          },
        ]),
    ...listChip(
      'account',
      'Khách hàng',
      query.account,
      (a) => a,
      () => patch({ account: undefined }),
    ),
    ...listChip('bd', 'BD', query.bd, personNameOf(owners, NO_BD), () => patch({ bd: undefined })),
    ...listChip('sale', 'Sale', query.sale, personNameOf(owners, NO_SALE), () =>
      patch({ sale: undefined }),
    ),
    ...amountChip('amount', 'Giá trị', query.amountMin, query.amountMax, () =>
      patch({ amountMin: undefined, amountMax: undefined }),
    ),
    ...dayRangeChip('expected', 'Dự kiến chốt', query.expectedFrom, query.expectedTo, () =>
      patch({ expectedFrom: undefined, expectedTo: undefined }),
    ),
    ...dayRangeChip('closed', 'Ngày đóng', query.closedFrom, query.closedTo, () =>
      patch({ closedFrom: undefined, closedTo: undefined }),
    ),
  ]
}
