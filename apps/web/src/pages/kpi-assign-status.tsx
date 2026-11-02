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
import { message, translate, useI18n, type Message } from '@/app/i18n'
import { kpiRoleText } from '@/data/kpi-i18n'
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

const LEVEL_LABEL: Record<KpiAssignmentLevel, Message> = {
  company: message('Công ty', 'Company', '회사'),
  department: message('Phòng', 'Department', '부서'),
  team: message('Nhóm', 'Team', '팀'),
  person: message('Nhân viên xác nhận', 'Staff confirming', '확인하는 직원'),
}

const confirmedText = (confirmed: number, total: number) =>
  translate(
    message(
      `${num(confirmed)}/${num(total)} đã xác nhận`,
      `${num(confirmed)}/${num(total)} confirmed`,
      `${num(confirmed)}/${num(total)} 확인됨`,
    ),
  )

/* Depth as indent, on the spacing scale; deeper levels stay at the last step. */
const INDENT = ['pl-4', 'pl-8', 'pl-12'] as const

/** A unit step's counts, non-zero only; a level of one unit drops the count. */
function stepBadges({ units, people }: KpiAssignmentStep): Label[] {
  if (people) {
    if (people.total === 0) return []
    const all = people.confirmed === people.total
    return [
      { text: confirmedText(people.confirmed, people.total), tone: all ? 'success' : 'draft' },
    ]
  }
  if (!units) return []
  const total = units.sent + units.sentByDefault + units.notSent
  const parts: [number, Message, Label['tone']][] = [
    [units.sent, message('đã gửi', 'sent', '발송됨'), 'success'],
    [
      units.sentByDefault,
      message('giao mặc định', 'assigned by default', '기본값으로 배정'),
      'warning',
    ],
    [units.notSent, message('chưa gửi', 'not sent', '미발송'), 'draft'],
  ]
  return parts.flatMap(([n, word, tone]) => {
    if (n === 0) return []
    const label = translate(word)
    const text = total === 1 ? label : `${num(n)} ${label}`
    return [{ tone, text: text.charAt(0).toUpperCase() + text.slice(1) }]
  })
}

function Steps({ steps }: { steps: readonly KpiAssignmentStep[] }) {
  const { t } = useI18n()
  const shown = steps.flatMap((s) => {
    const badges = stepBadges(s)
    return badges.length > 0 ? [{ step: s, badges }] : []
  })
  return (
    <ol
      aria-label={t(message('Các mốc giao', 'Assignment milestones', '배정 일정'))}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {shown.map(({ step, badges }) => (
        <li key={step.level}>
          <GlassCard className={cn(TILE, 'h-full')}>
            <span className={cn(NOTE, 'tnum font-num')}>
              {t(LEVEL_LABEL[step.level])} ·{' '}
              {t(message(`hạn ${dm(step.due)}`, `due ${dm(step.due)}`, `기한 ${dm(step.due)}`))}
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
  const { t } = useI18n()
  const label = UNIT_STATE_LABEL[unit.state]
  const away = unit.head?.away ? t(message(' · vắng', ' · away', ' · 부재')) : ''
  const head = unit.head
    ? `${unit.head.name}${away}`
    : t(message('Chưa có trưởng đơn vị', 'No unit head', '단위 책임자 없음'))
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
          {unit.total > 0 && confirmedText(unit.confirmed, unit.total)}
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
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const catalog = useQuery(kpiCatalogQuery)
  const roles = catalog.data ? RoleId.options.filter((r) => catalog.data[r].length > 0) : []
  const trees = useQueries({ queries: roles.map((role) => kpiAssignmentTreeQuery(period, role)) })
  const all = joined(catalog, trees)

  if (isApiError(all.error) && all.error.kind === 'forbidden') {
    return (
      <p className={NOTE}>
        {t(
          message(
            'Bạn không xem được tình trạng giao chỉ tiêu.',
            'You do not have access to the target assignment status.',
            '목표 배정 현황을 볼 권한이 없습니다.',
          ),
        )}
      </p>
    )
  }
  return (
    <QueryBlock
      query={all}
      what={message('tình trạng giao chỉ tiêu', 'target assignment status', '목표 배정 현황')}
      variant="b"
    >
      {(loaded) => {
        const shown = loaded.filter((t) => t.units.length > 0)
        const tree = shown.find((t) => t.role === params.get(ROLE_PARAM)) ?? shown[0]
        if (!tree) {
          return (
            <p className={NOTE}>
              {t(
                message(
                  'Tháng này chưa có đơn vị nào cần giao chỉ tiêu.',
                  'No unit needs to assign targets this month.',
                  '이번 달에는 목표를 배정할 단위가 없습니다.',
                ),
              )}
            </p>
          )
        }
        return (
          <>
            <SegmentedControl
              label={t(message('Vai trò', 'Role', '역할'))}
              hideLabel
              tone="quiet"
              value={tree.role}
              options={shown.map((t) => ({ value: t.role, label: kpiRoleText(t.role) }))}
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
              <ul
                aria-label={t(message('Theo đơn vị', 'By unit', '단위별'))}
                className="flex flex-col gap-1"
              >
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
  const { t } = useI18n()
  const chrome = useAppChrome()
  const [pick, setPick] = useMonthParam()
  const period = keyOf(pick)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title={t(message('Tình trạng giao', 'Assignment status', '배정 현황'))}
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />
        {isTieredPeriod(period) ? (
          <Board key={period} period={period} />
        ) : (
          <p className={NOTE}>{t(TIERED_SENTENCE)}</p>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiAssignStatusPage
