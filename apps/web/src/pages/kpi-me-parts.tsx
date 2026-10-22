import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, GlassCard, Icon, TriangleAlert, Users, cn, percent } from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  type KpiForecast,
  type KpiForecastResponse,
  type KpiReading,
  type KpiTeamViewResponse,
  type KpiUnit,
  type RoleId,
} from '@pv/contracts'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { flagsOf } from '@/data/kpi-forecast'
import { weeklyMetricOf } from '@/data/kpi-personal'
import { kpiTeamViewQuery } from '@/data/kpi-team-view'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import { teamPath } from './kpi-allocate-model'
import { boardOf, printTile, printValue } from './kpi-model'
import { ReadingTile } from './kpi-parts'
import { isClosed, packageOf, sharedRoles } from './kpi-team-model'
import { WeeklyChart } from './kpi-weekly-chart'

/** The blocks the personal KPI screen adds to the role board for ADR 0098: the
 *  team lead's way in, the slip / hit flags, and the board with the weekly chart
 *  set beside its hero.
 *
 *  A flag is a worded badge plus a sentence with both figures, never a colour
 *  alone, and shows wherever the server raised it, as on the company and
 *  person screens. Its thresholds are printed once per screen from the
 *  response, never typed here. */

/** What waits on the lead: a member's open counter, and a shared role whose
 *  split is not yet sent, was returned, or no longer matches the team's share.
 *  The lead's own counter is the head's to answer, so it is not counted. */
function leadWaiting(view: KpiTeamViewResponse): number {
  if (isClosed(view)) return 0
  const splits = sharedRoles(view.shares).filter((role) => {
    const pkg = packageOf(view.allocations, role)
    return !pkg || pkg.status === 'draft' || pkg.status === 'returned' || pkg.shareChanged
  }).length
  const lead = view.team.lead.actorId
  return splits + view.counters.filter((c) => c.status === 'open' && c.actorId !== lead).length
}

/** The way to the team page, for the reader who leads a team that month (ADR 0101).
 *  The count is a side read: without it the button stands alone. */
export function TeamLeadLink({
  team,
  period,
}: {
  team: { id: string; name: string }
  period: string
}) {
  const navigate = useNavigate()
  const view = useQuery(kpiTeamViewQuery(period, team.id))
  const waiting = view.data ? leadWaiting(view.data) : 0
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        className="pointer-coarse:h-12"
        onClick={() => navigate(teamPath(team.id, period))}
      >
        <Icon icon={Users} size={16} />
        Mở trang nhóm {team.name}
      </Button>
      {waiting > 0 && (
        <span className={cn(NOTE, 'tnum font-num')}>{num(waiting)} mục chờ bạn xử lý</span>
      )}
    </div>
  )
}

/** A side read failed: one line with its own retry, the board stays up. */
export function SideFailure({ what, retry }: { what: string; retry: () => void }) {
  return (
    <p className={cn(NOTE, 'text-destructive-foreground flex flex-wrap items-center gap-2')}>
      <Icon icon={TriangleAlert} size={16} className="text-destructive-foreground shrink-0" />
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
  /* On `.glass-b`, not the bare page: in the stone theme the tinted badge falls under 4.5:1 there (law 13). */
  return (
    <GlassCard variant="b" className="p-4">
      <ul className="flex flex-col gap-2">
        {flagged.map((f) => (
          <li
            key={f.metricKey}
            className="flex flex-wrap items-center gap-2 text-[12.5px] leading-5"
          >
            <Badge tone={f.flag === 'slip' ? 'warning' : 'success'}>
              {f.flag === 'slip' ? 'Sắp trượt' : 'Sắp đạt'}
            </Badge>
            <span className="tnum font-num">
              {flagSentence(f, unitOf.get(f.metricKey) ?? 'count')}
            </span>
          </li>
        ))}
      </ul>
    </GlassCard>
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
