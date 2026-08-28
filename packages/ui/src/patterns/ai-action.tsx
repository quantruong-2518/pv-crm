import type { ReactNode } from 'react'
import { Zap } from '../icons'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-09 · AIAction — chữ ký của hệ.
 *
 *  LUẬT CỨNG (luật 9 · docs/luat-thiet-ke.md §1): mọi khối AI có dòng
 *  "Căn cứ: …", LUÔN chờ nút, và có state "Chưa tạo gì cả" NGAY DƯỚI nút.
 *  Vì vậy `basis`, `onConfirm` và `empty` đều bắt buộc ở tầng kiểu — không dựng
 *  được một khối AI thiếu căn cứ, thiếu nút xác nhận, hay im lặng về việc chưa
 *  bấm thì chưa có gì. Trước 20/08 chỉ hai cái đầu là bắt buộc; hệ quả là bốn
 *  màn tự dựng dòng đó bằng tay bên ngoài khối và màn 01 quên hẳn.
 *
 *  Ba biến thể: strip ngang (dưới dashboard) · block trong detail · panel dọc. */
export type AiActionProps = {
  /** đề xuất của trợ lý, một câu, có hệ quả rõ */
  suggestion: ReactNode
  /** dữ liệu trợ lý đã đọc để ra đề xuất — BẮT BUỘC */
  basis: string
  /** nhãn dòng căn cứ — đổi được cho màn tiếng Anh, ví dụ "Basis" */
  basisLabel?: string
  /** State "Chưa tạo gì cả" — luật 9 đòi nó nằm NGAY DƯỚI nút. Bắt buộc ở tầng
   *  kiểu: không dựng được khối AI mà không nói ra hệ quả của việc chưa bấm. */
  empty: ReactNode
  /** nút thực hiện — BẮT BUỘC, AI không tự chạy */
  onConfirm: () => void
  confirmLabel?: string
  /** nút mở căn cứ đầy đủ */
  onInspect?: () => void
  inspectLabel?: string
  variant?: 'strip' | 'panel'
  /** trạng thái sau khi người bấm nút */
  done?: boolean
  className?: string
}

export function AiAction({
  suggestion,
  basis,
  basisLabel = 'Căn cứ',
  empty,
  onConfirm,
  confirmLabel = 'Thực hiện',
  onInspect,
  inspectLabel = 'Xem căn cứ',
  variant = 'strip',
  done = false,
  className,
}: AiActionProps) {
  return (
    /* Khung ngoài LUÔN xếp dọc, kể cả biến thể `strip`: dòng "Chưa tạo gì cả"
       phải xuống hàng dưới nút chứ không chen vào hàng ngang. Hàng ngang cũ
       tụt vào một lớp `<div>` bên trong nên bố cục của strip không đổi. */
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg px-5 py-4',
        variant === 'strip' ? 'glass-ai' : 'glass-ai-panel',
        className,
      )}
    >
      <div className={variant === 'strip' ? 'flex items-center gap-3.5' : 'flex flex-col gap-3.5'}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-[linear-gradient(135deg,var(--primary),var(--brand-blue))]">
          <Icon icon={Zap} size={16} strokeWidth={1.9} className="text-primary-foreground" />
        </div>

        <div className="text-on-tint-primary flex-1 text-[13px] leading-[1.55]">
          {suggestion}
          <small className="text-on-tint-primary-muted mt-[5px] block text-[11.5px]">
            {basisLabel}: {basis}
          </small>
        </div>

        <div className="flex shrink-0 gap-2.5">
          {done ? (
            <span className="text-on-tint-success-strong self-center text-[12.5px] font-semibold">
              Đã thực hiện
            </span>
          ) : (
            <Button onClick={onConfirm}>{confirmLabel}</Button>
          )}
          {onInspect && (
            <Button variant="ghost" onClick={onInspect}>
              {inspectLabel}
            </Button>
          )}
        </div>
      </div>

      {/* Chỉ khi CHƯA bấm. Bấm rồi thì "Đã thực hiện" đã nói xong chuyện, hai
          dòng cùng lúc là hai câu trả lời cho một câu hỏi.
          Chữ nằm TRÊN nền đã nhuộm azure nên dùng nhóm `--on-tint-*` (luật 1),
          không phải `--muted-foreground` của nền màn. */}
      {done ? null : (
        <p className="text-on-tint-primary-muted text-[11.5px] leading-[1.5]">{empty}</p>
      )}
    </div>
  )
}
