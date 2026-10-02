import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCan } from '@/app/auth'
import {
  Button,
  CircleX,
  Icon,
  SearchField,
  SegmentedControl,
  X,
  FileCheck,
  Inbox,
  Kicker,
  Select,
  StatCard,
  Target,
  Timer,
  UserMinus,
  Wallet,
  billions,
  percent,
  type IconGlyph,
} from '@pv/ui'
import {
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STATE_LABEL,
  OWNER_NONE,
  type OpportunityBookQuery,
  type OpportunityStatus,
} from '@pv/contracts'
import {
  facetsQueryOf,
  opportunityFacetQuery,
  opportunityScorecardQuery,
} from '@/data/opportunities'
import { ACCEPT_QUEUE_ID } from '@/components/opportunity-accept'
import { BookQueueButton } from '@/components/book-queue-button'
import { BookCount } from '@/components/book-page'
import { FilterMenu } from '@/components/table-bits'
import {
  ANY,
  activeQuick,
  peopleOptions,
  quickPatch,
  stateTabs,
  withoutQuick,
  type QuickKey,
} from './opportunities-model'

/** Module 3 · the deal book's blocks: the toolbar's two ends (tabs, search with
 *  the filter menu, the quick-filter row) and the score cards
 *  (ADR 0077). Mounted by `opportunities.tsx`. */

type Patch = (next: Partial<OpportunityBookQuery>) => void

/** The toolbar's left end: state tabs and the row count. Tab counts honour
 *  every other filter in force. */
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
  const { data: facets } = useQuery(opportunityFacetQuery(facetsQueryOf(query)))
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <SegmentedControl
        label="Trạng thái đơn"
        hideLabel
        tone="quiet"
        value={query.state ?? ANY}
        options={stateTabs(facets?.byState)}
        onChange={(value) =>
          onPatch({ state: value === ANY ? undefined : (value as OpportunityStatus) })
        }
      />
      <BookCount total={total} noun="cơ hội" hidden={hidden} />
    </div>
  )
}

/** The toolbar's right end. A column other than `new` arrives from elsewhere
 *  (the histogram) and shows as a pill that clears itself; `new` is a chip. */
export function BookTools({
  query,
  text,
  onText,
  onPatch,
  dirty,
  onClear,
}: {
  query: OpportunityBookQuery
  text: string
  onText: (text: string) => void
  onPatch: Patch
  dirty: boolean
  onClear: () => void
}) {
  return (
    <>
      <SearchField
        placeholder="Tìm theo tên cơ hội, mã hoặc account…"
        value={text}
        onChange={onText}
        className="min-w-0 flex-1 sm:max-w-[320px]"
      />
      {query.stage !== undefined && query.stage !== 'new' && (
        <Button
          variant="ghost"
          size="md"
          className="pointer-coarse:h-12"
          aria-label={`Bỏ lọc cột ${OPPORTUNITY_STAGE_LABEL[query.stage]}`}
          onClick={() => onPatch({ stage: undefined })}
        >
          Cột: {OPPORTUNITY_STAGE_LABEL[query.stage]}
          <Icon icon={X} size={16} />
        </Button>
      )}
      <BookFilters query={query} onPatch={onPatch} dirty={dirty} onClear={onClear} />
    </>
  )
}

const QUICK: { key: QuickKey; label: string; icon: IconGlyph; id?: string }[] = [
  /* The row accept's focus fallback when no row follows it. */
  { key: 'awaitingAccept', label: 'Chờ nhận PIC', icon: Inbox, id: ACCEPT_QUEUE_ID },
  { key: 'noSeller', label: 'Chưa có Sale', icon: UserMinus },
  { key: 'overdue', label: 'Quá hạn', icon: Timer },
]

/** The quick-filter row — three toggles, counted by `facets.quick` under every other
 *  filter in force. A head's two queues show only to whoever can act on them. */
export function QuickFilters({ query, onPatch }: { query: OpportunityBookQuery; onPatch: Patch }) {
  const canAccept = useCan('opportunity.accept')
  const canAssign = useCan('opportunity.assign')
  const { data } = useQuery(opportunityFacetQuery(facetsQueryOf(withoutQuick(query))))
  const active = activeQuick(query)
  const shown = QUICK.filter(
    (q) => (q.key !== 'awaitingAccept' || canAccept) && (q.key !== 'noSeller' || canAssign),
  )

  return (
    <div role="group" aria-label="Lọc nhanh" className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-[11.5px]">Lọc nhanh:</span>
      {shown.map((q) => (
        <BookQueueButton
          key={q.key}
          id={q.id}
          icon={q.icon}
          label={q.label}
          count={data?.quick[q.key]}
          active={active === q.key}
          onPress={() => onPatch(quickPatch(query, q.key))}
        />
      ))}
    </div>
  )
}

/** The secondary filters behind the filter button. Choices span the whole
 *  visible book (no filter), so a select never collapses to its own pick.
 *  Overdue lives only in the quick row, as does the no-seller pick it sets. */
function BookFilters({
  query,
  onPatch,
  dirty,
  onClear,
}: {
  query: OpportunityBookQuery
  onPatch: Patch
  dirty: boolean
  onClear: () => void
}) {
  const { data: choices } = useQuery(opportunityFacetQuery({}))
  const saleOptions = useMemo(() => peopleOptions(choices?.saleOwners ?? []), [choices])
  const bdOptions = useMemo(() => peopleOptions(choices?.bdOwners ?? []), [choices])
  const accounts = useMemo(
    () => [...(choices?.accounts ?? [])].sort((a, b) => a.localeCompare(b, 'vi')),
    [choices],
  )
  const chipSale = activeQuick(query) === 'noSeller'
  const active = [chipSale ? undefined : query.sale, query.bd, query.account].filter(
    (value) => value !== undefined,
  ).length
  const pick = (value: string) => (value === ANY ? undefined : value)

  return (
    <FilterMenu label="Bộ lọc sổ cơ hội" active={active}>
      <Select
        label="Sale đứng đơn"
        value={query.sale ?? ANY}
        onChange={(value) => onPatch({ sale: pick(value) })}
        /* Account names run long; clamp the native select to the panel. */
        className="w-full max-w-none"
        options={[
          { value: ANY, label: 'Mọi Sale' },
          { value: OWNER_NONE, label: 'Chưa có Sale' },
          ...saleOptions,
        ]}
      />
      <Select
        label="BD mở cửa"
        value={query.bd ?? ANY}
        onChange={(value) => onPatch({ bd: pick(value) })}
        className="w-full max-w-none"
        options={[
          { value: ANY, label: 'Mọi BD' },
          { value: OWNER_NONE, label: 'Chưa ghi BD' },
          ...bdOptions,
        ]}
      />
      <Select
        label="Account"
        value={query.account ?? ANY}
        onChange={(value) => onPatch({ account: pick(value) })}
        className="w-full max-w-none"
        options={[
          { value: ANY, label: 'Mọi account' },
          ...accounts.map((a) => ({ value: a, label: a })),
        ]}
      />
      {dirty && (
        <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={onClear}>
          Bỏ hết bộ lọc
        </Button>
      )}
    </FilterMenu>
  )
}

/** The whole book's score — four numbers on one denominator, read from
 *  `GET /sales/opportunities/scorecard`, which is deliberately UNSCOPED: the
 *  department's score, not the reader's. A scoped reader therefore sees a
 *  total that differs from the book's count below, and the kicker says so —
 *  do not shorten it. */
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
      label: 'Tổng số cơ hội',
      value: String(total),
      tone: total === 0 ? ('warning' as const) : ('default' as const),
      hint: 'đơn đang có trong sổ',
    },
    {
      icon: Wallet,
      label: 'Đang mở',
      value: billions(openAmount),
      tone: openAmount === 0 ? ('warning' as const) : ('default' as const),
      /* The server sums in dong and skips unpriced deals — then says how many. */
      hint:
        openBlank === 0
          ? `${openCount} đơn còn trong bốn cột`
          : `${openCount} đơn còn trong bốn cột · ${openBlank} đơn chưa có tiền, không cộng vào`,
    },
    {
      icon: FileCheck,
      label: 'Thành hợp đồng',
      value: per(won),
      tone: total > 0 && won === 0 ? ('warning' as const) : ('default' as const),
      hint: `${won} đơn đã ký trên ${total} cơ hội`,
    },
    {
      icon: CircleX,
      label: OPPORTUNITY_STATE_LABEL.lost,
      value: per(lost),
      hint: `${lost} đơn đã dừng trên ${total} cơ hội`,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <Kicker>Thẻ điểm cả sổ · không theo phạm vi của bạn</Kicker>
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
      <p className="text-muted-foreground text-[11px] leading-[1.5]">
        Mỗi cơ hội mọc ra từ một lead đã lên bậc SQL — cùng một sự kiện, không phải hai sổ. Phần còn
        lại của phễu nằm ở Sổ lead.
      </p>
    </div>
  )
}
