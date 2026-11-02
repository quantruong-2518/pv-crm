import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, GlassCard, Icon, TriangleAlert, Users, cn, percent } from '@pv/ui'
import {
  type KpiForecast,
  type KpiForecastResponse,
  type KpiReading,
  type KpiTeamViewResponse,
  type KpiUnit,
  type RoleId,
} from '@pv/contracts'
import { useSession } from '@/app/auth'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { flagsOf } from '@/data/kpi-forecast'
import { weeklyMetricOf } from '@/data/kpi-personal'
import { kpiTeamViewQuery } from '@/data/kpi-team-view'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import { teamPath } from './kpi-allocate-model'
import { boardOf, printTile, printValue } from './kpi-model'
import { ReadingTile } from './kpi-parts'
import { counterActors, isClosed, packageOf, sharedRoles } from './kpi-team-model'
import { WeeklyChart } from './kpi-weekly-chart'
import { message, translate, useI18n, type Lang, type Message } from '@/app/i18n'
import { kpiMetricText } from '@/data/kpi-i18n'

/** The blocks the personal KPI screen adds to the role board for ADR 0098: the
 *  team lead's way in, the slip / hit flags, and the board with the weekly chart
 *  set beside its hero.
 *
 *  A flag is a worded badge plus a sentence with both figures, never a colour
 *  alone, and shows wherever the server raised it, as on the company and
 *  person screens. Its thresholds are printed once per screen from the
 *  response, never typed here. */

/** What waits on whoever acts for the lead: an open counter they answer
 *  (`counterActors`, never their own), and a shared role whose split is not yet
 *  sent, was returned, or no longer matches the team's share. */
function leadWaiting(view: KpiTeamViewResponse, me: string | undefined): number {
  if (isClosed(view)) return 0
  const splits = sharedRoles(view.shares).filter((role) => {
    const pkg = packageOf(view.allocations, role)
    return !pkg || pkg.status === 'draft' || pkg.status === 'returned' || pkg.shareChanged
  }).length
  const mine = view.counters.filter(
    (c) =>
      c.status === 'open' && me !== undefined && counterActors(view.team, c.actorId).includes(me),
  )
  return splits + mine.length
}

/** The way to the team page, for the reader acting for its lead that month (ADR 0101, 0117).
 *  The count is a side read: without it the button stands alone. */
export function TeamLeadLink({
  team,
  period,
}: {
  team: { id: string; name: string }
  period: string
}) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const view = useQuery(kpiTeamViewQuery(period, team.id))
  const me = useSession((s) => s.actor?.id)
  const waiting = view.data ? leadWaiting(view.data, me) : 0
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        className="pointer-coarse:h-12"
        onClick={() => navigate(teamPath(team.id, period))}
      >
        <Icon icon={Users} size={16} />
        {t(message(`Mở trang nhóm ${team.name}`, `Open ${team.name} team`, `${team.name} 팀 열기`))}
      </Button>
      {waiting > 0 && (
        <span className={cn(NOTE, 'tnum font-num')}>
          {t(
            message(
              `${num(waiting)} mục chờ bạn xử lý`,
              `${num(waiting)} items need your attention`,
              `처리할 항목 ${num(waiting)}개`,
            ),
          )}
        </span>
      )}
    </div>
  )
}

/** A side read failed: one line with its own retry, the board stays up. */
export function SideFailure({ what, retry }: { what: string | Message; retry: () => void }) {
  const { t } = useI18n()
  const subject = typeof what === 'object' ? t(what) : what
  return (
    <p className={cn(NOTE, 'text-destructive-foreground flex flex-wrap items-center gap-2')}>
      <Icon icon={TriangleAlert} size={16} className="text-destructive-foreground shrink-0" />
      {t(
        message(
          `Không tải được ${subject}.`,
          `Could not load ${subject}.`,
          `${subject}을(를) 불러오지 못했습니다.`,
        ),
      )}
      <Button variant="ghost" size="sm" className="pointer-coarse:h-12" onClick={retry}>
        {t(message('Thử lại', 'Retry', '다시 시도'))}
      </Button>
    </p>
  )
}

function flagSentence(f: KpiForecast, unit: KpiUnit, lang: Lang): string {
  const label = kpiMetricText(f.metricKey, lang)
  if (f.flag === 'hit' && f.value !== null && f.target) {
    const done = percent(f.value / f.target)
    return translate(
      message(
        `${label}: đã đạt ${done} chỉ tiêu.`,
        `${label}: ${done} of target reached.`,
        `${label}: 목표의 ${done} 달성.`,
      ),
      lang,
    )
  }
  const goal = f.target === null ? '' : printValue(unit, f.target, true)
  const target =
    f.target === null
      ? ''
      : translate(message(` / chỉ tiêu ${goal}`, ` / target ${goal}`, ` / 목표 ${goal}`), lang)
  const projected = translate(message('dự báo cuối tháng', 'month-end forecast', '월말 예상'), lang)
  return `${label}: ${projected} ${printTile(unit, f.projected)}${target}.`
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
  const { t, lang } = useI18n()
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
              {f.flag === 'slip'
                ? t(message('Sắp trượt', 'At risk', '미달 위험'))
                : t(message('Sắp đạt', 'On track', '목표 달성 임박'))}
            </Badge>
            <span className="tnum font-num">
              {flagSentence(f, unitOf.get(f.metricKey) ?? 'count', lang)}
            </span>
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

/** What the two flags mean, once for the whole screen however many roles carry one. */
export function ThresholdNote({ thresholds }: { thresholds: KpiForecastResponse['thresholds'] }) {
  const { t } = useI18n()
  return (
    <p className={cn(NOTE, 'tnum font-num')}>
      {t(
        message(
          `Sắp trượt khi dự báo cuối tháng dưới ${percent(thresholds.slipRatio)} chỉ tiêu. Sắp đạt khi đã đạt từ ${percent(thresholds.hitRatio)}.`,
          `At risk when the month-end forecast is below ${percent(thresholds.slipRatio)} of target. On track when at or above ${percent(thresholds.hitRatio)}.`,
          `월말 예상이 목표의 ${percent(thresholds.slipRatio)} 미만이면 미달 위험, ${percent(thresholds.hitRatio)} 이상이면 목표 달성 임박으로 표시됩니다.`,
        ),
      )}
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
