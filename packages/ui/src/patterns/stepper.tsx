import { Check } from '../icons'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-14 · Stepper — dãy bước ngang của MỘT form nhiều bước (khác ApprovalChain:
 *  chuỗi đó là trạng thái duyệt do E3 giữ, chỉ để đọc; đây là điều hướng do
 *  MÀN giữ state, người dùng bấm lùi được về bước đã qua).
 *
 *  Bước đã qua bấm được (nếu có `onGo`) và có dấu tick; bước đang mở nổi bật
 *  bằng nền accent (luật 3); bước chưa tới không bao giờ bấm được. Luật 13:
 *  bước chưa tới KHÔNG dìm chữ nhãn bằng opacity — theo đúng quyết định đã có
 *  ở `nav-item.tsx` (dìm chữ phá tương phản ≥ 4.5:1), chỉ số thứ tự nhỏ mới
 *  mờ đi để báo "chưa tới".
 *
 *  Mobile: 4 chip ngang không lọt màn 440px, rút gọn còn một dòng
 *  "Bước n/N · nhãn" — cùng thông tin, đọc được trong một hơi. Dòng rút gọn
 *  chỉ đọc, không bấm lùi được; phạm vi hẹp của component này ưu tiên đọc
 *  đúng hơn là nhồi thao tác vào một dòng 12px. */
export type StepperStep = {
  key: string
  label: string
}

export type StepperProps = {
  steps: StepperStep[]
  /** Chỉ số bước đang mở, 0-based. */
  current: number
  /** Cho phép bấm quay lại một bước ĐÃ QUA. Bước chưa tới không bao giờ bấm được. */
  onGo?: (index: number) => void
  className?: string
}

type StepStatus = 'done' | 'current' | 'upcoming'

function StepControl({
  step,
  index,
  status,
  onGo,
}: {
  step: StepperStep
  index: number
  status: StepStatus
  onGo?: (index: number) => void
}) {
  const marker =
    status === 'done' ? (
      <Icon icon={Check} size={14} className="text-success" />
    ) : (
      <span
        className={cn(
          'font-mono text-[10.5px]',
          status === 'current' ? 'text-accent-foreground' : 'text-muted-foreground opacity-50',
        )}
      >
        {index + 1}
      </span>
    )

  if (status === 'done') {
    return (
      <button
        type="button"
        disabled={!onGo}
        onClick={() => onGo?.(index)}
        className={cn(
          'motion-std inline-flex items-center gap-2 whitespace-nowrap rounded-sm px-2 py-1 text-[12px] font-medium',
          'text-foreground',
          onGo ? 'hover:bg-white/8 cursor-pointer' : 'cursor-default',
        )}
      >
        {marker}
        {step.label}
      </button>
    )
  }

  return (
    <span
      aria-current={status === 'current' ? 'step' : undefined}
      aria-disabled={status === 'upcoming' ? true : undefined}
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap rounded-sm px-2 py-1 text-[12px]',
        status === 'current'
          ? 'bg-accent text-foreground font-semibold shadow-[inset_0_1px_0_var(--sheen-ai)]'
          : 'text-muted-foreground cursor-not-allowed',
      )}
    >
      {marker}
      {step.label}
    </span>
  )
}

export function Stepper({ steps, current, onGo, className }: StepperProps) {
  return (
    <div className={className}>
      <ol aria-label="Các bước" className="hidden items-center gap-2 sm:flex">
        {steps.map((step, i) => {
          const status: StepStatus = i < current ? 'done' : i === current ? 'current' : 'upcoming'
          return (
            <li key={step.key} className="contents">
              {i > 0 && <span aria-hidden="true" className="bg-white/14 h-[1.5px] w-4 shrink-0" />}
              <StepControl step={step} index={i} status={status} onGo={onGo} />
            </li>
          )
        })}
      </ol>

      <p className="text-muted-foreground flex items-center gap-2 text-[12px] sm:hidden">
        <span className="text-foreground font-semibold">
          Bước {current + 1}/{steps.length}
        </span>
        <span aria-hidden="true">·</span>
        <span aria-current="step" className="text-foreground">
          {steps[current]?.label}
        </span>
      </p>
    </div>
  )
}
