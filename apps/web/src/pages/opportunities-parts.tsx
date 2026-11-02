import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CircleX,
  SegmentedControl,
  Select,
  FileCheck,
  Icon,
  StatCard,
  Target,
  Wallet,
  billions,
  percent,
} from '@pv/ui'
import {
  OPPORTUNITY_STATE_LABEL,
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  type OpportunityBookQuery,
  type OpportunityStatus,
} from '@pv/contracts'
import {
  facetsQueryOf,
  opportunityFacetQuery,
  opportunityScorecardQuery,
} from '@/data/opportunities'
import { useCan } from '@/app/auth'
import { opportunityStopReasonsQuery } from '@/data/opportunities-write'
import { usePins } from '@/data/pins'
import { BookCount } from '@/components/book-page'
import { ANY, CLOSED_TABS, stateTabs } from './opportunities-model'
import { message, useI18n } from '@/app/i18n'

/** Module 3 · the deal book's blocks: the state tabs, the count with its hold
 *  link (the filters sit in the column headers) and the score cards
 *  (ADR 0077). Mounted by `opportunities.tsx`. */

type Patch = (next: Partial<OpportunityBookQuery>) => void

/** The pinned tab's value — `pinned=true` on the URL, across every state. */
const PINNED = 'pinned'

/** A stop reason and the stopped-at column narrow only stopped deals, so every
 *  tab press drops them. The close-day column filters one date per tab: an
 *  expected day on open and pinned, a closed day on won, lost and terminated,
 *  none on "all" — so a range of the kind the new tab cannot show goes too. */
function tabPatch(value: string): Partial<OpportunityBookQuery> {
  const noExpected = { expectedFrom: undefined, expectedTo: undefined }
  const noClosed = { closedFrom: undefined, closedTo: undefined }
  const dropped = {
    stopReason: undefined,
    stoppedStage: undefined,
    ...(value === 'open' || value === PINNED ? noClosed : {}),
    ...(CLOSED_TABS.includes(value) ? noExpected : {}),
    ...(value === ANY ? { ...noExpected, ...noClosed } : {}),
  }
  return value === PINNED
    ? { ...dropped, pinned: true, state: undefined }
    : {
        ...dropped,
        state: value === ANY ? undefined : (value as OpportunityStatus),
        pinned: undefined,
      }
}

/** Tab counts honour every other filter in force; the pinned tab counts the
 *  person's own pins. The tabs count the book, not the pins nor a stop
 *  narrowing — as the lead book's do. */
function useBookFacets(query: OpportunityBookQuery) {
  return useQuery(
    opportunityFacetQuery(
      facetsQueryOf({
        ...query,
        pinned: undefined,
        stopReason: undefined,
        stoppedStage: undefined,
      }),
    ),
  ).data
}

/** The toolbar's left end: the state tabs, and the stop reason on the stopped tab. */
export function BookTabs({ query, onPatch }: { query: OpportunityBookQuery; onPatch: Patch }) {
  const { t, lang } = useI18n()
  const facets = useBookFacets(query)
  const pinCount = usePins('opportunity').codes.length
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <SegmentedControl
        label={t(message('Trạng thái cơ hội', 'Opportunity status', '기회 상태'))}
        hideLabel
        tone="quiet"
        value={query.pinned ? PINNED : (query.state ?? ANY)}
        options={[
          ...stateTabs(facets?.byState, lang),
          { value: PINNED, label: t(message('Đã ghim', 'Pinned', '고정됨')), count: pinCount },
        ]}
        onChange={(value) => onPatch(tabPatch(value))}
      />
      <StopReasonFilter query={query} patch={onPatch} />
    </div>
  )
}

/** The row count after the tabs, then the way to the deals on hold. */
export function BookCounts({
  query,
  total,
  hidden,
}: {
  query: OpportunityBookQuery
  total: number
  hidden: number
}) {
  const { t, number } = useI18n()
  const facets = useBookFacets(query)
  /* `/sales/holds` is a `lead.view` screen; a deal-only reader gets no dead link. */
  const canSeeHolds = useCan('lead.view')
  return (
    <>
      <BookCount
        total={total}
        noun={t(message('cơ hội', 'opportunities', '기회'))}
        hidden={hidden}
      />
      {/* Held deals are off the book and the board; the hold list is where they wait. */}
      {canSeeHolds && (facets?.held ?? 0) > 0 && (
        <Link
          to="/sales/holds"
          className="text-accent-foreground pointer-coarse:min-h-12 inline-flex items-center gap-1 text-[11.5px] font-semibold hover:underline"
        >
          <span className="tnum">{number(facets?.held ?? 0)}</span>{' '}
          {t(message('cơ hội đang tạm hoãn', 'opportunities on hold', '보류 중인 기회'))}
          <Icon icon={ArrowRight} size={16} />
        </Link>
      )}
    </>
  )
}

/** The whole book's score — four numbers on one denominator, read from
 *  `GET /sales/opportunities/scorecard`, which is deliberately UNSCOPED: the
 *  department's score, not the reader's. A scoped reader therefore sees a
 *  total that differs from the book's count below. */
export function ScoreCards() {
  const { t, number } = useI18n()
  const { data } = useQuery(opportunityScorecardQuery)

  /* Until the read lands, or when it failed, no figure is true: "—", no tone. */
  const loaded = data !== undefined
  const total = data?.total ?? 0
  const openCount = data?.open ?? 0
  const openAmount = data?.openAmountVnd ?? 0
  const openBlank = data?.openBlank ?? 0
  const won = data?.won ?? 0
  const lost = data?.lost ?? 0
  const terminated = data?.terminated ?? 0

  /* No denominator, no ratio: "—", never "0%". */
  const per = (n: number) => (!loaded || total === 0 ? '—' : percent(n / total))
  const warn = (bad: boolean) => (loaded && bad ? ('warning' as const) : ('default' as const))
  const noTotal =
    loaded && total === 0
      ? t(
          message(
            'Chưa có cơ hội để tính tỷ lệ',
            'No opportunities to calculate a rate',
            '비율을 계산할 기회가 없습니다',
          ),
        )
      : undefined

  const items = [
    {
      icon: Target,
      label: t(message('Tổng cơ hội', 'Total opportunities', '전체 기회')),
      value: loaded ? number(total) : '—',
      tone: warn(total === 0),
      hint: loaded
        ? t(message('Cơ hội ở mọi trạng thái', 'Opportunities in all statuses', '모든 상태의 기회'))
        : undefined,
    },
    {
      icon: Wallet,
      label: t(message('Giá trị đang theo đuổi', 'Pipeline value', '영업 진행 금액')),
      value: loaded ? billions(openAmount) : '—',
      tone: warn(openAmount === 0),
      /* The server sums in dong and skips unpriced deals — then says how many. */
      hint: !loaded
        ? undefined
        : openBlank === 0
          ? t(
              message(
                `${openCount} cơ hội đang mở`,
                `${number(openCount)} open opportunities`,
                `진행 중 기회 ${number(openCount)}건`,
              ),
            )
          : t(
              message(
                `${openCount - openBlank}/${openCount} cơ hội đang mở · ${openBlank} chưa nhập giá trị`,
                `${number(openCount - openBlank)}/${number(openCount)} open opportunities · ${number(openBlank)} without a value`,
                `진행 중 기회 ${number(openCount)}건 중 ${number(openCount - openBlank)}건 금액 입력 · ${number(openBlank)}건 미입력`,
              ),
            ),
    },
    {
      icon: FileCheck,
      label: t(message('Đã ký hợp đồng', 'Contracts signed', '계약 체결')),
      value: per(won),
      tone: warn(total > 0 && won === 0),
      /* Terminated deals have no card of their own (the row holds four); they
         ride here because each one was signed first (ADR 0107). */
      hint: !loaded
        ? undefined
        : (noTotal ??
          (terminated === 0
            ? t(
                message(
                  `${won}/${total} cơ hội đã ký hợp đồng`,
                  `${number(won)}/${number(total)} opportunities signed`,
                  `기회 ${number(total)}건 중 ${number(won)}건 계약 체결`,
                ),
              )
            : t(
                message(
                  `${won}/${total} cơ hội đã ký hợp đồng · ${terminated} đã chấm dứt`,
                  `${number(won)}/${number(total)} opportunities signed · ${number(terminated)} terminated`,
                  `기회 ${number(total)}건 중 ${number(won)}건 계약 체결 · ${number(terminated)}건 종료`,
                ),
              ))),
    },
    {
      icon: CircleX,
      label: t(message(OPPORTUNITY_STATE_LABEL.lost, 'Lost', '실패')),
      value: per(lost),
      tone: 'default' as const,
      hint: !loaded
        ? undefined
        : (noTotal ??
          t(
            message(
              `${lost}/${total} cơ hội không tiếp tục theo đuổi`,
              `${number(lost)}/${number(total)} opportunities no longer pursued`,
              `기회 ${number(total)}건 중 ${number(lost)}건 진행 중단`,
            ),
          )),
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label={t(message('Thẻ điểm sổ cơ hội', 'Opportunity book scorecard', '기회 지표'))}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {items.map((item) => (
          <StatCard
            key={item.label}
            size="compact"
            icon={item.icon}
            label={item.label}
            value={item.value}
            hint={item.hint}
            tone={item.tone}
          />
        ))}
      </div>
    </div>
  )
}

/** One reason a stopped deal was stopped for. Offered with the stopped tab
 *  only: beside any other state the server would answer an empty book. The
 *  list is the stop dialog's, so a reader who cannot stop deals sees `other`. */
export function StopReasonFilter({ query, patch }: { query: OpportunityBookQuery; patch: Patch }) {
  const { t } = useI18n()
  const stopped = query.state === 'lost'
  const canList = useCan('opportunity.edit')
  const { data } = useQuery({ ...opportunityStopReasonsQuery, enabled: stopped && canList })
  if (!stopped) return null

  const options = [
    { value: '', label: t(message('Tất cả', 'All', '전체')) },
    ...(data?.rows ?? []).map((r) => ({ value: r.id, label: r.name })),
    { value: OPPORTUNITY_STOP_REASON_OTHER, label: OPPORTUNITY_STOP_REASON_OTHER_LABEL },
  ]
  /* A chosen reason still loading, unreadable or retired must not show as a raw id. */
  if (query.stopReason && !options.some((o) => o.value === query.stopReason)) {
    options.push({
      value: query.stopReason,
      label: t(message('Lý do đã chọn', 'Selected reason', '선택한 사유')),
    })
  }

  return (
    <Select
      label={t(message('Lý do dừng', 'Reason closed', '종료 사유'))}
      value={query.stopReason ?? ''}
      neutralValue=""
      options={options}
      onChange={(value) => patch({ stopReason: value === '' ? undefined : value })}
      className="pointer-coarse:[&>button]:h-12 max-w-[240px]"
    />
  )
}
