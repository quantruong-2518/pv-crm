import { Link } from 'react-router-dom'
import { Badge, GlassCard, SectionTitle, cn } from '@pv/ui'
import { KPI_COVERAGE_LOW, RoleId, type KpiDeskMember, type KpiDeskPrimary } from '@pv/contracts'
import { message, useI18n, type Message } from '@/app/i18n'
import { StackTable, type StackColumn } from '@/components/stack-table'
import { defOf, type KpiCatalog } from '@/data/kpi-catalog'
import { kpiMetricText, kpiRoleText } from '@/data/kpi-i18n'
import { num } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { NAME_LINK } from './kpi-company-forecast'
import { GradeBadge } from './kpi-me-score'
import { DASH, monthWord, personHref, printShort } from './kpi-model'
import { VerdictBadge } from './kpi-parts'

/** The unit tab's figures: the unit totals and the one per-person table of the
 *  app (ADR 0159 §6). Every verdict is the server's; this file only prints. */

const FIGURE = 'tnum font-num'

const defFor = (catalog: KpiCatalog, role: RoleId | null, key: KpiDeskPrimary['key']) =>
  (role && defOf(catalog, role, key)) ||
  RoleId.options.map((r) => defOf(catalog, r, key)).find((d) => d !== undefined)

/** "320 / 900 tr"; the target alone is dashed when none is set. */
function primaryText(catalog: KpiCatalog, role: RoleId | null, primary: KpiDeskPrimary): string {
  const def = defFor(catalog, role, primary.key)
  if (!def) return DASH
  return `${printShort(def.unit, primary.value)} / ${printShort(def.unit, primary.target)}`
}

/** The pill alone stands in for a hidden ratio, so a reader without pipeline sight still sees the flag. */
export function CoverageLowBadge() {
  const { t } = useI18n()
  return (
    <Badge tone="warning">
      {t(
        message(
          `Dưới ${KPI_COVERAGE_LOW} lần`,
          `Under ${KPI_COVERAGE_LOW}x`,
          `${KPI_COVERAGE_LOW}배 미만`,
        ),
      )}
    </Badge>
  )
}

export function CoverageCell({ ratio, low }: { ratio: number | null; low: boolean | null }) {
  if (ratio === null && low) return <CoverageLowBadge />
  return <span className={FIGURE}>{ratio === null ? DASH : num(ratio)}</span>
}

function Tile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className={NOTE}>{title}</span>
      {children}
    </div>
  )
}

const BIG_FIGURE = cn(FIGURE, 'text-[20px] font-semibold leading-6')

export function UnitTotals({
  catalog,
  primary,
  coverage,
  coverageLow,
  accuracy,
}: {
  catalog: KpiCatalog
  primary: KpiDeskPrimary | null
  coverage: number | null
  coverageLow: boolean | null
  accuracy: number | null
}) {
  const { t } = useI18n()
  return (
    <GlassCard className={cn(TILE, 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3')}>
      <Tile
        title={
          primary
            ? kpiMetricText(primary.key)
            : t(message('Chỉ số chính', 'Primary metric', '핵심 지표'))
        }
      >
        {primary ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className={BIG_FIGURE}>{primaryText(catalog, null, primary)}</span>
            <VerdictBadge verdict={primary.verdict} />
          </span>
        ) : (
          <span className={BIG_FIGURE}>{DASH}</span>
        )}
      </Tile>
      <Tile title={t(message('Độ phủ pipeline', 'Pipeline coverage', '파이프라인 커버리지'))}>
        <span className="flex flex-wrap items-center gap-2">
          <span className={BIG_FIGURE}>
            {coverage === null ? DASH : `${num(coverage)} ${t(message('lần', 'x', '배'))}`}
          </span>
          {coverageLow && <CoverageLowBadge />}
        </span>
      </Tile>
      <Tile
        title={t(
          message(
            'Độ chính xác dự báo tháng trước',
            'Last month’s forecast accuracy',
            '지난달 예측 정확도',
          ),
        )}
      >
        <span className="flex flex-wrap items-baseline gap-2">
          <span className={BIG_FIGURE}>{accuracy === null ? DASH : `${num(accuracy * 100)}%`}</span>
          <span className={NOTE}>
            {t(message('so với số thật', 'against the actual', '실적 대비'))}
          </span>
        </span>
      </Tile>
    </GlassCard>
  )
}

type Say = (copy: Message) => string

const columnsOf = (t: Say, scoreMonth: string): StackColumn[] => [
  { header: t(message('Người', 'Person', '담당자')), width: 'minmax(0,1.2fr)' },
  { header: t(message('Vai', 'Role', '역할')), width: 'minmax(0,1.2fr)' },
  { header: t(message('Chỉ số chính', 'Primary metric', '핵심 지표')), width: 'minmax(0,1.5fr)' },
  { header: t(message('Nhịp', 'Pace', '진행')), width: 'minmax(0,1fr)' },
  {
    header: t(message('Độ phủ', 'Coverage', '커버리지')),
    width: 'minmax(0,0.7fr)',
    align: 'right',
  },
  { header: scoreMonth, width: 'minmax(0,0.8fr)', align: 'right' },
  { header: t(message('Dự báo tuần', 'Weekly forecast', '주간 예측')), width: 'minmax(0,0.9fr)' },
]

function cellsOf(m: KpiDeskMember, catalog: KpiCatalog, period: string, t: Say) {
  const ramping = m.rampFactor !== null
  return [
    <Link key="n" to={personHref(m.actorId, period)} className={NAME_LINK}>
      {m.name}
    </Link>,
    <span key="r">
      {kpiRoleText(m.role)}
      {ramping && ` · ${t(message('đang làm quen', 'ramping up', '적응 중'))}`}
    </span>,
    <span key="p" className={cn(FIGURE, 'font-semibold')}>
      {m.primary ? primaryText(catalog, m.role, m.primary) : DASH}
    </span>,
    m.primary ? <VerdictBadge key="v" verdict={m.primary.verdict} /> : DASH,
    <CoverageCell key="c" ratio={m.coverage} low={m.coverageLow} />,
    m.lastScore ? (
      <span key="s" className="flex flex-wrap items-center justify-end gap-2">
        <span className={FIGURE}>{num(m.lastScore.score)}</span>
        <GradeBadge grade={m.lastScore.grade} />
      </span>
    ) : (
      DASH
    ),
    m.forecastSaved === null ? (
      DASH
    ) : m.forecastSaved ? (
      <Badge key="f" tone="success">
        {t(message('Đã ghi', 'Saved', '저장됨'))}
      </Badge>
    ) : (
      <Badge key="f" tone="warning">
        {t(message('Chưa ghi', 'Not yet', '미기록'))}
      </Badge>
    ),
  ]
}

export function MembersCard({
  catalog,
  members,
  period,
  scoreOf,
}: {
  catalog: KpiCatalog
  members: readonly KpiDeskMember[]
  period: string
  /** The closed month the score column belongs to. */
  scoreOf: string
}) {
  const { t } = useI18n()
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        size="lg"
        hint={t(
          message(
            'Bấm tên để mở KPI của người đó.',
            'Press a name to open that person’s KPIs.',
            '이름을 누르면 그 사람의 KPI를 엽니다.',
          ),
        )}
      >
        {t(message('Thành viên', 'Members', '구성원'))}
      </SectionTitle>
      <GlassCard variant="b" className="flex flex-col gap-3 py-4">
        {members.length === 0 ? (
          <p className="px-5 text-[12.5px] leading-5">
            {t(
              message(
                'Đơn vị này chưa có ai giữ vai trò có KPI.',
                'Nobody in this unit holds a role with KPIs.',
                '이 조직에는 KPI가 있는 역할을 맡은 사람이 없습니다.',
              ),
            )}
          </p>
        ) : (
          <StackTable
            from="lg"
            flush
            rowHeight="min-h-12 py-2"
            tableClassName="min-w-4xl"
            columns={columnsOf(
              t,
              t(
                message(
                  `Điểm ${monthWord(scoreOf)}`,
                  `Score ${monthWord(scoreOf)}`,
                  `${monthWord(scoreOf)} 점수`,
                ),
              ),
            )}
            rows={members.map((m) => ({ id: m.actorId, cells: cellsOf(m, catalog, period, t) }))}
          />
        )}
      </GlassCard>
    </section>
  )
}
