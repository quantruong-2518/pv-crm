import { cn } from '@pv/ui'
import { GROW_WIDTH } from '@/components/period-picker-style'

/** One track with a fill and up to two ticks, the way `PaceBar` draws it, so a
 *  gauge, a score line and a stage rate read as the same thing. Drawn for the eye
 *  only: the figure beside it carries the words, so it is `aria-hidden`.
 *  A tick keeps a card-coloured edge, so it still reads over the fill. */

export type Tick = { at: number; tone: 'ink' | 'soft' }

const TICK_TONE = { ink: 'bg-foreground', soft: 'bg-muted-foreground' } as const

export function Track({
  fill,
  ticks = [],
  fillClass = 'bg-primary',
  tall = false,
}: {
  /** 0..1 */
  fill: number
  ticks?: readonly Tick[]
  fillClass?: string
  tall?: boolean
}) {
  return (
    <span
      aria-hidden
      className={cn('bg-surface-ink/10 relative block rounded-sm', tall ? 'h-3' : 'h-2')}
    >
      <span
        className={cn('block h-full rounded-sm', fillClass, GROW_WIDTH)}
        style={{ width: `${fill * 100}%` }}
      />
      {ticks.map((tick, i) => (
        <span
          key={i}
          className={cn(
            'absolute -top-1 h-4 w-0.5 rounded-sm shadow-[0_0_0_1px_var(--card)]',
            TICK_TONE[tick.tone],
          )}
          style={{ left: `min(${tick.at * 100}%, calc(100% - 2px))` }}
        />
      ))}
    </span>
  )
}
