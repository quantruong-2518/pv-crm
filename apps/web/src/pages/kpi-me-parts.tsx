import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Badge,
  Button,
  GlassCard,
  Icon,
  Target,
  TriangleAlert,
  cn,
  percent,
} from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  type KpiForecast,
  type KpiForecastResponse,
  type KpiReading,
  type KpiUnit,
  type RoleId,
} from '@pv/contracts'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { flagsOf } from '@/data/kpi-forecast'
import { weeklyMetricOf } from '@/data/kpi-personal'
import { num, periodLabel } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { MONTH_PARAM, boardOf, printTile, printValue } from './kpi-model'
import { ReadingTile } from './kpi-parts'
import { WeeklyChart } from './kpi-weekly-chart'

/** The blocks the personal KPI screen adds to the role board for ADR 0098: the door to
 *  new targets, the slip / hit flags, and the board with the weekly chart
 *  set beside its hero.
 *
 *  A flag is a worded badge plus a sentence with both figures, never a colour
 *  alone, and shows wherever the server raised it, as on the company and
 *  person screens. Its thresholds are printed once per screen from the
 *  response, never typed here. */

export const RECEIVE_PATH = '/sales/kpi/receive'

export function NewTargetsCard({ period, pending }: { period: string; pending: number }) {
  const navigate = useNavigate()
  return (
    <GlassCard className={cn(TILE, 'sm:flex-row sm:items-center')}>
      <Icon icon={Target} size={20} className="text-accent-foreground shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-[13px] font-semibold leading-5">Chỉ tiêu mới giao cho bạn</h2>
        <p className={cn(NOTE, 'tnum font-num')}>
          {num(pending)} chỉ tiêu {periodLabel(period).toLowerCase()} chờ bạn xác nhận.
        </p>
      </div>
      <Button
        className="pointer-coarse:h-12 shrink-0 self-start sm:self-center"
        onClick={() => navigate(`${RECEIVE_PATH}?${MONTH_PARAM}=${period}`)}
      >
        Xem và xác nhận
        <Icon icon={ArrowRight} size={16} />
      </Button>
    </GlassCard>
  )
}

/** A side read failed: one line with its own retry, the board stays up. */
export function SideFailure({ what, retry }: { what: string; retry: () => void }) {
  return (
    <p className={cn(NOTE, 'flex flex-wrap items-center gap-2')}>
      <Icon icon={TriangleAlert} size={16} className="text-warning shrink-0" />
      Không tải được {what}.
      <Button variant="ghost" size="sm" className="pointer-coarse:h-12" onClick={retry}>
        Thử lại
      </Button>
    </p>
  )
}

function flagSentence(f: KpiForecast, unit: KpiUnit): string {
  const label = KPI_METRIC_LABEL[f.metricKey]
  if (f.flag === 'hit' && f.value !== null && f.target) {
    return `${label}: đã đạt ${percent(f.value / f.target)} chỉ tiêu.`
  }
  const target = f.target === null ? '' : ` / chỉ tiêu ${printValue(unit, f.target, true)}`
  return `${label}: dự báo cuối tháng ${printTile(unit, f.projected)}${target}.`
}

export function ForecastFlags({
  catalog,
  role,
  forecast,
}: {
  catalog: KpiCatalog
  role: RoleId
  forecast: KpiForecastResponse
}) {
  const unitOf = new Map(catalog[role].map((d) => [d.key, d.unit]))
  const flagged = flagsOf(catalog, role, forecast)
  if (flagged.length === 0) return null
  return (
    <ul className="flex flex-col gap-2">
      {flagged.map((f) => (
        <li key={f.metricKey} className="flex flex-wrap items-center gap-2 text-[12.5px] leading-5">
          <Badge tone={f.flag === 'slip' ? 'warning' : 'success'}>
            {f.flag === 'slip' ? 'Sắp trượt' : 'Sắp đạt'}
          </Badge>
          <span className="tnum font-num">
            {flagSentence(f, unitOf.get(f.metricKey) ?? 'count')}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** What the two flags mean, once for the whole screen however many roles carry one. */
export function ThresholdNote({ thresholds }: { thresholds: KpiForecastResponse['thresholds'] }) {
  return (
    <p className={cn(NOTE, 'tnum font-num')}>
      Sắp trượt khi dự báo cuối tháng dưới {percent(thresholds.slipRatio)} chỉ tiêu. Sắp đạt khi đã
      đạt từ {percent(thresholds.hitRatio)}.
    </p>
  )
}

/** The role's hero with its weekly chart beside it, then the rest of the
 *  readings; `Scoreboard`'s layout otherwise, built from the same parts. */
export function PersonalBoard({
  catalog,
  period,
  role,
  readings,
}: {
  catalog: KpiCatalog
  period: string
  role: RoleId
  readings: readonly KpiReading[]
}) {
  const { hero, rest } = boardOf(catalog, role, readings)
  const weekly = weeklyMetricOf(catalog, role)
  return (
    <div className="flex flex-col gap-4">
      {hero && (
        <div className={cn('grid grid-cols-1 gap-4', weekly && 'xl:grid-cols-[2fr_3fr]')}>
          <ReadingTile item={hero} hero />
          {weekly && <WeeklyChart period={period} role={role} def={weekly} />}
        </div>
      )}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rest.map((item) => (
            <ReadingTile key={item.def.key} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
