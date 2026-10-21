import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Button,
  CircleX,
  SearchField,
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
import { searchHint } from '@/lib/search-box'
import { useCan } from '@/app/auth'
import { opportunityStopReasonsQuery } from '@/data/opportunities-write'
import { usePins } from '@/data/pins'
import { BookCount } from '@/components/book-page'
import { ANY, stateTabs } from './opportunities-model'

/** Module 3 · the deal book's blocks: the toolbar's two ends (tabs, search with
 *  "clear all" — the filters sit in the column headers) and the score cards
 *  (ADR 0077). Mounted by `opportunities.tsx`. */

type Patch = (next: Partial<OpportunityBookQuery>) => void

/** The pinned tab's value — `pinned=true` on the URL, across every state. */
const PINNED = 'pinned'

/** A stop reason and the stopped-at column narrow only stopped deals, so every
 *  tab press drops them; a close-day range would empty the open tab. */
function tabPatch(value: string): Partial<OpportunityBookQuery> {
  const dropped = {
    stopReason: undefined,
    stoppedStage: undefined,
    ...(value === 'open' ? { closedFrom: undefined, closedTo: undefined } : {}),
  }
  return value === PINNED
    ? { ...dropped, pinned: true, state: undefined }
    : {
        ...dropped,
        state: value === ANY ? undefined : (value as OpportunityStatus),
        pinned: undefined,
      }
}

/** The toolbar's left end: state tabs and the row count. Tab counts honour
 *  every other filter in force; the pinned tab counts the person's own pins. */
export function BookTabs({
  query,
  total,
  hidden,
  onPatch,
}: {
  query: OpportunityBookQuery
  total: number
  hidden: number
  onPatch: Patch
}) {
  /* The tabs count the book, not the pins nor a stop narrowing — as the lead book's do. */
  const { data: facets } = useQuery(
    opportunityFacetQuery(
      facetsQueryOf({
        ...query,
        pinned: undefined,
        stopReason: undefined,
        stoppedStage: undefined,
      }),
    ),
  )
  const pinCount = usePins('opportunity').codes.length
  /* `/sales/holds` is a `lead.view` screen; a deal-only reader gets no dead link. */
  const canSeeHolds = useCan('lead.view')
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <SegmentedControl
        label="Trạng thái cơ hội"
        hideLabel
        tone="quiet"
        value={query.pinned ? PINNED : (query.state ?? ANY)}
        options={[
          ...stateTabs(facets?.byState),
          { value: PINNED, label: 'Đã ghim', count: pinCount },
        ]}
        onChange={(value) => onPatch(tabPatch(value))}
      />
      <StopReasonFilter query={query} patch={onPatch} />
      <BookCount total={total} noun="cơ hội" hidden={hidden} />
      {/* Held deals are off the book and the board; the hold list is where they wait. */}
      {canSeeHolds && (facets?.held ?? 0) > 0 && (
        <Link
          to="/sales/holds"
          className="text-accent-foreground pointer-coarse:min-h-12 inline-flex items-center gap-1 text-[11.5px] font-semibold hover:underline"
        >
          <span className="tnum">{facets?.held}</span> cơ hội đang tạm hoãn
          <Icon icon={ArrowRight} size={16} />
        </Link>
      )}
    </div>
  )
}

/** The toolbar's right end: search, and "clear all" once anything filters. */
export function BookTools({
  text,
  onText,
  dirty,
  onClear,
}: {
  text: string
  onText: (text: string) => void
  dirty: boolean
  onClear: () => void
}) {
  return (
    <>
      <SearchField
        placeholder="Tìm theo tên, mã cơ hội hoặc khách hàng…"
        value={text}
        meta={searchHint(text)}
        onChange={onText}
        className="min-w-0 flex-1 sm:max-w-[320px]"
      />
      {dirty && (
        <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={onClear}>
          Bỏ hết bộ lọc
        </Button>
      )}
    </>
  )
}

/** The whole book's score — four numbers on one denominator, read from
 *  `GET /sales/opportunities/scorecard`, which is deliberately UNSCOPED: the
 *  department's score, not the reader's. A scoped reader therefore sees a
 *  total that differs from the book's count below. */
export function ScoreCards() {
  const { data } = useQuery(opportunityScorecardQuery)

  const total = data?.total ?? 0
  const openCount = data?.open ?? 0
  const openAmount = data?.openAmountVnd ?? 0
  const openBlank = data?.openBlank ?? 0
  const won = data?.won ?? 0
  const lost = data?.lost ?? 0

  /* No denominator, no ratio: "—", never "0%". */
  const per = (n: number) => (total === 0 ? '—' : percent(n / total))

  const items = [
    {
      icon: Target,
      label: 'Tổng cơ hội',
      value: String(total),
      tone: total === 0 ? ('warning' as const) : ('default' as const),
      hint: 'Gồm đang theo đuổi, đã ký và đã dừng',
    },
    {
      icon: Wallet,
      label: 'Giá trị đang theo đuổi',
      value: billions(openAmount),
      tone: openAmount === 0 ? ('warning' as const) : ('default' as const),
      /* The server sums in dong and skips unpriced deals — then says how many. */
      hint:
        openBlank === 0
          ? `${openCount} cơ hội đang mở`
          : `${openCount - openBlank}/${openCount} cơ hội đang mở · ${openBlank} chưa nhập giá trị`,
    },
    {
      icon: FileCheck,
      label: 'Đã ký hợp đồng',
      value: per(won),
      tone: total > 0 && won === 0 ? ('warning' as const) : ('default' as const),
      hint: total === 0 ? 'Chưa có cơ hội để tính tỷ lệ' : `${won}/${total} cơ hội đã ký hợp đồng`,
    },
    {
      icon: CircleX,
      label: OPPORTUNITY_STATE_LABEL.lost,
      value: per(lost),
      hint:
        total === 0
          ? 'Chưa có cơ hội để tính tỷ lệ'
          : `${lost}/${total} cơ hội không tiếp tục theo đuổi`,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="Thẻ điểm sổ cơ hội"
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
  const stopped = query.state === 'lost'
  const canList = useCan('opportunity.edit')
  const { data } = useQuery({ ...opportunityStopReasonsQuery, enabled: stopped && canList })
  if (!stopped) return null

  const options = [
    { value: '', label: 'Tất cả' },
    ...(data?.rows ?? []).map((r) => ({ value: r.id, label: r.name })),
    { value: OPPORTUNITY_STOP_REASON_OTHER, label: OPPORTUNITY_STOP_REASON_OTHER_LABEL },
  ]
  /* A chosen reason still loading, unreadable or retired must not show as a raw id. */
  if (query.stopReason && !options.some((o) => o.value === query.stopReason)) {
    options.push({ value: query.stopReason, label: 'Lý do đã chọn' })
  }

  return (
    <Select
      label="Lý do dừng"
      value={query.stopReason ?? ''}
      neutralValue=""
      options={options}
      onChange={(value) => patch({ stopReason: value === '' ? undefined : value })}
      className="pointer-coarse:[&>button]:h-12 max-w-[240px]"
    />
  )
}
