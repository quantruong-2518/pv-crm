import { cn } from '@pv/ui'
import { GROW_WIDTH } from '@/components/period-picker-style'

/** The two bars the desk screens draw: one fill with an optional tick, and a
 *  stack of segments. Both are `aria-hidden`: the figure, its target and its
 *  verdict are printed beside them, so the bar adds sight and no information. */

const clamp = (share: number) => Math.min(Math.max(share, 0), 1)

const HEIGHT = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' } as const
type Size = keyof typeof HEIGHT

/** A fill of `fill` (0..1) with a tick at `mark`. The tick carries a card-coloured
 *  edge so it still reads where the fill has passed under it. */
export function Meter({
  fill,
  mark = null,
  tone = 'bg-primary',
  size = 'md',
  className,
}: {
  fill: number
  mark?: number | null
  /** A background class: the verdict's fill, or a quiet one for a reference bar. */
  tone?: string
  size?: Size
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn('bg-surface-ink/10 relative block rounded-sm', HEIGHT[size], className)}
    >
      <span
        className={cn('block h-full rounded-sm', tone, GROW_WIDTH)}
        style={{ width: `${clamp(fill) * 100}%` }}
      />
      {mark !== null && (
        <span
          className="bg-foreground absolute -inset-y-1 w-0.5 rounded-sm shadow-[0_0_0_1px_var(--card)]"
          style={{ left: `min(${clamp(mark) * 100}%, calc(100% - 2px))` }}
        />
      )}
    </span>
  )
}

export type Segment = { share: number; tone: string }

/** Segments side by side over a track; shares past 1 in total are cut at the edge. */
export function StackBar({
  segments,
  size = 'lg',
  className,
}: {
  segments: readonly Segment[]
  size?: Size
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn('bg-surface-ink/10 flex overflow-hidden rounded-sm', HEIGHT[size], className)}
    >
      {segments.map((s, i) => (
        <span
          key={i}
          className={cn('block h-full shadow-[inset_-1px_0_0_var(--card)]', s.tone, GROW_WIDTH)}
          style={{ width: `${clamp(s.share) * 100}%` }}
        />
      ))}
    </span>
  )
}

/** A swatch for a legend: the same class as the segment it names. */
export function Swatch({ tone }: { tone: string }) {
  return <span aria-hidden className={cn('inline-block size-3 shrink-0 rounded-sm', tone)} />
}
