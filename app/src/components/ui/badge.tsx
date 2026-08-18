import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

/** A-02 · Badge — 7 trạng thái.
 *  text-xs font-semibold px-3 py-1 rounded-sm bg-{state}/20 */
const badgeVariants = cva(
  'inline-flex items-center rounded-sm px-[11px] py-1 text-[11px] font-semibold whitespace-nowrap',
  {
    variants: {
      tone: {
        /** Nháp — Slate Gray chỉ làm nền, chữ lấy --glass-foreground (luật 2) */
        draft: 'bg-brand-slate/28 text-glass-foreground',
        warning: 'bg-warning/20 text-warning',
        success: 'bg-success/20 text-success',
        running: 'bg-primary/24 text-accent-foreground',
        danger: 'bg-destructive/24 text-destructive-foreground',
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
