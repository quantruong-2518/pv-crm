import { GlassCard, cn, percent } from '@pv/ui'
import type { SalesPerformanceResponse } from '@pv/contracts'
import { foldExits, type FrozenExits } from '@/data/home-charts'
import { monthInPeriod, num, periodShort } from './home-model'
import { GROW_HEIGHT, NEUTRAL_MARK, NOTE, TILE, TileHead } from './home-tiles'

/** The chart tiles of row two: the months chart reads live period figures,
 *  the exits donut is still frozen scenario figures. */

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className={cn('rounded-xs size-2', className)} />
      {label}
    </span>
  )
}

/** One column per month of the quarter the period sits in: the leads that
 *  entered the book that month, split into those that have reached the
 *  opportunity book by now and the rest. The fills encode that split, so the
 *  picked period is told by the label's weight, never by dimming a column. */
export function MonthsTile({
  data,
  className,
}: {
  data: SalesPerformanceResponse
  className?: string
}) {
  const top = Math.max(1, ...data.months.map((m) => m.cohort.leads))

  return (
    <GlassCard className={cn(TILE, className)}>
      <TileHead
        title="Lead thành cơ hội theo tháng"
        aside={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <span>cả quý</span>
            <Swatch className="bg-primary" label="thành cơ hội" />
            <Swatch className={NEUTRAL_MARK} label="chưa" />
          </span>
        }
      />
      <div className="flex flex-1 gap-3">
        {data.months.map(({ key, cohort: m }) => (
          <div key={key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="tnum font-num text-[12px] font-semibold leading-4">
              {m.leads > 0 ? percent(m.opportunities / m.leads) : '—'}
            </span>
            {/* A 1px card-colour seam (a shadow, not a gap): the two fills are under 3:1 against each other. */}
            <div className="flex h-36 w-full max-w-10 flex-col justify-end">
              <span
                className={cn(NEUTRAL_MARK, 'rounded-t-sm', GROW_HEIGHT)}
                style={{ height: `${((m.leads - m.opportunities) / top) * 100}%` }}
              />
              <span
                className={cn('bg-primary shadow-[0_-1px_0_var(--card)]', GROW_HEIGHT)}
                style={{ height: `${(m.opportunities / top) * 100}%` }}
              />
            </div>
            <span className={cn(NOTE, 'tnum font-num')}>
              {num(m.opportunities)} / {num(m.leads)}
            </span>
            <span
              className={cn(
                'tnum font-num text-[12px] leading-4',
                monthInPeriod(key, data.period)
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground',
              )}
            >
              {periodShort(key)}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

/* Donut geometry, in viewBox units: the stroke's centre line sits at RADIUS. */
const BOX = 112
const RADIUS = 44
const STROKE = 16
const ROUND = 2 * Math.PI * RADIUS
/** Card-coloured space left between two slices, along the arc. */
const SLICE_GAP = 2

/* One hue in sequential steps, largest slice strongest: the token table has
   no categorical chart hues. The folded remainder takes the neutral mark. */
const RAMP = [
  { stroke: 'stroke-primary', fill: 'bg-primary' },
  { stroke: 'stroke-primary/80', fill: 'bg-primary/80' },
  { stroke: 'stroke-primary/60', fill: 'bg-primary/60' },
  { stroke: 'stroke-primary/40', fill: 'bg-primary/40' },
]
const REST = { stroke: 'stroke-muted-foreground', fill: NEUTRAL_MARK }

/** Why leads left the flow. The legend carries identity (label,
 *  count, share), so no slice is told apart by colour alone. Still the frozen
 *  scenario, on its own period: the head says so, the picker does not move it. */
export function ExitsTile({
  data,
  frozenDay,
  className,
}: {
  data: FrozenExits
  frozenDay: string
  className?: string
}) {
  const { total } = data
  const { slices, folded } = foldExits(data.exits, total)
  let run = 0
  const arcs = slices.map((s, i) => {
    const length = total > 0 ? (s.count / total) * ROUND : 0
    const arc = {
      ...s,
      tone: (s.key === 'rest' ? REST : RAMP[i]) ?? REST,
      dash: `${Math.max(length - SLICE_GAP, 0)} ${ROUND}`,
      offset: -run,
    }
    run += length
    return arc
  })

  return (
    <GlassCard className={cn(TILE, className)}>
      <TileHead
        title="Lý do lead rời luồng"
        aside={`${data.periodLabel} · tính tới ${frozenDay}`}
      />
      {arcs.length === 0 ? (
        <p className={NOTE}>Không lead nào rời luồng trong {data.periodLabel.toLowerCase()}.</p>
      ) : (
        /* Wraps on its own: the legend drops under the donut when the tile is
           too narrow for both, with no breakpoint to keep in step. */
        <div className="flex flex-1 flex-wrap items-center justify-center gap-4">
          <div className="size-26 relative shrink-0">
            <svg
              viewBox={`0 0 ${BOX} ${BOX}`}
              role="img"
              aria-label={`Lý do lead rời luồng: ${num(total)} lead`}
              className="size-full -rotate-90 fill-none"
            >
              {arcs.map((a, i) => (
                /* Keyed by position so an arc slides to its new length when
                   the rows change instead of being replaced. */
                <circle
                  key={i}
                  cx={BOX / 2}
                  cy={BOX / 2}
                  r={RADIUS}
                  strokeWidth={STROKE}
                  strokeDasharray={a.dash}
                  strokeDashoffset={a.offset}
                  className={cn(
                    a.tone.stroke,
                    'duration-(--motion-duration) ease-(--motion-ease) transition-[stroke-dasharray,stroke-dashoffset]',
                  )}
                >
                  <title>{`${a.label}: ${num(a.count)} trên ${num(total)} lead`}</title>
                </circle>
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="tnum font-num text-[20px] font-semibold leading-6">
                {num(total)}
              </span>
              <span className={NOTE}>lead</span>
            </div>
          </div>

          <div className="flex min-w-44 flex-1 flex-col gap-2">
            {arcs.map((a) => (
              <div key={a.key} className="flex min-w-0 items-center gap-2 text-[12.5px]">
                <span aria-hidden className={cn('rounded-xs size-2 shrink-0', a.tone.fill)} />
                <span className="min-w-0 flex-1 truncate" title={a.label}>
                  {a.label}
                </span>
                <span className="tnum font-num font-semibold">{num(a.count)}</span>
                <span className={cn(NOTE, 'tnum font-num w-10 text-right')}>
                  {percent(a.share)}
                </span>
              </div>
            ))}
            {folded.length > 0 && (
              <p className={cn(NOTE, 'tnum font-num')}>
                Còn lại: {folded.map((e) => `${e.label} ${num(e.count)}`).join(' · ')}
              </p>
            )}
          </div>
        </div>
      )}
    </GlassCard>
  )
}
