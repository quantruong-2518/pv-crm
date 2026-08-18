import type { HTMLAttributes } from 'react'
import { cn } from '../lib/cn'

/** F-03 · Surfaces.
 *  a → thẻ thường, KPI, brief card, panel chính
 *  b → bảng, danh sách dài, sidebar phải, popover (luật 8 · docs/luat-thiet-ke.md)
 *  Không có variant thứ ba: khối AI dùng <AiAction>, không dùng GlassCard. */
export type GlassCardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: 'a' | 'b'
}

/** Không có trạng thái hover. Thẻ là mặt phẳng chứa nội dung, không phải nút —
 *  bóng dày lên khi rê chuột chẳng nói thêm được gì, mà mỗi lần đổi bóng là một
 *  lần mặt kính phải tính lại backdrop-blur. Chuyển động (F-09) để dành cho thứ
 *  bấm được: nút, hàng bảng, chip, nav. */
export function GlassCard({ variant = 'a', className, ...props }: GlassCardProps) {
  return (
    <div
      className={cn('rounded-lg', variant === 'a' ? 'glass-a' : 'glass-b', className)}
      {...props}
    />
  )
}
