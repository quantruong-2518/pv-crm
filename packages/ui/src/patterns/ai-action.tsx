import type { ReactNode } from 'react'
import { AiMark } from '../icons'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-09 · AIAction — chữ ký của hệ.
 *
 *  Every word on screen comes from the caller (en/ko screens must not show
 *  Vietnamese): the labels have no defaults, and `inspectLabel` / `dismissLabel`
 *  are required exactly when their handler is given.
 *
 *  LUẬT CỨNG (luật 9 · docs/design-system/laws.md): mọi khối AI có dòng
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
  /** nhãn dòng căn cứ, ví dụ "Căn cứ" / "Basis" — BẮT BUỘC */
  basisLabel: string
  /** State "Chưa tạo gì cả" — luật 9 đòi nó nằm NGAY DƯỚI nút. Bắt buộc ở tầng
   *  kiểu: không dựng được khối AI mà không nói ra hệ quả của việc chưa bấm. */
  empty: ReactNode
  /** nút thực hiện — BẮT BUỘC, AI không tự chạy */
  onConfirm: () => void
  confirmLabel: string
  variant?: 'strip' | 'panel'
  /** trạng thái sau khi người bấm nút */
  done?: boolean
  /** What pressing did, when it did not finish the work: a filled form is not saved yet. */
  doneLabel: string
  /** `muted` for an end that is not success: dismissed, out of date, expired. */
  doneTone?: 'success' | 'muted'
  /** While the press is on its way: both buttons wait, so one press writes once. */
  pending?: boolean
  className?: string
} & (
  | { onInspect?: undefined; inspectLabel?: undefined }
  /** nút mở căn cứ đầy đủ */
  | { onInspect: () => void; inspectLabel: string }
) &
  (
    | { onDismiss?: undefined; dismissLabel?: undefined }
    /** A second way out: the proposal is dropped and nothing is written. */
    | { onDismiss: () => void; dismissLabel: string }
  )

/** The AI mark every AI block opens with, in a box one text line high so it
 *  sits beside the first line of text, not the middle of a wrapped block. */
function AiLead({ className }: { className?: string }) {
  return (
    <span className={cn('flex h-5 shrink-0 items-center', className)}>
      <Icon icon={AiMark} size={16} className="text-primary" />
    </span>
  )
}

export function AiAction({
  suggestion,
  basis,
  basisLabel,
  empty,
  onConfirm,
  confirmLabel,
  onInspect,
  inspectLabel,
  variant = 'strip',
  done = false,
  doneLabel,
  doneTone = 'success',
  onDismiss,
  dismissLabel,
  pending = false,
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
      <div
        className={
          variant === 'strip'
            ? 'flex items-center gap-3.5 max-sm:flex-col max-sm:items-stretch'
            : 'flex flex-col gap-3.5'
        }
      >
        <AiLead className={variant === 'strip' ? 'self-start' : undefined} />

        <div className="text-on-tint-primary min-w-0 flex-1 text-[13px] leading-[1.55]">
          {suggestion}
          <small className="text-on-tint-primary-muted mt-[5px] block text-[11.5px]">
            {basisLabel}: {basis}
          </small>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2.5">
          {done ? (
            <span
              className={cn(
                'self-center text-[12.5px] font-semibold',
                doneTone === 'success'
                  ? 'text-on-tint-success-strong'
                  : 'text-on-tint-primary-muted',
              )}
            >
              {doneLabel}
            </span>
          ) : (
            <>
              <Button
                type="button"
                className="pointer-coarse:h-12"
                onClick={onConfirm}
                disabled={pending}
              >
                {confirmLabel}
              </Button>
              {onDismiss && (
                <Button
                  type="button"
                  variant="ghost"
                  className="pointer-coarse:h-12"
                  onClick={onDismiss}
                  disabled={pending}
                >
                  {dismissLabel}
                </Button>
              )}
            </>
          )}
          {onInspect && (
            <Button
              type="button"
              variant="ghost"
              className="pointer-coarse:h-12"
              onClick={onInspect}
            >
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

export type AiChoice = {
  key: string
  label: ReactNode
  /** Under the label: the day, the reason. */
  hint?: ReactNode
  onPick: () => void
  /** Shows `pickedLabel` in place of the row's button. */
  picked?: boolean
}

export type AiChoicesProps = {
  choices: readonly AiChoice[]
  basis: string
  basisLabel: string
  empty: ReactNode
  pickLabel: string
  pickedLabel: string
  className?: string
}

/** M-28 · AiChoices — one AI block with several options, one button each.
 *
 *  Law 9 as in M-09: `basis`, `empty` and every `onPick` are required by type,
 *  and so are all its labels (no defaults).
 *  Several M-09 stacked repeat one basis line per block and push the form they
 *  fill off the screen; these rows share one. Secondary buttons, because
 *  a row of primaries leaves nothing to lead the eye. */
export function AiChoices({
  choices,
  basis,
  basisLabel,
  empty,
  pickLabel,
  pickedLabel,
  className,
}: AiChoicesProps) {
  return (
    <div
      className={cn(
        'glass-ai-panel wrap-break-word flex flex-col gap-3 rounded-lg px-5 py-4',
        className,
      )}
    >
      <AiLead />
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {choices.map((choice) => (
          <li key={choice.key} className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 basis-48 text-[13px] leading-[1.55]">
              <div className="text-on-tint-primary font-semibold">{choice.label}</div>
              {choice.hint && (
                <div className="text-on-tint-primary-muted text-[12px]">{choice.hint}</div>
              )}
            </div>
            {choice.picked ? (
              <span className="text-on-tint-success-strong text-[12.5px] font-semibold">
                {pickedLabel}
              </span>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="pointer-coarse:h-12 shrink-0"
                onClick={choice.onPick}
              >
                {pickLabel}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <small className="text-on-tint-primary-muted block text-[11.5px]">
        {basisLabel}: {basis}
      </small>
      {/* As in M-09: once something is picked, this line would be untrue. */}
      {choices.some((choice) => choice.picked) ? null : (
        <p className="text-on-tint-primary-muted text-[11.5px] leading-[1.5]">{empty}</p>
      )}
    </div>
  )
}
