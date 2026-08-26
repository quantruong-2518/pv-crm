import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { Kicker } from './separator'
import { cn } from '../lib/cn'

/** A-14 · SectionTitle — tiêu đề của một khối nội dung, ba cỡ.
 *
 *  Màn dài (form tạo sự kiện, chi tiết dàn ngang) cần mắt nhảy được giữa các
 *  section mà không phải đọc. Ba cỡ ở đây là ba bậc LIỀN NHAU của thang 9 bậc
 *  (§8.3, bảng F-04 trên /kit): 15 · 13 · 12,5.
 *
 *  Hai cỡ cũ 18px và 14px không thuộc bậc nào, và đây là lý do chúng đi:
 *   · 18px sinh ra khi SectionTitle còn phải gánh cả TIÊU ĐỀ MÀN. Nay việc đó
 *     là của `PageHeader` (bậc 3 · 20/22px), nên vai lớn nhất còn lại của khối
 *     này là "tiêu đề thẻ" — đúng bậc 4 · 15px. Thang gộp 18→22 chỉ đúng cho
 *     chỗ dùng làm tiêu đề màn; chỗ dùng làm tiêu đề section thì xuống 15.
 *   · 14px là bậc §5.1 của sổ gap tự mâu thuẫn (nó chốt "14→13,5" trong khi
 *     13,5 không có trong thang của chính nó). Đọc là 14→13 · bậc 5.
 *
 *  Kicker mono ở trên và câu `hint` ở dưới là hai chỗ chứa phần giải thích —
 *  nhờ vậy tiêu đề giữ được ngắn thay vì nuốt luôn cả lời dẫn. */
const sectionTitleVariants = cva('m-0', {
  variants: {
    size: {
      lg: 'font-display text-[15px] font-semibold tracking-[-.2px]',
      md: 'font-display text-[13px] font-semibold',
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
  /** lg = 15px · bậc 4, section của form · md = 13px · bậc 5 · sm = 12,5px · bậc 6 */
  size?: 'lg' | 'md' | 'sm'
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
