import { GlassCard, cn } from '@pv/ui'
import {
  WORKSTREAM_JOURNEY_STEPS,
  type WorkstreamScorecard,
  type WorkstreamStandKind,
} from '@pv/contracts'

/** Open runs split by the journey step they stand on, as a donut with a legend
 *  that filters the book. A slice is a step and not a rung: three slices stay
 *  readable, and the server's `standKind` filter opens exactly those rows.
 *
 *  Counts come from the scorecard's rungs, summed per kind: the server owns the
 *  ladder, so a renamed rung never reaches this file. One hue at three
 *  strengths (law 15); the active legend row is marked by ring and weight. */

type Rungs = WorkstreamScorecard['stages']

const STEP_OF_KIND: Record<WorkstreamStandKind, (typeof WORKSTREAM_JOURNEY_STEPS)[number]['key']> =
  { LD: 'lead', OP: 'opportunity', HĐ: 'contract' }

const stepTitle = (kind: WorkstreamStandKind) =>
  WORKSTREAM_JOURNEY_STEPS.find((s) => s.key === STEP_OF_KIND[kind])?.label ?? kind

const KINDS: WorkstreamStandKind[] = ['LD', 'OP', 'HĐ']
const ARC: Record<WorkstreamStandKind, { stroke: string; dot: string }> = {
  LD: { stroke: 'stroke-primary', dot: 'bg-primary' },
  OP: { stroke: 'stroke-primary/60', dot: 'bg-primary/60' },
  HĐ: { stroke: 'stroke-primary/30', dot: 'bg-primary/30' },
}

/* Circumference of the r = 30 circle in an 80-unit box. */
const RING = 2 * Math.PI * 30
const FOCUS = 'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2'

export function WorkstreamStageChart({
  stages,
  active,
  onPick,
}: {
  /** Undefined until the scorecard arrives: dashes, nothing clicks. */
  stages: Rungs | undefined
  active: WorkstreamStandKind | undefined
  /** The active kind again means "clear". */
  onPick: (kind: WorkstreamStandKind | undefined) => void
}) {
  const counts = KINDS.map((kind) => ({
    kind,
    count: (stages ?? []).filter((s) => s.kind === kind).reduce((n, s) => n + s.count, 0),
  }))
  const total = counts.reduce((n, c) => n + c.count, 0)
  let used = 0

  return (
    <GlassCard
      role="group"
      aria-label="Hành trình đang chạy theo giai đoạn"
      className="flex h-full items-center gap-4 px-4 py-3"
    >
      <div className="size-26 relative shrink-0">
        <svg viewBox="0 0 80 80" className="size-full" aria-hidden>
          <circle
            cx={40}
            cy={40}
            r={30}
            fill="none"
            strokeWidth={8}
            className="stroke-surface-ink/10"
          />
          {total > 0 &&
            counts.map(({ kind, count }) => {
              const length = (count / total) * RING
              const drawn = count === 0 ? 0 : Math.max(0.6, length - 1.6)
              const circle = (
                <circle
                  key={kind}
                  cx={40}
                  cy={40}
                  r={30}
                  fill="none"
                  strokeWidth={8}
                  strokeDasharray={`${drawn} ${RING - drawn}`}
                  strokeDashoffset={-used}
                  transform="rotate(-90 40 40)"
                  className={cn(ARC[kind].stroke, active && active !== kind && 'opacity-40')}
                />
              )
              used += length
              return circle
            })}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum font-num text-[24px] font-semibold leading-7">
            {stages ? total : '—'}
          </span>
          <span className="text-muted-foreground text-[11px] leading-4">đang chạy</span>
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {counts.map(({ kind, count }) => {
          const on = active === kind
          const live = on || count > 0
          return (
            <button
              key={kind}
              type="button"
              disabled={!live || stages === undefined}
              aria-pressed={on}
              onClick={() => onPick(on ? undefined : kind)}
              className={cn(
                'motion-std pointer-coarse:min-h-12 flex items-center gap-2 rounded-md px-2 py-1 text-left',
                FOCUS,
                on && 'shadow-[0_0_0_2px_var(--ring)]',
                live && !on && 'hover:bg-surface-ink/8 cursor-pointer',
              )}
            >
              <span aria-hidden className={cn('size-2 shrink-0 rounded-full', ARC[kind].dot)} />
              <span className="tnum font-num w-6 shrink-0 text-[16px] font-semibold">
                {stages ? count : '—'}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[14px] leading-5',
                  on ? 'font-bold' : count === 0 && 'text-muted-foreground',
                )}
              >
                {stepTitle(kind)}
              </span>
            </button>
          )
        })}
      </div>
    </GlassCard>
  )
}
