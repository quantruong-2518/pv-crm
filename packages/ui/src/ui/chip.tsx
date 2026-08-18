import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'

/** A-03 · Chip — mã object dạng mono.
 *  `source` = chip nguồn hệ thống, dùng bg-accent, bấm được, mở object. */
const chipVariants = cva(
  'motion-std inline-flex items-center whitespace-nowrap rounded-sm px-[10px] py-1 font-mono text-[11px]',
  {
    variants: {
      variant: {
        object: 'bg-white/9 text-glass-foreground',
        source: 'bg-primary/24 text-accent-foreground',
      },
      interactive: {
        true: 'hover:bg-white/16 cursor-pointer',
        false: '',
      },
    },
    compoundVariants: [{ variant: 'source', interactive: true, className: 'hover:bg-primary/32' }],
    defaultVariants: { variant: 'object', interactive: false },
  },
)

export type ChipProps = Omit<React.HTMLAttributes<HTMLElement>, 'onClick'> &
  Omit<VariantProps<typeof chipVariants>, 'interactive'> & {
    /** Chip mở object — ContextRail luôn truyền hàm này (luật 10 · docs/luat-thiet-ke.md) */
    onOpen?: () => void
  }

export function Chip({ className, variant, onOpen, children, ...props }: ChipProps) {
  const interactive = Boolean(onOpen)
  const classes = cn(chipVariants({ variant, interactive }), className)

  if (interactive) {
    return (
      <button type="button" onClick={onOpen} className={classes} {...props}>
        {children}
      </button>
    )
  }
  return (
    <span className={classes} {...props}>
      {children}
    </span>
  )
}

export { chipVariants }
