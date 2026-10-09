import { GlassCard, cn, millions, percent } from '@pv/ui'
import type { SalesPerformanceResponse, WorkstreamScorecard } from '@pv/contracts'
import { foldExits, type HomeSnapshot, type SourceLine, type StageLine } from '@/data/home-charts'
import type { Performance } from '@/data/performance'
import { monthInPeriod, num, periodShort } from './home-model'
import { GROW_HEIGHT, GROW_WIDTH, NEUTRAL_MARK, NOTE, TILE, TileHead } from './home-tiles'

/** The chart tiles of row two: the months chart reads live period figures,
 *  the exits donut is still frozen scenario figures. Plus two frozen tiles
 *  that are built but currently not shown (sources, days in stage).
 *
 *  The stage rows are drawn locally because `BarChart`'s horizontal rows take
 *  no `onSelect` and no limit tick. Their bars are frozen; what a row opens,
 *  and whether it can be pressed at all, comes from the live rung. */

type LiveStage = WorkstreamScorecard['stages'][number]

const TRACK = 'bg-surface-ink/10'

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

function SourceRow({ row }: { row: SourceLine }) {
  const share = row.leads > 0 ? row.opportunities / row.leads : null

  return (
    <div className="flex items-center gap-3">
      <span className="flex w-28 shrink-0 flex-col">
        <span className="truncate text-[12.5px]" title={row.label}>
          {row.label}
        </span>
        <span className={cn(NOTE, 'tnum font-num')}>
          {num(row.opportunities)} / {num(row.leads)} lead
        </span>
      </span>
      <span className={cn(TRACK, 'h-2 min-w-0 flex-1 overflow-hidden rounded-sm')}>
        <span
          className={cn('bg-primary block h-full rounded-sm', GROW_WIDTH)}
          style={{ width: `${(share ?? 0) * 100}%` }}
        />
      </span>
      <span className="tnum font-num w-10 text-right text-[12.5px] font-semibold">
        {share === null ? '—' : percent(share)}
      </span>
      <span className={cn(NOTE, 'tnum font-num w-16 text-right')}>
        {row.costPerOpportunity === null ? '—' : millions(row.costPerOpportunity)}
      </span>
    </div>
  )
}

/* Hidden on the owner's request, 09/10: exported, not rendered by `home.tsx`. */
export function SourcesTile({
  snapshot,
  className,
}: {
  snapshot: HomeSnapshot
  className?: string
}) {
  return (
    <GlassCard className={cn(TILE, className)}>
      <TileHead title="Hiệu quả theo nguồn" aside="cả kỳ · % thành cơ hội · chi phí / cơ hội" />
      <div className="flex flex-1 flex-col justify-between gap-2">
        {snapshot.sources.map((row) => (
          <SourceRow key={row.key} row={row} />
        ))}
      </div>
    </GlassCard>
  )
}

const STAGE_ROW = 'pointer-coarse:min-h-12 flex min-h-8 w-full items-center gap-3 rounded-md px-2'

function StageRow({
  row,
  scale,
  live,
  active,
  onPick,
}: {
  row: StageLine
  scale: number
  /** The live rung with this key, when the reader may read the book. */
  live: LiveStage | undefined
  active: boolean
  onPick: (stage: LiveStage) => void
}) {
  const over = row.meanDays !== null && row.meanDays > row.limitDays
  const body = (
    <>
      <span className={cn('w-28 shrink-0 truncate text-[12.5px]', active && 'font-semibold')}>
        {row.label}
      </span>
      <span className="relative flex h-4 min-w-0 flex-1 items-center">
        <span className={cn(TRACK, 'block h-2 w-full rounded-sm')} />
        <span
          className={cn(
            'absolute left-0 h-2 rounded-sm',
            GROW_WIDTH,
            over ? 'bg-warning' : 'bg-primary',
          )}
          style={{ width: `${((row.meanDays ?? 0) / scale) * 100}%` }}
        />
        {/* The halo keeps the tick readable over a bar (16:1 against the card
            in both themes, against 1.6:1 on the warning fill); `min` keeps a
            limit that IS the scale's end inside the track. */}
        <span
          aria-hidden
          className="bg-foreground rounded-xs absolute top-0 h-4 w-0.5 shadow-[0_0_0_1px_var(--card)]"
          style={{ left: `min(${(row.limitDays / scale) * 100}%, calc(100% - 2px))` }}
        />
      </span>
      <span className="tnum font-num w-16 shrink-0 whitespace-nowrap text-right text-[12.5px]">
        <b className={cn('font-semibold', over && 'text-warning')}>
          {row.meanDays === null ? '—' : num(row.meanDays)}
        </b>
        <span className="text-muted-foreground"> / {num(row.limitDays)}</span>
      </span>
    </>
  )

  /* An active row stays pressable at count 0, or its filter could not be cleared. */
  if (live === undefined || (live.count === 0 && !active)) {
    return <div className={STAGE_ROW}>{body}</div>
  }
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onPick(live)}
      title={`${live.label}: ${num(live.count)} hành trình đang chạy`}
      className={cn(
        STAGE_ROW,
        'motion-std cursor-pointer text-left',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
        active ? 'shadow-[0_0_0_2px_var(--ring)]' : 'hover:bg-surface-ink/8',
      )}
    >
      {body}
    </button>
  )
}

/* Hidden on the owner's request, 09/10: exported, not rendered by `home.tsx`. */
/** Mean days the open opportunities have stood in each stage, against that
 *  stage's limit: a frozen snapshot. A row filters the list only through the
 *  live rung of the same key. */
export function StagesTile({
  snapshot,
  frozenDay,
  liveStages,
  activeKey,
  onPick,
  className,
}: {
  snapshot: HomeSnapshot
  frozenDay: string
  /** Undefined without `workstream.view` or before the scorecard answers:
   *  every row is then plain, not pressable. */
  liveStages: LiveStage[] | undefined
  activeKey: string | undefined
  /** The active row again means "clear". */
  onPick: (stage: LiveStage) => void
  className?: string
}) {
  /* One scale for bar and tick, with the longest of either at the far end. */
  const scale = Math.max(1, ...snapshot.stages.flatMap((s) => [s.meanDays ?? 0, s.limitDays]))

  return (
    <GlassCard className={cn(TILE, className)}>
      <TileHead
        title="Số ngày ở giai đoạn / hạn"
        aside={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="bg-foreground rounded-xs h-3 w-0.5" />
              hạn
            </span>
            <span>số chụp tại {frozenDay}</span>
          </span>
        }
      />
      <div className="-mx-2 flex flex-1 flex-col justify-between gap-1">
        {snapshot.stages.map((row) => (
          <StageRow
            key={row.key}
            row={row}
            scale={scale}
            live={liveStages?.find((s) => s.kind === 'OP' && s.key === row.key)}
            active={row.key === activeKey}
            onPick={onPick}
          />
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
  data: Performance
  frozenDay: string
  className?: string
}) {
  const total = data.exitedTotal
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
        aside={`${data.period.label} · tính tới ${frozenDay}`}
      />
      {arcs.length === 0 ? (
        <p className={NOTE}>Không lead nào rời luồng trong {data.period.label.toLowerCase()}.</p>
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
