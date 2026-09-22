import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'

/** A-02 · Badge — 7 trạng thái.
 *  text-xs font-semibold px-3 py-1 rounded-sm bg-{state}/20 */
const badgeVariants = cva(
  'inline-flex items-center whitespace-nowrap rounded-sm px-[11px] py-1 text-[11px] font-semibold',
  {
    variants: {
      tone: {
        /** Slate Gray is the tint only (law 2). The text is `--muted-foreground`,
         *  not `--glass-foreground`: over a 28% tint that older pairing measured
         *  4.41:1 on Aurora and 3.81:1 on the light theme, both under law 13. */
        draft: 'bg-brand-slate/28 text-muted-foreground',
        warning: 'bg-warning/20 text-on-tint-warning',
        success: 'bg-success/20 text-on-tint-success',
        running: 'bg-primary/24 text-accent-foreground',
        danger: 'bg-destructive/20 text-on-tint-destructive',
      },
    },
    defaultVariants: { tone: 'draft' },
  },
)

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

export { badgeVariants }
