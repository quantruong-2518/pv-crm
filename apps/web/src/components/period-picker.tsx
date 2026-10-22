import { ChevronLeft, ChevronRight, Icon, cn, type IconGlyph } from '@pv/ui'
import {
  GRAINS,
  compareLabel,
  keyOf,
  periodLabel,
  progressOf,
  stepPick,
  type PeriodPick,
  type PeriodRead,
} from '@/data/period-pick'
import { GROW_WIDTH, SOFT_SHADOW } from './period-picker-style'

/** The overview's period frame — four grains and the ‹ period › stepper — and
 *  the line under the title that says how far the period has run. Moved here
 *  from `pages/home.tsx` so the workstream book shows the very same controls. */

const ROUND_ICON =
  'pointer-coarse:size-12 text-foreground hover:bg-surface-ink/8 flex size-9 items-center justify-center rounded-full disabled:opacity-50 disabled:hover:bg-transparent'

function StepButton({
  icon,
  label,
  target,
  onPick,
}: {
  icon: IconGlyph
  label: string
  target: PeriodPick | null
  onPick: (next: PeriodPick) => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={target === null}
      onClick={() => target && onPick(target)}
      className={cn(ROUND_ICON, 'focus-visible:outline-ring focus-visible:outline-2')}
    >
      <Icon icon={icon} size={16} />
    </button>
  )
}

export function PeriodPicker({
  pick,
  onPick,
}: {
  pick: PeriodPick
  onPick: (next: PeriodPick) => void
}) {
  return (
    <div
      role="group"
      aria-label="Chọn kỳ"
      className={cn('bg-card/80 flex flex-wrap items-center gap-1 rounded-full p-1', SOFT_SHADOW)}
    >
      {GRAINS.map((g) => {
        const on = g.value === pick.grain
        return (
          <button
            key={g.value}
            type="button"
            aria-pressed={on}
            onClick={() => onPick({ ...pick, grain: g.value })}
            className={cn(
              'pointer-coarse:h-12 h-9 min-w-[60px] rounded-full px-3 text-[13px] font-semibold',
              'duration-(--motion-duration) ease-(--motion-ease) transition-[background-color,color] motion-reduce:transition-none',
              'focus-visible:outline-ring focus-visible:outline-2',
              on
                ? 'bg-primary-strong text-primary-foreground shadow-primary'
                : 'text-muted-foreground hover:bg-surface-ink/8',
            )}
          >
            {g.label}
          </button>
        )
      })}
      <span aria-hidden className="bg-surface-ink/12 mx-1 block h-5 w-px" />
      <StepButton icon={ChevronLeft} label="Kỳ trước" target={stepPick(pick, -1)} onPick={onPick} />
      <span
        aria-live="polite"
        className="tnum min-w-28 text-center text-[13px] font-semibold leading-5"
      >
        {periodLabel(keyOf(pick))}
      </span>
      <StepButton icon={ChevronRight} label="Kỳ sau" target={stepPick(pick, 1)} onPick={onPick} />
    </div>
  )
}

/** Names the data's own period, not the picker's, so a kept placeholder stays
 *  truthful. A finished period has no days left to count, so it gets no bar. */
export function PeriodProgress({ data }: { data: PeriodRead }) {
  const { ran, total } = progressOf(data)
  const compare = compareLabel(data)
  if (ran === total) {
    return (
      <span className="tnum font-num">{compare.charAt(0).toUpperCase() + compare.slice(1)}</span>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-3">
      <span
        aria-hidden
        className="bg-surface-ink/8 block h-1.5 w-[120px] overflow-hidden rounded-full"
      >
        <span
          className={cn(
            'block h-full rounded-full bg-[linear-gradient(90deg,var(--channel-meeting),var(--primary))]',
            GROW_WIDTH,
          )}
          style={{ width: `${(ran / total) * 100}%` }}
        />
      </span>
      <span className="tnum font-num">
        Đã qua {ran}/{total} ngày · {compare}
      </span>
    </span>
  )
}
