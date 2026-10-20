import type { ReactNode } from 'react'
import { Icon, cn, type IconGlyph } from '@pv/ui'

/** One option of a radio group drawn as a card (text, an optional icon and
 *  hint line) or as a chip (text only). A real `<input type="radio">` under
 *  the paint, so arrow keys move inside the group and a screen reader counts it.
 *
 *  Shared by the comm record, the meeting close-out and the mobile log; `@pv/ui`
 *  has no radio group yet. Selected = brand-soft ground, brand ink and an inset
 *  ring (a shadow, law 4); focus is a dashed outline so it never reads as the
 *  selection. 48px under a coarse pointer (law 13). */
export function RadioCard({
  name,
  checked,
  onSelect,
  children,
  hint,
  icon,
  shape = 'card',
  className,
}: {
  name: string
  checked: boolean
  onSelect: () => void
  children: ReactNode
  hint?: ReactNode
  /** Before the text, on a card only. */
  icon?: IconGlyph
  shape?: 'card' | 'chip'
  className?: string
}) {
  const card = shape === 'card'
  return (
    <label
      className={cn(
        'motion-std pointer-coarse:min-h-12 flex min-w-0 cursor-pointer items-center gap-3 rounded-md text-[13px] leading-[1.5]',
        'has-[:focus-visible]:outline-foreground has-[:focus-visible]:outline-dashed has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
        card ? 'min-h-12 px-3 py-2' : 'h-10 px-3',
        checked
          ? 'bg-accent text-accent-foreground ring-ring font-semibold ring-2 ring-inset'
          : 'bg-surface-ink/9 text-foreground hover:bg-surface-ink/16 font-medium',
        className,
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      {card && icon && <Icon icon={icon} size={16} className="shrink-0" />}
      <span className="flex min-w-0 flex-col">
        <span className="break-words">{children}</span>
        {hint && (
          <span
            className={cn(
              'tnum text-[12px] font-normal',
              checked ? 'text-accent-foreground' : 'text-muted-foreground',
            )}
          >
            {hint}
          </span>
        )}
      </span>
    </label>
  )
}
