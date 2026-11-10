import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Button,
  ChevronLeft,
  ChevronRight,
  GlassCard,
  Icon,
  SectionTitle,
  SegmentedControl,
  cn,
  percent,
} from '@pv/ui'
import {
  type KpiMetricDef,
  type KpiMonthPhase,
  type KpiQuarterKey,
  type KpiQuarterMeResponse,
  type KpiQuarterReading,
} from '@pv/contracts'
import { message, translate, useI18n, type Lang } from '@/app/i18n'
import { kpiMetricText, kpiRoleText } from '@/data/kpi-i18n'
import { defOf, kpiCatalogQuery, withCatalog, type KpiCatalog } from '@/data/kpi-catalog'
import { kpiQuarterMeQuery } from '@/data/kpi-personal'
import { GROW_WIDTH } from '@/components/period-picker-style'
import { currentPick, periodLabel, stepPick, type PeriodPick } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { printShort, printTile, printValue } from './kpi-model'
import { QueryBlock, VerdictBadge } from './kpi-parts'

/** The quarter view of the personal KPI screen (ADR 0146): each metric as the
 *  sum of its three months, read-only. Nothing is judged here; the verdict, the
 *  quarter target and the pace figure all arrive from the server.
 *
 *  The bar has one segment per month, as wide as that month's target and as
 *  full as its own value against it; the tick sits at the share of the quarter's
 *  days gone. A month is named by words, never by the segment colour alone. */

const PHASE: Record<KpiMonthPhase, ReturnType<typeof message>> = {
  closed: message('Đã kết thúc', 'Ended', '종료'),
  running: message('Đang chạy', 'Current', '이번 달'),
  future: message('Chưa bắt đầu', 'Not started', '시작 전'),
}

/** English reads a month by its short name, not a bare number. */
const monthTag = (period: string, lang: Lang) => {
  const n = Number(period.slice(5))
  const short = new Date(Date.UTC(2000, n - 1, 1)).toLocaleString('en', {
    month: 'short',
    timeZone: 'UTC',
  })
  return translate(message(`T${n}`, short, `${n}월`), lang)
}

const STEP = 'pointer-coarse:h-12 pointer-coarse:w-12 w-8 px-0'

/** The month picker's twin: it moves a quarter at a time and stops at the running one. */
export function QuarterPicker({
  quarter,
  onPick,
}: {
  quarter: KpiQuarterKey
  onPick: (q: KpiQuarterKey) => void
}) {
  const { t, lang } = useI18n()
  const pick: PeriodPick = { ...currentPick(), grain: 'quarter', quarter }
  const earlier = stepPick(pick, -1)
  const later = stepPick(pick, 1)
  return (
    <div
      role="group"
      aria-label={t(message('Chọn quý', 'Choose quarter', '분기 선택'))}
      className="flex items-center gap-1"
    >
      <Button
        variant="ghost"
        size="sm"
        className={STEP}
        aria-label={t(message('Quý trước', 'Previous quarter', '이전 분기'))}
        disabled={earlier === null}
        onClick={() => earlier && onPick(earlier.quarter)}
      >
        <Icon icon={ChevronLeft} size={16} />
      </Button>
      <span aria-live="polite" className="tnum min-w-32 text-center text-[12.5px] font-semibold">
        {periodLabel(quarter, lang)}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className={STEP}
        aria-label={t(message('Quý sau', 'Next quarter', '다음 분기'))}
        disabled={later === null}
        onClick={() => later && onPick(later.quarter)}
      >
        <Icon icon={ChevronRight} size={16} />
      </Button>
    </div>
  )
}

export function ViewSwitch({
  value,
  onChange,
}: {
  value: 'month' | 'quarter'
  onChange: (v: 'month' | 'quarter') => void
}) {
  const { t } = useI18n()
  return (
    <SegmentedControl
      label={t(message('Chọn kiểu xem', 'Choose view', '보기 선택'))}
      hideLabel
      tone="quiet"
      size="md"
      value={value}
      options={[
        { value: 'month', label: t(message('Tháng', 'Month', '월')) },
        { value: 'quarter', label: t(message('Quý', 'Quarter', '분기')) },
      ]}
      onChange={(v) => onChange(v === 'quarter' ? 'quarter' : 'month')}
    />
  )
}

const clamp = (share: number) => Math.min(Math.max(share, 0), 1)

/** Segments are as wide as their month targets, so the pace tick sits at
 *  expected / target; equal when any month has no (or a zero) target. */
function weightsOf(months: KpiQuarterReading['months']): number[] {
  return months.every((m) => m.target !== null && m.target > 0)
    ? months.map((m) => m.target ?? 1)
    : months.map(() => 1)
}

function QuarterCard({
  reading,
  def,
  phases,
  daysShare,
}: {
  reading: KpiQuarterReading
  def: KpiMetricDef
  phases: ReadonlyMap<string, KpiMonthPhase>
  daysShare: number
}) {
  const { t, lang } = useI18n()
  const { value, target, expected, months } = reading
  const weights = weightsOf(months)
  const unset = months.filter((m) => m.target === null).map((m) => monthTag(m.period, lang))
  const phaseOf = (period: string) => phases.get(period) ?? 'future'
  return (
    <GlassCard className={TILE}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h3 className="min-w-0 text-[13px] font-semibold leading-5">
          {kpiMetricText(def.key, lang)}
        </h3>
        <VerdictBadge verdict={reading.verdict} />
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="tnum font-num flex flex-wrap items-baseline gap-x-2">
          <span className="text-[24px] font-semibold leading-none tracking-[-.6px]">
            {printTile(def.unit, value)}
          </span>
          <span className="text-muted-foreground text-[13px]">
            {'/ '}
            {target === null
              ? t(message('Chưa đặt', 'Not set', '미설정'))
              : printValue(def.unit, target, true)}
          </span>
        </span>
        {target !== null && target > 0 && (
          <span className="tnum font-num text-[13px] font-semibold">{percent(value / target)}</span>
        )}
      </div>
      {expected !== null && (
        <span className={cn(NOTE, 'tnum font-num')}>
          {t(
            message(
              `Cần đạt ${printTile(def.unit, expected)} đến hôm nay`,
              `${printTile(def.unit, expected)} needed by today`,
              `오늘까지 ${printTile(def.unit, expected)} 필요`,
            ),
          )}
        </span>
      )}
      {unset.length > 0 && (
        <span className={NOTE}>
          {t(
            message(
              `${unset.join(', ')} chưa có chỉ tiêu`,
              `${unset.join(', ')}: no target yet`,
              `${unset.join(', ')} 목표 미설정`,
            ),
          )}
        </span>
      )}
      <div aria-hidden className="relative flex h-2 gap-1">
        {months.map((m, i) => (
          <span
            key={m.period}
            className="bg-surface-ink/10 min-w-0 basis-0 overflow-hidden rounded-sm"
            style={{ flexGrow: weights[i] }}
          >
            <span
              className={cn('bg-primary block h-full rounded-sm', GROW_WIDTH)}
              style={{
                width: `${clamp(m.target && m.value !== null ? m.value / m.target : 0) * 100}%`,
              }}
            />
          </span>
        ))}
        {expected !== null && (
          <span
            className="bg-foreground absolute -top-1 h-4 w-0.5 rounded-sm shadow-[0_0_0_1px_var(--card)]"
            style={{ left: `min(${daysShare * 100}%, calc(100% - 2px))` }}
          />
        )}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {months.map((m) => (
          <div key={m.period} className="flex min-w-0 flex-col gap-1">
            <span className={NOTE}>
              {monthTag(m.period, lang)} · {translate(PHASE[phaseOf(m.period)], lang)}
            </span>
            <span className="tnum font-num text-[13px] font-semibold">
              {printShort(def.unit, m.value)}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

/** Metrics with no quarter figure (ratio, duration, snapshot): read per month. */
function MonthOnly({
  keys,
  onMonthView,
}: {
  keys: KpiQuarterMeResponse['scorecards'][number]['monthOnly']
  onMonthView: () => void
}) {
  const { t, lang } = useI18n()
  return (
    <GlassCard className={TILE}>
      <h3 className="text-[13px] font-semibold leading-5">
        {t(message('Chỉ xem theo tháng', 'Monthly view only', '월별로만 확인'))}
      </h3>
      <ul className="flex flex-col gap-1">
        {keys.map((key) => (
          <li key={key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="text-[12.5px]">{kpiMetricText(key, lang)}</span>
            <Button variant="ghost" size="sm" className="pointer-coarse:h-12" onClick={onMonthView}>
              {t(message('Xem theo tháng', 'View by month', '월별 보기'))}
              <Icon icon={ArrowRight} size={16} />
            </Button>
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

function QuarterBody({
  data,
  catalog,
  onMonthView,
}: {
  data: KpiQuarterMeResponse
  catalog: KpiCatalog
  onMonthView: () => void
}) {
  const { t, lang } = useI18n()
  const phases = new Map(data.months.map((m) => [m.period, m.phase]))
  const daysShare = data.daysGone / data.days
  const cards = data.scorecards.filter((c) => c.readings.length > 0 || c.monthOnly.length > 0)
  return (
    <>
      <div className={cn(NOTE, 'flex flex-wrap items-center justify-between gap-x-4 gap-y-1')}>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {data.months.map((m) => (
            <span key={m.period}>
              {monthTag(m.period, lang)} · {translate(PHASE[m.phase], lang)}
            </span>
          ))}
        </span>
        <span className="tnum font-num">
          {t(
            message(
              `Đã qua ${data.daysGone}/${data.days} ngày của quý (${percent(daysShare)})`,
              `${data.daysGone} of ${data.days} days of the quarter gone (${percent(daysShare)})`,
              `분기 ${data.days}일 중 ${data.daysGone}일 경과 (${percent(daysShare)})`,
            ),
          )}
        </span>
      </div>
      {cards.length === 0 && (
        <GlassCard className={cn(TILE, 'text-[12.5px]')}>
          {t(
            message(
              'Bạn chưa được giao chỉ tiêu KPI nào.',
              'You have no KPI targets assigned yet.',
              '아직 배정된 KPI 목표가 없습니다.',
            ),
          )}
        </GlassCard>
      )}
      {cards.map((card) => (
        <section key={card.role} className="flex flex-col gap-4">
          <SectionTitle size="lg">{kpiRoleText(card.role, lang)}</SectionTitle>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {card.readings.map((reading) => {
              const def = defOf(catalog, card.role, reading.key)
              return def ? (
                <QuarterCard
                  key={reading.key}
                  reading={reading}
                  def={def}
                  phases={phases}
                  daysShare={daysShare}
                />
              ) : null
            })}
          </div>
          {card.monthOnly.length > 0 && (
            <MonthOnly keys={card.monthOnly} onMonthView={onMonthView} />
          )}
        </section>
      ))}
    </>
  )
}

export function QuarterView({
  quarter,
  onMonthView,
}: {
  quarter: KpiQuarterKey
  onMonthView: () => void
}) {
  const data = useQuery(kpiQuarterMeQuery(quarter))
  const catalog = useQuery(kpiCatalogQuery)
  return (
    <QueryBlock
      query={withCatalog(data, catalog)}
      what={message('KPI theo quý', 'your quarterly KPIs', '분기 KPI')}
    >
      {([d, defs]) => <QuarterBody data={d} catalog={defs} onMonthView={onMonthView} />}
    </QueryBlock>
  )
}
