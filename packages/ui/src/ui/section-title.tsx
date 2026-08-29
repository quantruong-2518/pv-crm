import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { Kicker } from './separator'
import { cn } from '../lib/cn'

/** A-14 · SectionTitle — tiêu đề của một khối nội dung, ba cỡ.
 *
 *  Màn dài (form tạo sự kiện, chi tiết dàn ngang) cần mắt nhảy được giữa các
 *  section mà không phải đọc. Chữ Archivo (`font-display`) 18px là mốc đó;
 *  `md` cho khối con, `sm` cho tiêu đề trong thẻ.
 *
 *  Kicker mono ở trên và câu `hint` ở dưới là hai chỗ chứa phần giải thích —
 *  nhờ vậy tiêu đề giữ được ngắn thay vì nuốt luôn cả lời dẫn. */
const sectionTitleVariants = cva('m-0', {
  variants: {
    size: {
      lg: 'font-display text-[18px] font-semibold tracking-[-.2px]',
      detail: 'font-display text-[16px] font-semibold tracking-[-.1px]',
      md: 'font-display text-[14px] font-semibold',
      sm: 'text-[12.5px] font-semibold',
    },
  },
  defaultVariants: { size: 'md' },
})

export type SectionTitleProps = {
  children: ReactNode
  /** nhãn mono nhỏ phía trên */
  kicker?: string
  /** câu giải thích dưới tiêu đề */
  hint?: ReactNode
  /** nút bên phải cùng hàng */
  actions?: ReactNode
  /** lg = 18px · detail = 16px (khối chính màn chi tiết) · md = 14px · sm = 12.5px */
  size?: 'lg' | 'detail' | 'md' | 'sm'
  className?: string
}

export function SectionTitle({
  children,
  kicker,
  hint,
  actions,
  size,
  className,
}: SectionTitleProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {kicker && <Kicker className="mb-2">{kicker}</Kicker>}
        <h2 className={cn(sectionTitleVariants({ size }))}>{children}</h2>
        {hint && (
          <p className="text-muted-foreground m-0 mt-1 text-[11.5px] leading-[1.7]">{hint}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export { sectionTitleVariants }
