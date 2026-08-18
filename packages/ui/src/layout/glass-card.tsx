import type { HTMLAttributes } from 'react'
import { cn } from '../lib/cn'

/** F-03 · Surfaces.
 *  a → thẻ thường, KPI, brief card, panel chính
 *  b → bảng, danh sách dài, sidebar phải, popover (luật 8 · docs/luat-thiet-ke.md)
 *  Không có variant thứ ba: khối AI dùng <AiAction>, không dùng GlassCard. */
export type GlassCardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: 'a' | 'b'
  /** hover = bóng dày thêm một bậc (F-09) */
  hoverable?: boolean
}

export function GlassCard({ variant = 'a', hoverable, className, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg',
        variant === 'a' ? 'glass-a' : 'glass-b',
        hoverable && 'motion-std hover:shadow-panel',
        className,
      )}
      {...props}
    />
  )
}
