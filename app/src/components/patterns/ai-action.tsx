import type { ReactNode } from 'react'
import { Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

/** M-09 · AIAction — chữ ký của hệ.
 *
 *  LUẬT CỨNG (luật 9 · CLAUDE.md · AGENTS.md §1.13): mọi khối AI có dòng
 *  "Căn cứ: …" và LUÔN chờ nút. AI không bao giờ tự thực hiện.
 *  Vì vậy `basis` và `onConfirm` là bắt buộc ở tầng kiểu — không dựng được
 *  một khối AI thiếu căn cứ hoặc thiếu nút xác nhận.
 *
 *  Ba biến thể: strip ngang (dưới dashboard) · block trong detail · panel dọc. */
export type AiActionProps = {
  /** đề xuất của trợ lý, một câu, có hệ quả rõ */
  suggestion: ReactNode
  /** dữ liệu trợ lý đã đọc để ra đề xuất — BẮT BUỘC */
  basis: string
  /** nhãn dòng căn cứ — đổi được cho màn tiếng Anh, ví dụ "Basis" */
  basisLabel?: string
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
  onConfirm,
  confirmLabel = 'Thực hiện',
  onInspect,
  inspectLabel = 'Xem căn cứ',
  variant = 'strip',
  done = false,
  className,
}: AiActionProps) {
  return (
    <div
      className={cn(
        'rounded-lg px-5 py-4',
        variant === 'strip' ? 'glass-ai flex items-center gap-3.5' : 'glass-ai-panel flex flex-col gap-3.5',
        className,
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-[linear-gradient(135deg,var(--primary),var(--brand-blue))]">
        <Icon icon={Zap} size={16} strokeWidth={1.9} className="text-primary-foreground" />
      </div>

      <div className="flex-1 text-[13px] leading-[1.55] text-on-tint-primary">
        {suggestion}
        <small className="mt-[5px] block text-[11.5px] text-on-tint-primary-muted">
          {basisLabel}: {basis}
        </small>
      </div>

      <div className="flex shrink-0 gap-2.5">
        {done ? (
          <span className="self-center text-[12.5px] font-semibold text-on-tint-success-strong">
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
  )
}
