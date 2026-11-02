import { useQuery } from '@tanstack/react-query'
import { CalendarClock } from '@pv/ui'
import {
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  StageKey,
  type OpportunityBookQuery,
  type OpportunityBookRow,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import { getLang, message, useI18n } from '@/app/i18n'
import { opportunityStageLabel } from '@/data/sales-labels-i18n'
import { NO_BD_COPY, NO_SALE_COPY, opportunityFacetQuery } from '@/data/opportunities'
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
  const { t, lang } = useI18n()
  const { data: choices } = useQuery(opportunityFacetQuery({}))
  /* The csv filter cannot carry a name holding a comma, so it is not offered. */
  const accounts = (choices?.accounts ?? [])
    .filter((a) => !a.includes(','))
    .sort((a, b) => a.localeCompare(b, 'vi'))

  const stage = (
    <ListFilter
      label={t(message('Giai đoạn', 'Stage', '단계'))}
      searchable={false}
      options={[
        ...StageKey.options.map((s) => ({ value: s, label: opportunityStageLabel(s, lang) })),
        {
          value: OVERDUE,
          label: t(
            message(
              'Quá hạn ở giai đoạn hiện tại',
              'Overdue in the current stage',
              '현재 단계에서 기한 초과',
            ),
          ),
        },
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
        label={t(message('Ngày đóng', 'Closed on', '종료일'))}
        from={query.closedFrom}
        to={query.closedTo}
        onChange={({ from, to }) => patch({ closedFrom: from, closedTo: to })}
      />
    ) : closeDay === 'expected' ? (
      <DayRangeFilter
        label={t(message('Dự kiến chốt', 'Expected close', '예상 마감'))}
        from={query.expectedFrom}
        to={query.expectedTo}
        onChange={({ from, to }) => patch({ expectedFrom: from, expectedTo: to })}
      />
    ) : undefined

  return {
    account: (
      <ListFilter
        label={t(message('Khách hàng', 'Customer', '고객'))}
        options={accounts.map((a) => ({ value: a, label: a }))}
        value={query.account}
        onChange={(account) => patch({ account })}
      />
    ),
    stage,
    amount: (
      <AmountRangeFilter
        label={t(message('Giá trị (₫)', 'Value (₫)', '금액 (₫)'))}
        min={query.amountMin}
        max={query.amountMax}
        onChange={({ min, max }) => patch({ amountMin: min, amountMax: max })}
      />
    ),
    closed,
    bd: (
      <ListFilter
        label={t(message('BD phụ trách', 'BD in charge', '담당 BD'))}
        options={peopleOptions(byName(choices?.bdOwners ?? []), t(NO_BD_COPY))}
        value={query.bd}
        onChange={(bd) => patch({ bd })}
      />
    ),
    sale: (
      <ListFilter
        label={t(message('Sale phụ trách', 'Salesperson in charge', '담당 영업'))}
        options={peopleOptions(byName(choices?.saleOwners ?? []), t(NO_SALE_COPY))}
        value={query.sale}
        onChange={(sale) => patch({ sale })}
      />
    ),
  }
}

const stageName = (s: string) => {
  const parsed = StageKey.safeParse(s)
  return parsed.success ? opportunityStageLabel(parsed.data, getLang()) : s
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
  const { t } = useI18n()
  const canList = useCan('opportunity.edit')
  const { data: reasons } = useQuery({
    ...opportunityStopReasonsQuery,
    enabled: canList && query.stopReason !== undefined,
  })
  const { data: choices } = useQuery(opportunityFacetQuery({}))
  const owners = [...(choices?.saleOwners ?? []), ...(choices?.bdOwners ?? [])]
  const reasonName =
    query.stopReason === OPPORTUNITY_STOP_REASON_OTHER
      ? t(message(OPPORTUNITY_STOP_REASON_OTHER_LABEL, 'Other', '기타'))
      : (reasons?.rows.find((r) => r.id === query.stopReason)?.name ??
        rows.find((r) => r.stopReason === query.stopReason)?.stopReasonLabel)
  return [
    ...(query.overdue === true
      ? [
          {
            id: 'overdue',
            label: t(message('Quá hạn', 'Overdue', '기한 초과')),
            aria: t(message('Bỏ lọc quá hạn', 'Remove overdue filter', '기한 초과 필터 해제')),
            icon: CalendarClock,
            className: 'text-on-tint-warning',
            onDrop: () => patch({ overdue: undefined }),
          },
        ]
      : []),
    ...listChip('stage', t(message('Giai đoạn', 'Stage', '단계')), query.stage, stageName, () =>
      patch({ stage: undefined }),
    ),
    ...listChip(
      'stoppedStage',
      t(message('Dừng ở', 'Stopped at', '중단 단계')),
      query.stoppedStage,
      stageName,
      () => patch({ stoppedStage: undefined }),
      ' ',
    ),
    ...(query.stopReason
      ? [
          {
            id: 'stopReason',
            label: reasonName
              ? t(
                  message(
                    `Lý do dừng: ${reasonName}`,
                    `Stop reason: ${reasonName}`,
                    `중단 사유: ${reasonName}`,
                  ),
                )
              : t(message('Lý do dừng', 'Stop reason', '중단 사유')),
            onDrop: () => patch({ stopReason: undefined }),
          },
        ]
      : []),
    ...(query.accepted === undefined
      ? []
      : [
          {
            id: 'accepted',
            label: t(
              query.accepted
                ? message(
                    `Đã qua giai đoạn ${opportunityStageLabel('new', 'vi')}`,
                    `Past the ${opportunityStageLabel('new', 'en')} stage`,
                    `${opportunityStageLabel('new', 'ko')} 단계를 지남`,
                  )
                : message(
                    `Đang ở giai đoạn ${opportunityStageLabel('new', 'vi')}`,
                    `In the ${opportunityStageLabel('new', 'en')} stage`,
                    `${opportunityStageLabel('new', 'ko')} 단계에 있음`,
                  ),
            ),
            onDrop: () => patch({ accepted: undefined }),
          },
        ]),
    ...listChip(
      'account',
      t(message('Khách hàng', 'Customer', '고객')),
      query.account,
      (a) => a,
      () => patch({ account: undefined }),
    ),
    ...listChip('bd', 'BD', query.bd, personNameOf(owners, t(NO_BD_COPY)), () =>
      patch({ bd: undefined }),
    ),
    ...listChip(
      'sale',
      t(message('Sale', 'Sales', '영업')),
      query.sale,
      personNameOf(owners, t(NO_SALE_COPY)),
      () => patch({ sale: undefined }),
    ),
    ...amountChip(
      'amount',
      t(message('Giá trị', 'Value', '금액')),
      query.amountMin,
      query.amountMax,
      () => patch({ amountMin: undefined, amountMax: undefined }),
    ),
    ...dayRangeChip(
      'expected',
      t(message('Dự kiến chốt', 'Expected close', '예상 마감')),
      query.expectedFrom,
      query.expectedTo,
      () => patch({ expectedFrom: undefined, expectedTo: undefined }),
    ),
    ...dayRangeChip(
      'closed',
      t(message('Ngày đóng', 'Closed on', '종료일')),
      query.closedFrom,
      query.closedTo,
      () => patch({ closedFrom: undefined, closedTo: undefined }),
    ),
  ]
}
