import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from '../icons'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-20 · Accordion — one titled row that opens the detail beneath it.
 *  Paints no surface of its own: the caller's card is the ground (law 12). */
export type AccordionProps = {
  title: string
  /** The one-line answer a closed row still gives: a count, a range. */
  summary?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

export function Accordion({
  title,
  summary,
  defaultOpen = false,
  children,
  className,
}: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panel = useId()

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panel : undefined}
        onClick={() => setOpen((was) => !was)}
        className="motion-std hover:bg-surface-ink/8 -mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 text-left outline-none focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]"
      >
        <span className="text-foreground text-[13px] font-semibold">{title}</span>
        {summary && (
          <span className="text-muted-foreground tnum min-w-0 flex-1 truncate text-[12.5px]">
            {summary}
          </span>
        )}
        <Icon
          icon={ChevronDown}
          size={16}
          className={cn('motion-std text-muted-foreground ml-auto shrink-0', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div id={panel} className="pb-3">
          {children}
        </div>
      )}
    </div>
  )
}
