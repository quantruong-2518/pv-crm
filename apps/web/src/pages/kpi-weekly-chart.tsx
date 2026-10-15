import { useQuery } from '@tanstack/react-query'
import { GlassCard, cn } from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  type KpiMetricDef,
  type KpiWeeklyPoint,
  type RoleId,
} from '@pv/contracts'
import { kpiWeeklyQuery } from '@/data/kpi-personal'
import { dm } from '@/lib/date'
import { GROW_HEIGHT, NEUTRAL_MARK, NOTE, TILE, TileHead } from './home-tiles'
import { printTile } from './kpi-model'
import { QueryBlock } from './kpi-parts'

/** The primary metric's running total, one column per week of the month,
 *  read live from `GET /sales/kpi/:period/weekly/:role`. Drawn with plain
 *  boxes on tokens, the way `PaceBar` is: no chart library for one series.
 *
 *  Every column prints its figure and its expected-by-then figure as words, so the drawn
 *  part is `aria-hidden`. A started week stacks what is missing up to the
 *  expected line in the neutral mark over the actual; a week not yet started
 *  prints nothing rather than a zero. Only for `weeklyMetricOf` metrics. */

const DAY_MS = 86_400_000

const plusDays = (day: string, n: number) =>
  new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10)

/** The week's last day inside the month: a column counts up to there. */
function lastDayOf(weekStart: string, period: string): string {
  const year = Number(period.slice(0, 4))
  const month = Number(period.slice(5))
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  const sunday = plusDays(weekStart, 6)
  return sunday < monthEnd ? sunday : monthEnd
}

const share = (value: number, top: number) => `${Math.min(value / top, 1) * 100}%`

const gapOf = ({ cumulative, expected }: KpiWeeklyPoint) =>
  cumulative === null || expected === null ? 0 : Math.max(expected - cumulative, 0)

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className={cn('rounded-xs', className)} />
      {label}
    </span>
  )
}

function Legend({ withTarget, withGap }: { withTarget: boolean; withGap: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Swatch className="bg-primary size-2" label="thực tế" />
      {withGap && <Swatch className={cn(NEUTRAL_MARK, 'size-2')} label="còn thiếu" />}
      {withTarget && <Swatch className="bg-foreground h-0.5 w-3" label="cần đạt" />}
    </span>
  )
}

function Column({
  point,
  def,
  period,
  top,
  current,
}: {
  point: KpiWeeklyPoint
  def: KpiMetricDef
  period: string
  top: number
  current: boolean
}) {
  const { cumulative, expected } = point
  const gap = gapOf(point)
  return (
    <li className="flex min-w-0 flex-col items-center gap-1">
      <span className="tnum font-num min-h-4 text-[12px] font-semibold leading-4">
        {cumulative === null ? (
          <span className="sr-only">Chưa tới tuần này</span>
        ) : (
          <>
            <span className="sr-only">Thực tế </span>
            {printTile(def.unit, cumulative)}
          </>
        )}
      </span>
      {/* A 1px card-colour seam between the two fills, and around the tick, keeps each readable where they meet. */}
      <span aria-hidden className="relative flex h-36 w-full max-w-10 flex-col justify-end">
        {gap > 0 && (
          <span
            className={cn(NEUTRAL_MARK, 'block rounded-t-sm', GROW_HEIGHT)}
            style={{ height: share(gap, top) }}
          />
        )}
        {cumulative !== null && (
          <span
            className={cn(
              'bg-primary block',
              gap > 0 ? 'shadow-[0_-1px_0_var(--card)]' : 'rounded-t-sm',
              GROW_HEIGHT,
            )}
            style={{ height: share(cumulative, top) }}
          />
        )}
        {expected !== null && (
          <span
            className="bg-foreground absolute -inset-x-1 h-0.5 rounded-sm shadow-[0_0_0_1px_var(--card)]"
            style={{ bottom: `min(${share(expected, top)}, calc(100% - 2px))` }}
          />
        )}
      </span>
      <span
        className={cn(
          'tnum font-num text-[12px] leading-4',
          current ? 'text-foreground font-semibold' : 'text-muted-foreground',
        )}
      >
        đến {dm(lastDayOf(point.weekStart, period))}
      </span>
      {expected !== null && (
        <span className={cn(NOTE, 'tnum font-num text-center')}>
          cần {printTile(def.unit, expected)}
        </span>
      )}
    </li>
  )
}

export function WeeklyChart({
  period,
  role,
  def,
  className,
}: {
  period: string
  role: RoleId
  def: KpiMetricDef
  className?: string
}) {
  const weekly = useQuery(kpiWeeklyQuery(period, role, def.key))
  const title = `${KPI_METRIC_LABEL[def.key]} lũy kế theo tuần`

  return (
    <QueryBlock query={weekly} what="số theo tuần">
      {({ points }) => {
        const figures = points.flatMap((p) => [p.cumulative ?? 0, p.expected ?? 0])
        const top = Math.max(1, ...figures)
        /* Started weeks are a prefix of the series, so this is the latest one. */
        const current = points.filter((p) => p.cumulative !== null).length - 1
        return (
          <GlassCard className={cn(TILE, className)}>
            <TileHead
              title={title}
              aside={
                points.length > 0 && (
                  <Legend
                    withTarget={points.some((p) => p.expected !== null)}
                    withGap={points.some((p) => gapOf(p) > 0)}
                  />
                )
              }
            />
            {points.length === 0 ? (
              <p className="text-[12.5px] leading-5">Tháng này chưa có số theo tuần.</p>
            ) : (
              /* Scrollable, so reachable by keyboard; the 4px side padding keeps the edge columns' tick inside the clip. */
              <div
                role="region"
                aria-label={title}
                tabIndex={0}
                className="focus-visible:outline-ring overflow-x-auto rounded-sm px-1 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <ol className="grid auto-cols-[minmax(56px,1fr)] grid-flow-col gap-2">
                  {points.map((point, i) => (
                    <Column
                      key={point.weekStart}
                      point={point}
                      def={def}
                      period={period}
                      top={top}
                      current={i === current}
                    />
                  ))}
                </ol>
              </div>
            )}
          </GlassCard>
        )
      }}
    </QueryBlock>
  )
}
