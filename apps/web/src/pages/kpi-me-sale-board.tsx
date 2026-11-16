import type { ReactNode } from 'react'
import { GlassCard, Icon, TriangleAlert, cn, percent } from '@pv/ui'
import { type KpiReading, type RoleId } from '@pv/contracts'
import { useI18n } from '@/app/i18n'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { weeklyMetricOf } from '@/data/kpi-personal'
import { kpiMetricText, metricHowOf } from '@/data/kpi-i18n'
import { NOTE, TILE } from './home-tiles'
import {
  BAR_FILL,
  boardOf,
  paceOf,
  printShort,
  printTile,
  shareOf,
  shortfallOf,
  type KpiItem,
} from './kpi-model'
import { AdjustmentNote, ByDefaultMark, VerdictBadge } from './kpi-parts'
import { Track } from './kpi-me-sale-bars'
import { drawnAsRate, isBoardRole } from './kpi-me-role-model'
import * as copy from './kpi-me-sale-i18n'
import { share } from './kpi-me-sale-model'
import { WeeklyChart } from './kpi-weekly-chart'

/** The role's primary metric and the cards of its other metrics (ADR 0160 §9).
 *  A bar is drawn only where it says something: a tick at pace for a figure that
 *  should grow, a tick at the limit for one that must stay under it; the words
 *  beside it say the same, so the bar is hidden from assistive tech. */

/** Columns for the metric tiles, chosen by count so a row is never left with one tile
 *  alone: three share a row, four go two by two then four across. */
const columnsOf = (n: number) =>
  n === 1
    ? ''
    : n % 3 === 0
      ? 'md:grid-cols-3'
      : n === 4
        ? 'md:grid-cols-2 xl:grid-cols-4'
        : n % 2 === 0
          ? 'md:grid-cols-2'
          : 'md:grid-cols-2 xl:grid-cols-3'

const FIGURE = 'tnum font-num font-semibold leading-none'

function Counted({ item }: { item: KpiItem }) {
  const { lang } = useI18n()
  return (
    <p className={cn(NOTE, 'm-0')}>
      {copy.HOW[lang]} {metricHowOf(item.def.key, lang)}
    </p>
  )
}

function Shortfall({ item }: { item: KpiItem }) {
  const line = shortfallOf(item, true)
  if (line === null) return null
  return (
    <p className="flex items-center gap-2 text-[12.5px] font-semibold leading-5">
      <Icon icon={TriangleAlert} size={16} className="text-warning shrink-0" />
      {line}
    </p>
  )
}

function Hero({ item }: { item: KpiItem }) {
  const { t, lang } = useI18n()
  const { def, reading } = item
  const pace = paceOf(item)
  const done = shareOf(item)
  const needed =
    def.paced &&
    reading.target !== null &&
    reading.expected !== null &&
    reading.expected < reading.target
      ? reading.expected
      : null
  return (
    <GlassCard className={cn(TILE, 'gap-3 p-5')}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <span className={NOTE}>{t(copy.heroKicker(kpiMetricText(def.key, lang)))}</span>
        <VerdictBadge verdict={reading.verdict} />
      </div>
      <span
        className={cn(
          FIGURE,
          'text-[34px] tracking-[-1.2px]',
          reading.value === null && 'text-muted-foreground text-[16px] tracking-normal',
        )}
      >
        {printTile(def.unit, reading.value)}
        {reading.target !== null && (
          <span className="ml-2 text-[16px] font-semibold tracking-normal">
            / {printShort(def.unit, reading.target)}
          </span>
        )}
      </span>
      {pace && (
        <Track
          tall
          fill={pace.fill}
          ticks={pace.mark === null ? [] : [{ at: pace.mark, tone: 'ink' }]}
        />
      )}
      <div className="tnum font-num flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12.5px] leading-5">
        {done !== null && <span>{t(copy.reached(percent(done)))}</span>}
        {pace && pace.mark !== null && <span>{t(copy.paceToday(percent(pace.mark)))}</span>}
      </div>
      {needed !== null && (
        <span className="tnum font-num text-[12.5px] leading-5">
          {t(copy.neededToday(printShort(def.unit, needed)))}
        </span>
      )}
      <Shortfall item={item} />
      <AdjustmentNote unit={def.unit} reading={reading} />
      <Counted item={item} />
    </GlassCard>
  )
}

/** A figure that must stay under a limit: the bar runs to twice the limit, the tick is the limit. */
function LimitBar({ item }: { item: KpiItem }) {
  const { t } = useI18n()
  const { def, reading } = item
  if (reading.target === null || reading.target <= 0 || reading.value === null) return null
  return (
    <>
      <Track
        tall
        fill={share(reading.value, reading.target * 2)}
        fillClass={BAR_FILL[reading.verdict]}
        ticks={[{ at: 0.5, tone: 'ink' }]}
      />
      <div className="tnum font-num flex items-center justify-between gap-2 text-[12px] leading-4">
        <span className="text-muted-foreground">0</span>
        <span className="font-semibold">{t(copy.limit(printShort(def.unit, reading.target)))}</span>
        <span className="text-muted-foreground">{printShort(def.unit, reading.target * 2)}</span>
      </div>
    </>
  )
}

function PaceBar({ item }: { item: KpiItem }) {
  const { t } = useI18n()
  const { def, reading } = item
  const pace = paceOf(item)
  if (pace === null) return null
  const done = shareOf(item)
  return (
    <>
      <Track
        tall
        fill={pace.fill}
        fillClass={BAR_FILL[reading.verdict]}
        ticks={pace.mark === null ? [] : [{ at: pace.mark, tone: 'ink' }]}
      />
      <div className="tnum font-num flex items-center justify-between gap-2 text-[12px] leading-4">
        <span className="text-muted-foreground">
          {reading.expected !== null &&
            def.paced &&
            t(copy.paceToday(printShort(def.unit, reading.expected)))}
        </span>
        {done !== null && <span className="font-semibold">{percent(done)}</span>}
      </div>
    </>
  )
}

function MetricTile({ item }: { item: KpiItem }) {
  const { t, lang } = useI18n()
  const { def, reading } = item
  const inline = reading.target !== null && (def.unit === 'count' || def.unit === 'money')
  return (
    <GlassCard className={cn(TILE, 'min-w-0')}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h3 className="text-[13px] font-semibold leading-5">{kpiMetricText(def.key, lang)}</h3>
        <VerdictBadge verdict={reading.verdict} />
      </div>
      <span
        className={cn(
          FIGURE,
          'text-[24px] tracking-[-.6px]',
          reading.value === null && 'text-muted-foreground text-[16px] tracking-normal',
        )}
      >
        {printTile(def.unit, reading.value)}
        {inline && reading.target !== null && (
          <span className="text-muted-foreground ml-2 text-[16px] tracking-normal">
            / {printShort(def.unit, reading.target)}
          </span>
        )}
      </span>
      <AdjustmentNote unit={def.unit} reading={reading} />
      {def.higherIsBetter ? <PaceBar item={item} /> : <LimitBar item={item} />}
      {reading.target !== null && def.higherIsBetter && !inline && (
        <span className={cn(NOTE, 'tnum font-num')}>
          {t(copy.targetOf(printShort(def.unit, reading.target)))}
          <ByDefaultMark reading={reading} className="ml-2 align-middle" />
        </span>
      )}
      <Shortfall item={item} />
      <Counted item={item} />
    </GlassCard>
  )
}

/** The hero with `between` (the score) beside it, then `chart` when the role has
 *  one; without a chart a role with a weekly series keeps its weekly columns
 *  beside the hero. Then the other metrics. */
export function PersonalBoard({
  catalog,
  period,
  role,
  readings,
  between,
  chart,
}: {
  catalog: KpiCatalog
  period: string
  role: RoleId
  readings: readonly KpiReading[]
  between?: ReactNode
  chart?: ReactNode
}) {
  const board = boardOf(catalog, role, readings)
  const { hero } = board
  /* On a role board the rates card already draws every metric without a pace. */
  const rest = isBoardRole(role) ? board.rest.filter((i) => !drawnAsRate(i.def)) : board.rest
  const weekly = chart ? null : weeklyMetricOf(catalog, role)
  return (
    <div className="flex flex-col gap-4">
      {hero && (
        <div
          className={cn(
            'grid grid-cols-1 gap-4',
            weekly
              ? 'xl:grid-cols-[2fr_3fr]'
              : 'grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))]',
          )}
        >
          <Hero item={hero} />
          {weekly ? <WeeklyChart period={period} role={role} def={weekly} /> : between}
        </div>
      )}
      {(weekly || !hero) && between}
      {chart}
      {rest.length > 0 && (
        <div className={cn('grid grid-cols-1 gap-4', columnsOf(rest.length))}>
          {rest.map((item) => (
            <MetricTile key={item.def.key} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
