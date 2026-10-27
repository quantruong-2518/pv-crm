import { useQueries, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AppShell,
  Badge,
  ChevronRight,
  GlassCard,
  Icon,
  ScreenHeader,
  ScreenLayout,
  SegmentedControl,
  cn,
} from '@pv/ui'
import {
  RoleId,
  isTieredPeriod,
  type KpiAssignmentLevel,
  type KpiAssignmentStep,
  type KpiAssignmentTreeResponse,
  type KpiAssignmentTreeUnit,
} from '@pv/contracts'
import { isApiError } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { kpiAssignmentTreeQuery } from '@/data/kpi-assignment'
import { kpiCatalogQuery, type BlockQuery, type KpiCatalog } from '@/data/kpi-catalog'
import { ROLE_LABEL } from '@/data/users'
import { dm } from '@/lib/date'
import { keyOf, num } from './home-model'
import { NOTE, TILE } from './home-tiles'
import {
  ROLE_PARAM,
  TIERED_SENTENCE,
  UNIT_STATE_LABEL,
  assignHref,
  type Label,
} from './kpi-assign-model'
import { useMonthParam } from './kpi-model'
import { MonthPicker, QueryBlock } from './kpi-parts'

/** The assignment status — `/sales/kpi/assign/status?month=&role=` (ADR 0120):
 *  for one role, how far each level got against its day (company, department,
 *  team, then people confirming), and every unit that hands the role down in
 *  tree order, each opening its own assignment page. Read live from
 *  `GET /sales/kpi/:period/assignments/:role/tree`, one read per role, so only
 *  roles with a unit to hand down get a tab. The server lets in `kpi.view-all`
 *  or the company seat.
 *
 *  No ContextRail (law 10 debt, as on the other KPI screens). */

const LEVEL_LABEL: Record<KpiAssignmentLevel, string> = {
  company: 'Công ty',
  department: 'Phòng',
  team: 'Nhóm',
  person: 'Nhân viên xác nhận',
}

/* Depth as indent, on the spacing scale; deeper levels stay at the last step. */
const INDENT = ['pl-4', 'pl-8', 'pl-12'] as const

/** A unit step's counts, non-zero only; a level of one unit drops the count. */
function stepBadges({ units, people }: KpiAssignmentStep): Label[] {
  if (people) {
    if (people.total === 0) return []
    const all = people.confirmed === people.total
    return [
      {
        text: `${num(people.confirmed)}/${num(people.total)} đã xác nhận`,
        tone: all ? 'success' : 'draft',
      },
    ]
  }
  if (!units) return []
  const total = units.sent + units.sentByDefault + units.notSent
  const parts: [number, Label][] = [
    [units.sent, { text: 'đã gửi', tone: 'success' }],
    [units.sentByDefault, { text: 'giao mặc định', tone: 'warning' }],
    [units.notSent, { text: 'chưa gửi', tone: 'draft' }],
  ]
  return parts.flatMap(([n, label]) => {
    if (n === 0) return []
    const text = total === 1 ? label.text : `${num(n)} ${label.text}`
    return [{ ...label, text: text.charAt(0).toUpperCase() + text.slice(1) }]
  })
}

function Steps({ steps }: { steps: readonly KpiAssignmentStep[] }) {
  const shown = steps.flatMap((s) => {
    const badges = stepBadges(s)
    return badges.length > 0 ? [{ step: s, badges }] : []
  })
  return (
    <ol aria-label="Các mốc giao" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {shown.map(({ step, badges }) => (
        <li key={step.level}>
          <GlassCard className={cn(TILE, 'h-full')}>
            <span className={cn(NOTE, 'tnum font-num')}>
              {LEVEL_LABEL[step.level]} · hạn {dm(step.due)}
            </span>
            <span className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <Badge key={b.text} tone={b.tone}>
                  {b.text}
                </Badge>
              ))}
            </span>
          </GlassCard>
        </li>
      ))}
    </ol>
  )
}

function UnitRow({ unit, tree }: { unit: KpiAssignmentTreeUnit; tree: KpiAssignmentTreeResponse }) {
  const label = UNIT_STATE_LABEL[unit.state]
  const head = unit.head
    ? `${unit.head.name}${unit.head.away ? ' · vắng' : ''}`
    : 'Chưa có trưởng đơn vị'
  return (
    <li>
      <Link
        to={assignHref(tree.period, tree.role, unit.unitId)}
        className={cn(
          'text-foreground motion-std hover:bg-surface-ink/8 focus-visible:bg-surface-ink/8 grid min-h-14 grid-cols-[minmax(0,6fr)_minmax(0,4fr)_minmax(0,3fr)_16px] items-center gap-4 rounded-lg py-2 pr-4 outline-none focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
          INDENT[Math.min(unit.depth, INDENT.length - 1)],
        )}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span
            className={cn('truncate text-[13px]', unit.depth === 0 ? 'font-bold' : 'font-semibold')}
          >
            {unit.name}
          </span>
          <span className={NOTE}>{head}</span>
        </span>
        <Badge tone={label.tone} className="justify-self-start">
          {unit.sentAt ? `${label.text} ${dm(unit.sentAt)}` : label.text}
        </Badge>
        <span className={cn(NOTE, 'tnum font-num')}>
          {unit.total > 0 && `${num(unit.confirmed)}/${num(unit.total)} đã xác nhận`}
        </span>
        <Icon icon={ChevronRight} size={16} className="text-muted-foreground" />
      </Link>
    </li>
  )
}

/** Every role's tree in one block: data once all have answered and one succeeded. */
function joined(
  catalog: BlockQuery<KpiCatalog>,
  trees: readonly (BlockQuery<KpiAssignmentTreeResponse> & { isPending: boolean })[],
): BlockQuery<KpiAssignmentTreeResponse[]> {
  const data = trees.flatMap((t) => (t.data ? [t.data] : []))
  const failed = trees.length > 0 && trees.every((t) => t.error)
  return {
    data:
      catalog.data && !trees.some((t) => t.isPending) && (trees.length === 0 || data.length > 0)
        ? data
        : undefined,
    error: catalog.error ?? (failed ? (trees[0]?.error ?? null) : null),
    isRefetchError: trees.some((t) => t.isRefetchError),
    refetch: () => {
      if (catalog.error) void catalog.refetch()
      trees.filter((t) => t.error).forEach((t) => void t.refetch())
    },
  }
}

function Board({ period }: { period: string }) {
  const [params, setParams] = useSearchParams()
  const catalog = useQuery(kpiCatalogQuery)
  const roles = catalog.data ? RoleId.options.filter((r) => catalog.data[r].length > 0) : []
  const trees = useQueries({ queries: roles.map((role) => kpiAssignmentTreeQuery(period, role)) })
  const all = joined(catalog, trees)

  if (isApiError(all.error) && all.error.kind === 'forbidden') {
    return <p className={NOTE}>Bạn không xem được tình trạng giao chỉ tiêu.</p>
  }
  return (
    <QueryBlock query={all} what="tình trạng giao chỉ tiêu" variant="b">
      {(loaded) => {
        const shown = loaded.filter((t) => t.units.length > 0)
        const tree = shown.find((t) => t.role === params.get(ROLE_PARAM)) ?? shown[0]
        if (!tree) return <p className={NOTE}>Tháng này chưa có đơn vị nào cần giao chỉ tiêu.</p>
        return (
          <>
            <SegmentedControl
              label="Vai trò"
              hideLabel
              tone="quiet"
              value={tree.role}
              options={shown.map((t) => ({ value: t.role, label: ROLE_LABEL[t.role] }))}
              onChange={(role) =>
                setParams(
                  (prev) => {
                    const next = new URLSearchParams(prev)
                    next.set(ROLE_PARAM, role)
                    return next
                  },
                  { replace: true },
                )
              }
              className="self-start"
            />
            <Steps steps={tree.steps} />
            <GlassCard variant="b" className="p-3">
              <ul aria-label="Theo đơn vị" className="flex flex-col gap-1">
                {tree.units.map((unit) => (
                  <UnitRow key={unit.unitId} unit={unit} tree={tree} />
                ))}
              </ul>
            </GlassCard>
          </>
        )
      }}
    </QueryBlock>
  )
}

export function KpiAssignStatusPage() {
  const chrome = useAppChrome()
  const [pick, setPick] = useMonthParam()
  const period = keyOf(pick)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="Tình trạng giao"
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />
        {isTieredPeriod(period) ? (
          <Board key={period} period={period} />
        ) : (
          <p className={NOTE}>{TIERED_SENTENCE}</p>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiAssignStatusPage
