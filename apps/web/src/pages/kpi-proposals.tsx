import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  AppShell,
  Badge,
  ChevronRight,
  DataTable,
  GlassCard,
  Icon,
  ScreenHeader,
  ScreenLayout,
  cn,
  type TableColumn,
} from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  type KpiAllocation,
  type KpiAllocationResponse,
  type KpiCounter,
} from '@pv/contracts'
import { useCan, useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { kpiAllocationsQuery, kpiCountersQuery } from '@/data/kpi-allocation'
import { ROLE_LABEL } from '@/data/users'
import { keyOf } from './home-model'
import { NOTE } from './home-tiles'
import { COUNTER_LABEL, actedAt, defOfCounter, teamSuffix } from './kpi-allocate-model'
import { CounterDetail, ReturnedDetail } from './kpi-proposals-detail'
import { MonthPicker, QueryBlock } from './kpi-parts'
import { MONTH_PARAM, pickFromUrl, printValue } from './kpi-model'

/** What a manager answers after a split is handed down (ADR 0098 §3): each
 *  holder's counter, and each package the director returned. Read live from
 *  `/sales/kpi/:period/counters` and `…/allocations`. No fixture, no scenario.
 *
 *  The queue puts what waits first — open counters oldest first, then returned
 *  packages — and keeps settled counters below as a record. The route asks for
 *  `kpi.view-all`; answering needs `kpi.set-target`, so a reader without it
 *  reads every item and the detail pane says why there are no buttons.
 *
 *  The picked row is told by weight and a chevron: the table's own selected
 *  state is a bar and bold text now, and the chevron reads better on a phone.
 *
 *  No ContextRail (law 10 debt, as on the other KPI screens). */

type Item =
  | { id: string; kind: 'counter'; counter: KpiCounter }
  | { id: string; kind: 'returned'; pkg: KpiAllocation }

function queueOf(counters: readonly KpiCounter[], packages: readonly KpiAllocation[]): Item[] {
  const asItem = (counter: KpiCounter): Item => ({ id: counter.id, kind: 'counter', counter })
  const open = counters
    .filter((c) => c.status === 'open')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const settled = counters
    .filter((c) => c.status !== 'open')
    .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''))
  const returned = packages
    .filter((p) => p.status === 'returned')
    .map((pkg): Item => ({
      id: `returned/${pkg.role}/${pkg.team?.id ?? 'room'}`,
      kind: 'returned',
      pkg,
    }))
  return [...open.map(asItem), ...returned, ...settled.map(asItem)]
}

const COLUMNS: TableColumn[] = [
  { header: 'Đề xuất', width: 'minmax(0,1.6fr)' },
  { header: 'Trạng thái', width: 'minmax(0,1fr)', align: 'right' },
]
const TWO_LINES = 'flex min-w-0 flex-col gap-1'

/** The first line of a row: bold with a chevron while its detail is the one shown. */
function Title({ picked, children }: { picked: boolean; children: ReactNode }) {
  return (
    <span
      aria-current={picked || undefined}
      className={cn('flex min-w-0 items-center gap-1', picked ? 'font-bold' : 'font-medium')}
    >
      {picked && <Icon icon={ChevronRight} size={16} className="shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  )
}

function cellsOf(item: Item, picked: boolean) {
  if (item.kind === 'returned') {
    const { decidedBy, decidedAt } = item.pkg
    return [
      <span key="what" className={TWO_LINES}>
        <Title picked={picked}>
          Gói {ROLE_LABEL[item.pkg.role]}
          {teamSuffix(item.pkg.team)}
        </Title>
        {decidedAt && (
          <span className={cn(NOTE, 'tnum font-num truncate')}>
            {actedAt(decidedBy, 'trả lại', decidedAt)}
          </span>
        )}
      </span>,
      <Badge key="state" tone="danger">
        Bị trả lại
      </Badge>,
    ]
  }
  const c = item.counter
  const def = defOfCounter(c)
  const to = def ? printValue(def.unit, c.proposed, true) : ''
  const change =
    c.status === 'open' && def ? `${printValue(def.unit, c.assigned, true)} → ${to}` : to
  const label = COUNTER_LABEL[c.status]
  return [
    <span key="what" className={TWO_LINES}>
      <Title picked={picked}>
        {c.name} · {ROLE_LABEL[c.role]}
        {teamSuffix(c.team)}
      </Title>
      <span className={cn(NOTE, 'tnum font-num truncate')}>
        {KPI_METRIC_LABEL[c.metricKey]}: {change}
      </span>
    </span>,
    <Badge key="state" tone={label.tone}>
      {label.text}
    </Badge>,
  ]
}

function ProposalDesk({
  period,
  counters,
  allocations,
  canSet,
  me,
}: {
  period: string
  counters: readonly KpiCounter[]
  allocations: KpiAllocationResponse
  canSet: boolean
  me: string | undefined
}) {
  const items = queueOf(counters, allocations.allocations)
  const [picked, setPicked] = useState<string | null>(null)
  const shown = items.find((i) => i.id === picked) ?? items[0]
  const detail = useRef<HTMLDivElement>(null)

  /* Below `lg` the detail sits under the list, so a tap would change nothing in view. */
  useEffect(() => {
    if (picked === null || window.matchMedia('(min-width: 64rem)').matches) return
    detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [picked])

  if (!shown) {
    return (
      <GlassCard variant="b" className="p-5">
        <p className={NOTE}>Tháng này chưa có đề xuất nào.</p>
      </GlassCard>
    )
  }

  /* A counter sits on one package: its role AND its team (none = the room's). */
  const pkgOf = (c: KpiCounter) =>
    allocations.allocations.find(
      (a) => a.role === c.role && (a.team?.id ?? null) === (c.team?.id ?? null),
    )
  const lastMonthOf = (c: KpiCounter) =>
    pkgOf(c)?.lines.find((l) => l.actorId === c.actorId && l.metricKey === c.metricKey)
      ?.lastMonth ?? null

  return (
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(280px,2fr)_minmax(0,3fr)]">
      <GlassCard variant="b" className="py-2">
        <DataTable
          flush
          rowHeight="min-h-14 py-2"
          columns={COLUMNS}
          rows={items.map((item) => ({
            id: item.id,
            onOpen: () => setPicked(item.id),
            cells: cellsOf(item, item.id === shown.id),
          }))}
        />
      </GlassCard>
      <div ref={detail} className="min-w-0 scroll-mt-4">
        {shown.kind === 'counter' ? (
          <CounterDetail
            key={shown.id}
            period={period}
            counter={shown.counter}
            lastMonth={lastMonthOf(shown.counter)}
            pkgStatus={pkgOf(shown.counter)?.status}
            closed={allocations.closed}
            canSet={canSet}
            me={me}
          />
        ) : (
          <ReturnedDetail period={period} pkg={shown.pkg} canFix={canSet && !allocations.closed} />
        )}
      </div>
    </div>
  )
}

export function KpiProposalsPage() {
  const chrome = useAppChrome()
  const canSet = useCan('kpi.set-target')
  const me = useSession((s) => s.actor?.id)
  const [params] = useSearchParams()
  const [pick, setPick] = useState(() => pickFromUrl(params.get(MONTH_PARAM)))
  const period = keyOf(pick)

  const counters = useQuery(kpiCountersQuery(period))
  const allocations = useQuery(kpiAllocationsQuery(period))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="Xử lý đề xuất"
          description="Người nhận xin đổi chỉ tiêu và gói chỉ tiêu bị trả lại."
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />
        <QueryBlock query={counters} what="danh sách đề xuất" variant="b">
          {(c) => (
            <QueryBlock query={allocations} what="gói phân bổ" variant="b">
              {(a) => (
                <ProposalDesk
                  key={period}
                  period={period}
                  counters={c.counters}
                  allocations={a}
                  canSet={canSet}
                  me={me}
                />
              )}
            </QueryBlock>
          )}
        </QueryBlock>
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiProposalsPage
