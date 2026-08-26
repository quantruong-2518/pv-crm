import { Check, ChevronRight } from 'lucide-react'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-13 · StepStrip — dải bước của một luồng nhiều bước, đứng ở ĐẦU MÀN.
 *
 *  Vì sao không dùng Timeline (M-10) hay ApprovalChain (M-03): Timeline chạy dọc
 *  và mỗi mốc là một khối dày; ApprovalChain là chuỗi tên NGƯỜI đang chờ nhau.
 *  Dải bước trả lời một câu khác — "tôi đang ở bước mấy, bước nào đã xong, bấm
 *  về được bước nào" — nên nó phải bấm được, còn hai cái kia thì không.
 *
 *  LUẬT CỦA COMPONENT (giữ đúng luật 14 · không nút nào hứa một màn không có):
 *   · Bước ĐÃ QUA bấm được khi màn truyền `onGo` — đi lùi luôn được.
 *   · Bước CHƯA TỚI không bao giờ bấm được, kể cả có `onGo`. Đi tới phải qua
 *     cửa của bước đang đứng, mà cửa đó là việc của màn chứ không của dải.
 *     Vì vậy bước chưa tới render bằng `<span>`, không phải `<button>` tắt —
 *     một cái nút tắt vẫn hứa rằng "sắp bấm được", còn ở đây thì không.
 *   · Component KHÔNG giữ bước đang đứng. `current` là trạng thái của màn.
 *
 *  Ô bấm cao 48px (`min-h-12`) — ngưỡng chạm tablet, luật 13. */
export type StepStripItem = {
  key: string
  /** tên bước, ví dụ "Chọn nguồn" */
  label: string
  /** một câu tóm tắt thứ người dùng đã chọn ở bước đó, ví dụ "Apollo.io · 1.254 dòng" */
  hint?: string
}

export type StepStripProps = {
  steps: StepStripItem[]
  /** chỉ số bước đang đứng, đếm từ 0 */
  current: number
  /** người dùng bấm một bước ĐÃ QUA. Không truyền thì cả dải chỉ để đọc. */
  onGo?: (index: number) => void
  className?: string
}

export function StepStrip({ steps, current, onGo, className }: StepStripProps) {
  return (
    <ol className={cn('m-0 flex list-none flex-wrap items-center gap-2 p-0', className)}>
      {steps.map((step, i) => {
        const done = i < current
        const here = i === current
        const goable = done && Boolean(onGo)

        const inner = (
          <>
            <span
              aria-hidden
              className={cn(
                'tnum flex size-6 shrink-0 items-center justify-center rounded-sm font-mono text-[11px] font-semibold',
                here && 'bg-primary text-primary-foreground shadow-primary',
                done && 'bg-success/20 text-on-tint-success-strong',
                !here && !done && 'text-muted-foreground bg-white/8',
              )}
            >
              {done ? <Icon icon={Check} size={14} /> : i + 1}
            </span>

            <span className="flex min-w-0 flex-col text-left">
              <span
                className={cn(
                  'truncate text-[12.5px] font-semibold',
                  here
                    ? 'text-accent-foreground'
                    : done
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
              {step.hint && (
                <span className="text-muted-foreground truncate text-[11px] leading-[1.5]">
                  {step.hint}
                </span>
              )}
            </span>
          </>
        )

        const box = cn(
          'motion-std flex min-h-12 min-w-0 items-center gap-3 rounded-md px-4 py-2',
          here && 'bg-primary/16',
          goable && 'hover:bg-white/8 cursor-pointer',
        )

        return (
          <li key={step.key} className="flex min-w-0 items-center gap-2">
            {goable ? (
              <button
                type="button"
                onClick={() => onGo?.(i)}
                className={cn(
                  box,
                  'outline-none focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
                )}
              >
                {inner}
              </button>
            ) : (
              <span className={box} aria-current={here ? 'step' : undefined}>
                {inner}
              </span>
            )}

            {i < steps.length - 1 && (
              <Icon icon={ChevronRight} size={16} className="text-muted-foreground opacity-55" />
            )}
          </li>
        )
      })}
    </ol>
  )
}
