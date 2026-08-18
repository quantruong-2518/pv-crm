import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

/** A-09 · Separator — h-px bg-white/8. `fade` là bản vuốt sáng → mờ. */
export function Separator({ fade = false, className }: { fade?: boolean; className?: string }) {
  return (
    <div
      role="separator"
      className={cn(
        'h-px',
        fade
          ? 'bg-[linear-gradient(90deg,rgb(255_255_255/.18),rgb(255_255_255/.02))]'
          : 'bg-white/8',
        className,
      )}
    />
  )
}

/** A-09 · Kicker — font-mono text-[10.5px] tracking-[.2em] uppercase.
 *  `accent` cho nhãn nhóm, `muted` cho nhãn ngày. */
export function Kicker({
  tone = 'accent',
  className,
  children,
}: {
  tone?: 'accent' | 'muted'
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'font-mono text-[10.5px] uppercase',
        tone === 'accent'
          ? 'text-accent-foreground font-semibold tracking-[.2em]'
          : 'text-muted-foreground tracking-[.13em]',
        className,
      )}
    >
      {children}
    </div>
  )
}
