import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  CircleX,
  Icon,
  SearchField,
  SegmentedControl,
  X,
  FileCheck,
  Select,
  StatCard,
  Target,
  Wallet,
  billions,
  percent,
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
import { BookCount } from '@/components/book-page'
import { FilterMenu } from '@/components/table-bits'
import { ANY, peopleOptions, stateTabs } from './opportunities-model'

/** Module 3 · the deal book's blocks: the toolbar's two ends (tabs, search with
 *  the filter menu) and the score cards
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
        label="Trạng thái cơ hội"
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
        placeholder="Tìm theo tên, mã cơ hội hoặc khách hàng…"
        value={text}
        onChange={onText}
        className="min-w-0 flex-1 sm:max-w-[320px]"
      />
      {query.stage !== undefined && query.stage !== 'new' && (
        <Button
          variant="ghost"
          size="md"
          className="pointer-coarse:h-12"
          aria-label={`Bỏ lọc giai đoạn ${OPPORTUNITY_STAGE_LABEL[query.stage]}`}
          onClick={() => onPatch({ stage: undefined })}
        >
          Giai đoạn: {OPPORTUNITY_STAGE_LABEL[query.stage]}
          <Icon icon={X} size={16} />
        </Button>
      )}
      <BookFilters query={query} onPatch={onPatch} dirty={dirty} onClear={onClear} />
    </>
  )
}

/** The secondary filters behind the filter button. Choices span the whole
 *  visible book (no filter), so a select never collapses to its own pick. */
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
  const active = [query.sale, query.bd, query.account, query.overdue].filter(
    (value) => value !== undefined,
  ).length
  const pick = (value: string) => (value === ANY ? undefined : value)

  return (
    <FilterMenu label="Bộ lọc cơ hội" active={active}>
      <Select
        label="Sale phụ trách"
        value={query.sale ?? ANY}
        onChange={(value) => onPatch({ sale: pick(value) })}
        /* Account names run long; clamp the native select to the panel. */
        className="w-full max-w-none"
        options={[
          { value: ANY, label: 'Tất cả Sale' },
          { value: OWNER_NONE, label: 'Chưa có Sale' },
          ...saleOptions,
        ]}
      />
      <Select
        label="BD phụ trách"
        value={query.bd ?? ANY}
        onChange={(value) => onPatch({ bd: pick(value) })}
        className="w-full max-w-none"
        options={[
          { value: ANY, label: 'Tất cả BD' },
          { value: OWNER_NONE, label: 'Chưa ghi BD' },
          ...bdOptions,
        ]}
      />
      <Select
        label="Khách hàng"
        value={query.account ?? ANY}
        onChange={(value) => onPatch({ account: pick(value) })}
        className="w-full max-w-none"
        options={[
          { value: ANY, label: 'Tất cả khách hàng' },
          ...accounts.map((a) => ({ value: a, label: a })),
        ]}
      />
      <Checkbox
        checked={query.overdue === true}
        onChange={(on) => onPatch({ overdue: on || undefined })}
        label="Quá hạn ở giai đoạn hiện tại"
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
          ? `Tổng giá trị dự kiến của ${openCount} cơ hội đang mở`
          : `Tổng giá trị dự kiến của ${openCount - openBlank}/${openCount} cơ hội đang mở · ${openBlank} chưa nhập giá trị`,
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
