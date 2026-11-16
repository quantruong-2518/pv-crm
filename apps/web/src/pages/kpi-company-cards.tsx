import { Link } from 'react-router-dom'
import { Avatar, Badge, GlassCard, RadialGauge, cn, percent } from '@pv/ui'
import type { KpiCompanyDeskUnit, KpiDeskPrimary, KpiVerdict } from '@pv/contracts'
import { message, useI18n, type Message } from '@/app/i18n'
import { kpiMetricText } from '@/data/kpi-i18n'
import { MONTH_PARAM, UNIT_PATH } from '@/lib/kpi-paths'
import { NOTE, TILE } from './home-tiles'
import { notApplicable } from './kpi-company-i18n'
import { defOfKey, otherBar, shareOfPrimary, toneOf } from './kpi-company-model'
import { DASH, printShort } from './kpi-model'
import { VerdictBadge } from './kpi-parts'
import { Meter } from './kpi-unit-meter'
import { CoverageLowBadge } from './kpi-unit-parts'
import { num } from './home-model'

/** One card per unit on the company tab: head, pace verdict, share of the
 *  primary target, coverage, last month's average score, forecast state, two
 *  more of the unit's metrics as bars, and the member furthest along. */

const FIGURE = 'tnum font-num'
const GAUGE_TONE: Partial<Record<KpiVerdict, 'success' | 'warning' | 'danger'>> = {
  met: 'success',
  behind: 'warning',
  missed: 'danger',
}

function Stat({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={NOTE}>{title}</span>
      <span className={cn(FIGURE, 'text-[15px] font-semibold leading-5')}>{children}</span>
    </div>
  )
}

function OtherBar({ period, other }: { period: string; other: KpiDeskPrimary }) {
  const def = defOfKey(period, other.key)
  const bar = otherBar(other)
  const figure = def ? printShort(def.unit, other.value) : DASH
  return (
    <li className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3">
      <span className="min-w-0 text-[12.5px] leading-4">{kpiMetricText(other.key)}</span>
      {bar ? (
        <Meter size="md" fill={bar.fill} mark={bar.mark} tone={toneOf(other.verdict)} />
      ) : (
        <span />
      )}
      <span className={cn(FIGURE, 'text-right text-[12.5px] font-semibold')}>
        {figure}
        {def && other.target !== null && (
          <span className="text-muted-foreground font-normal">
            {' / '}
            {printShort(def.unit, other.target)}
          </span>
        )}
      </span>
    </li>
  )
}

function headLine(unit: KpiCompanyDeskUnit, t: (copy: Message) => string): string {
  const head = unit.standInName
    ? t(
        message(
          `${unit.standInName} (thay ${unit.headName ?? DASH})`,
          `${unit.standInName} (for ${unit.headName ?? DASH})`,
          `${unit.standInName} (${unit.headName ?? DASH} 대리)`,
        ),
      )
    : (unit.headName ?? DASH)
  return t(message(`Trưởng: ${head}`, `Head: ${head}`, `책임자: ${head}`))
}

export function UnitCard({ unit, period }: { unit: KpiCompanyDeskUnit; period: string }) {
  const { t } = useI18n()
  const { primary } = unit
  const def = primary ? defOfKey(period, primary.key) : undefined
  const share = primary ? shareOfPrimary(primary) : null
  const coverage =
    unit.coverage === null && unit.coverageLow === null ? (
      notApplicable()
    ) : unit.coverage === null ? (
      <CoverageLowBadge />
    ) : (
      `${num(unit.coverage)} ${t(message('lần', 'x', '배'))}`
    )
  return (
    <GlassCard className={cn(TILE, 'gap-4')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            to={`${UNIT_PATH}?${MONTH_PARAM}=${period}&unit=${unit.unitId}`}
            className="pointer-coarse:min-h-12 inline-flex items-center text-[16px] font-semibold underline-offset-2 hover:underline focus-visible:underline"
          >
            {unit.name}
          </Link>
          <span className={NOTE}>{headLine(unit, t)}</span>
        </div>
        {primary && <VerdictBadge verdict={primary.verdict} />}
      </div>
      <div className="flex items-center gap-5">
        <RadialGauge
          size={96}
          value={share ?? 0}
          center={share === null ? DASH : percent(share)}
          caption={t(message('chỉ tiêu', 'of target', '목표 대비'))}
          label={t(message('Đạt chỉ tiêu chính', 'Main target reached', '핵심 목표 달성'))}
          tone={primary ? (GAUGE_TONE[primary.verdict] ?? 'primary') : 'primary'}
          empty={share === null ? DASH : undefined}
        />
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3">
          <Stat title={primary ? kpiMetricText(primary.key) : DASH}>
            {primary && def
              ? `${printShort(def.unit, primary.value)} / ${printShort(def.unit, primary.target)}`
              : DASH}
          </Stat>
          <Stat title={t(message('Độ phủ pipeline', 'Pipeline coverage', '파이프라인 커버리지'))}>
            {coverage}
          </Stat>
          <Stat
            title={t(
              message('Điểm TB tháng trước', 'Average score, last month', '지난달 평균 점수'),
            )}
          >
            {unit.averageScore === null ? DASH : num(unit.averageScore)}
          </Stat>
          <Stat title={t(message('Dự báo tuần', 'Weekly forecast', '주간 예상'))}>
            {unit.forecastCommitted === null ? (
              notApplicable()
            ) : (
              <Badge tone={unit.forecastCommitted ? 'success' : 'draft'}>
                {unit.forecastCommitted
                  ? t(message('Đã chốt', 'Committed', '확정'))
                  : t(message('Chưa chốt', 'Not committed', '미확정'))}
              </Badge>
            )}
          </Stat>
        </div>
      </div>
      {unit.others.length > 0 && (
        <ul className="flex flex-col gap-3">
          {unit.others.map((o) => (
            <OtherBar key={o.key} period={period} other={o} />
          ))}
        </ul>
      )}
      {unit.top && (
        <div className="bg-surface-ink/5 flex items-center gap-3 rounded-lg px-4 py-3">
          <Avatar name={unit.top.name} size="sm" />
          <div className="flex min-w-0 flex-1 flex-col">
            <b className="truncate text-[13px]">{unit.top.name}</b>
            <span className={cn(NOTE, FIGURE)}>
              {t(
                message(
                  `${percent(unit.top.percent)} chỉ tiêu của người đó`,
                  `${percent(unit.top.percent)} of their own target`,
                  `본인 목표의 ${percent(unit.top.percent)}`,
                ),
              )}
            </span>
          </div>
          <Badge tone="success">{t(message('Dẫn đầu đơn vị', 'Unit leader', '조직 선두'))}</Badge>
        </div>
      )}
    </GlassCard>
  )
}

export function UnitCards({
  period,
  units,
  children,
}: {
  period: string
  units: readonly KpiCompanyDeskUnit[]
  /** Cards that sit in the same grid after the units. */
  children?: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[15px] font-semibold">
          {t(message('Đơn vị', 'Units', '조직'))}
        </h2>
        <span className={NOTE}>
          {t(
            message(
              'Vạch đậm trên mỗi thanh là mục tiêu của chỉ số đó.',
              'The dark mark on each bar is that metric’s target.',
              '각 막대의 굵은 표시는 해당 지표의 목표입니다.',
            ),
          )}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:[&>:last-child:nth-child(odd)]:col-span-2">
        {units.map((u) => (
          <UnitCard key={u.unitId} unit={u} period={period} />
        ))}
        {children}
      </div>
    </section>
  )
}
