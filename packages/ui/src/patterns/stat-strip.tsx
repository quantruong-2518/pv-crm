import type { ReactNode } from 'react'
import type { IconGlyph } from '../icons'
import { GlassCard } from '../layout/glass-card'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-17 · StatStrip — a screen's headline numbers as ONE block of equal cells.
 *
 *  Separate StatCards let each number settle its own height, so a row of four
 *  drifts apart the moment one context line wraps. One surface with no dividers
 *  keeps the row reading as one statement about the book. The watermark icon is
 *  the one compact StatCard already carries, kept so a cell is known before it
 *  is read. */

export type StatStripItem = {
  label: string
  /** Already formatted: "100", "16%", "—". */
  value: string
  /** Printed smaller right after the value — a denominator or unit, "/ 100". */
  suffix?: string
  /** One line under the value. A node so a screen can tint part of it. */
  context?: ReactNode
  /** `warning` when the number itself is the alarm — tints value and context. */
  tone?: 'default' | 'warning'
  icon?: IconGlyph
}

export type StatStripProps = {
  items: StatStripItem[]
  /** Accessible name of the whole block. */
  label: string
  className?: string
}

export function StatStrip({ items, label, className }: StatStripProps) {
  return (
    <GlassCard
      role="group"
      aria-label={label}
      className={cn('flex flex-wrap overflow-hidden', className)}
    >
      {items.map((item) => {
        const warn = item.tone === 'warning'
        return (
          <div
            key={item.label}
            className={cn(
              'relative isolate flex min-w-0 basis-1/2 flex-col gap-2 px-5 py-4 lg:flex-1 lg:basis-0',
            )}
          >
            {item.icon && (
              <Icon
                icon={item.icon}
                size={64}
                className="text-muted-foreground pointer-events-none absolute -bottom-3 -right-2 -z-10 opacity-10"
              />
            )}
            <span className="text-muted-foreground truncate text-[12px] font-medium">
              {item.label}
            </span>
            <span className="flex min-w-0 items-baseline gap-1">
              <span
                className={cn(
                  'tnum font-num text-[30px] font-semibold leading-none tracking-[-1px]',
                  warn && 'text-warning',
                )}
              >
                {item.value}
              </span>
              {item.suffix && (
                <span className="text-muted-foreground tnum font-num text-[13px]">
                  {item.suffix}
                </span>
              )}
            </span>
            {item.context && (
              <span
                className={cn(
                  'truncate text-[11.5px] leading-[1.5]',
                  warn ? 'text-warning' : 'text-muted-foreground',
                  /* Keep text clear of the watermark, which would cut its contrast. */
                  item.icon && 'pr-12',
                )}
              >
                {item.context}
              </span>
            )}
          </div>
        )
      })}
    </GlassCard>
  )
}
