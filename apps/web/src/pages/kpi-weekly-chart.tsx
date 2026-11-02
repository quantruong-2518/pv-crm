import { useQuery } from '@tanstack/react-query'
import { GlassCard, cn } from '@pv/ui'
import { type KpiMetricDef, type KpiWeeklyPoint, type RoleId } from '@pv/contracts'
import { kpiWeeklyQuery } from '@/data/kpi-personal'
import { dm } from '@/lib/date'
import { GROW_HEIGHT, NEUTRAL_MARK, NOTE, TILE, TileHead } from './home-tiles'
import { printTile } from './kpi-model'
import { QueryBlock } from './kpi-parts'
import { kpiMetricText } from '@/data/kpi-i18n'
import { message, useI18n } from '@/app/i18n'

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

/* A total can fall below zero once a closed month's record is taken back (ADR 0115):
   the column then draws empty, its printed figure says the rest. */
const share = (value: number, top: number) => `${Math.min(Math.max(value / top, 0), 1) * 100}%`

const gapOf = ({ cumulative, expected }: KpiWeeklyPoint) =>
  cumulative === null || expected === null ? 0 : Math.max(expected - Math.max(cumulative, 0), 0)

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className={cn('rounded-xs', className)} />
      {label}
    </span>
  )
}

function Legend({ withTarget, withGap }: { withTarget: boolean; withGap: boolean }) {
  const { t } = useI18n()
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Swatch className="bg-primary size-2" label={t(message('thực tế', 'actual', '실적'))} />
      {withGap && (
        <Swatch
          className={cn(NEUTRAL_MARK, 'size-2')}
          label={t(message('còn thiếu', 'remaining', '남은 목표'))}
        />
      )}
      {withTarget && (
        <Swatch
          className="bg-foreground h-0.5 w-3"
          label={t(message('cần đạt', 'target pace', '목표 페이스'))}
        />
      )}
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
  const { t } = useI18n()
  const { cumulative, expected } = point
  const gap = gapOf(point)
  return (
    <li className="flex min-w-0 flex-col items-center gap-1">
      <span className="tnum font-num min-h-4 text-[12px] font-semibold leading-4">
        {cumulative === null ? (
          <span className="sr-only">
            {t(
              message(
                'Chưa tới tuần này',
                'This week has not started',
                '이번 주는 아직 시작되지 않았습니다',
              ),
            )}
          </span>
        ) : (
          <>
            <span className="sr-only">{t(message('Thực tế ', 'Actual ', '실적 '))}</span>
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
        {t(
          message(
            `đến ${dm(lastDayOf(point.weekStart, period))}`,
            `through ${dm(lastDayOf(point.weekStart, period))}`,
            `${dm(lastDayOf(point.weekStart, period))}까지`,
          ),
        )}
      </span>
      {expected !== null && (
        <span className={cn(NOTE, 'tnum font-num text-center')}>
          {t(
            message(
              `cần ${printTile(def.unit, expected)}`,
              `target ${printTile(def.unit, expected)}`,
              `목표 ${printTile(def.unit, expected)}`,
            ),
          )}
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
  const { t } = useI18n()
  const weekly = useQuery(kpiWeeklyQuery(period, role, def.key))
  const title = t(
    message(
      `${kpiMetricText(def.key)} lũy kế theo tuần`,
      `${kpiMetricText(def.key)} cumulative by week`,
      `주별 누적 ${kpiMetricText(def.key)}`,
    ),
  )

  return (
    <QueryBlock query={weekly} what={t(message('số theo tuần', 'weekly figures', '주간 수치'))}>
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
              <p className="text-[12.5px] leading-5">
                {t(
                  message(
                    'Tháng này chưa có số theo tuần.',
                    'No weekly figures for this month yet.',
                    '이번 달 주간 수치가 없습니다.',
                  ),
                )}
              </p>
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
