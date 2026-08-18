import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'

/** A-06 · StatusDot — size-2 rounded-full.
 *  `current` thêm ring-4 ring-primary/24. Đây là một trong hai chỗ duy nhất
 *  được dùng rounded-full (luật 5 · CLAUDE.md), chỗ kia là FAB Trợ lý AI. */
const statusDotVariants = cva('inline-block size-2 shrink-0 rounded-full', {
  variants: {
    state: {
      ok: 'bg-success',
      current: 'bg-primary shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_24%,transparent)]',
      next: 'bg-white/24',
      bad: 'bg-destructive-foreground',
      warning: 'bg-warning',
    },
  },
  defaultVariants: { state: 'next' },
})

export type StatusDotState = NonNullable<VariantProps<typeof statusDotVariants>['state']>

export type StatusDotProps = VariantProps<typeof statusDotVariants> & {
  /** Nhãn cho trình đọc màn hình — chấm màu một mình không nói được gì */
  label?: string
  className?: string
}

export function StatusDot({ state, label, className }: StatusDotProps) {
  return (
    <span
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      className={cn(statusDotVariants({ state }), className)}
    />
  )
}

export { statusDotVariants }
