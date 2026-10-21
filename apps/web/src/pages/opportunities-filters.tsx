import { useQuery } from '@tanstack/react-query'
import { CalendarClock, ColumnFilter, ColumnFilterList, ColumnFilterRange } from '@pv/ui'
import {
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  OWNER_NONE,
  StageKey,
  type OpportunityBookQuery,
  type OpportunityBookRow,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import { opportunityFacetQuery } from '@/data/opportunities'
import { opportunityStopReasonsQuery } from '@/data/opportunities-write'
import { dayRangeChip, listChip, type ActiveFilter } from '@/components/active-filters'
import { csvOf, peopleOptions } from './opportunities-model'

/** The deal book's column filters, the lead book's pattern (ColumnFilter in the
 *  header, the clear-all button in the toolbar). Choices come from `/facets` over the
 *  whole visible book, so a list never collapses to its own pick.
 *
 *  Sale, BD, account and stage take a comma list, as the lead book's owner does. */

type Patch = (next: Partial<OpportunityBookQuery>) => void

/** Not a stage: the overdue flag rides in the stage column's list. */
const OVERDUE = 'overdue'

export function useOpportunityFilters(query: OpportunityBookQuery, patch: Patch) {
  const { data: choices } = useQuery(opportunityFacetQuery({}))
  /* The csv filter cannot carry a name holding a comma, so it is not offered. */
  const accounts = (choices?.accounts ?? [])
    .filter((a) => !a.includes(','))
    .sort((a, b) => a.localeCompare(b, 'vi'))

  const multi = (
    label: string,
    key: 'sale' | 'bd' | 'account',
    options: { value: string; label: string }[],
    iconOnly?: boolean,
  ) => (
    <ColumnFilter label={label} active={query[key] !== undefined} iconOnly={iconOnly}>
      {(close) => (
        <ColumnFilterList
          options={options}
          selected={csvOf(query[key])}
          close={close}
          onApply={(v) => patch({ [key]: v.length ? v.join(',') : undefined })}
        />
      )}
    </ColumnFilter>
  )

  const stage = (
    <ColumnFilter
      label="Giai đoạn"
      active={query.stage !== undefined || query.overdue !== undefined}
    >
      {(close) => (
        <ColumnFilterList
          searchable={false}
          options={[
            ...StageKey.options.map((s) => ({ value: s, label: OPPORTUNITY_STAGE_LABEL[s] })),
            { value: OVERDUE, label: 'Quá hạn ở giai đoạn hiện tại' },
          ]}
          selected={[...csvOf(query.stage), ...(query.overdue ? [OVERDUE] : [])]}
          close={close}
          onApply={(v) => {
            const picked = StageKey.options.filter((s) => v.includes(s))
            patch({
              stage: picked.length ? picked.join(',') : undefined,
              overdue: v.includes(OVERDUE) || undefined,
            })
          }}
        />
      )}
    </ColumnFilter>
  )

  const closed = (
    <ColumnFilter
      label="Ngày đóng"
      active={query.closedFrom !== undefined || query.closedTo !== undefined}
      iconOnly
    >
      {(close) => (
        <ColumnFilterRange
          from={query.closedFrom}
          to={query.closedTo}
          close={close}
          onApply={({ from, to }) => patch({ closedFrom: from, closedTo: to })}
        />
      )}
    </ColumnFilter>
  )

  return {
    account: multi(
      'Khách hàng',
      'account',
      accounts.map((a) => ({ value: a, label: a })),
      true,
    ),
    stage,
    /* An open deal has no close day, so on the open tab the range only empties the book. */
    closed: query.state === 'open' ? null : closed,
    bd: multi('BD phụ trách', 'bd', [
      { value: OWNER_NONE, label: 'Chưa ghi BD' },
      ...peopleOptions(choices?.bdOwners ?? []),
    ]),
    sale: multi('Sale phụ trách', 'sale', [
      { value: OWNER_NONE, label: 'Chưa có Sale' },
      ...peopleOptions(choices?.saleOwners ?? []),
    ]),
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
    ...dayRangeChip('closed', 'Ngày đóng', query.closedFrom, query.closedTo, () =>
      patch({ closedFrom: undefined, closedTo: undefined }),
    ),
  ]
}
