import { StatusDot, type StatusDotState } from '../ui/status-dot'
import { cn } from '../lib/cn'

/** M-03 · ApprovalChain — StatusDot[] + Separator + tên người.
 *  Bước hiện tại LUÔN text-accent-foreground. Chuỗi do E3 giữ, màn chỉ vẽ lại. */
export type ChainStep = {
  /** "Đức ✓ 08:40" · "Anh — đang chờ" · "Kế toán Mai" */
  label: string
  state: Extract<StatusDotState, 'ok' | 'current' | 'next'>
}

export function ApprovalChain({ steps, className }: { steps: ChainStep[]; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2.5">
        {steps.map((step, i) => (
          <span key={step.label} className="contents">
            {i > 0 && <span className="bg-white/14 h-[1.5px] flex-1" />}
            <StatusDot state={step.state} label={step.label} />
          </span>
        ))}
      </div>
      <div className="text-muted-foreground mt-2.5 flex justify-between text-[10.5px]">
        {steps.map((step) => (
          <span
            key={step.label}
            className={cn(step.state === 'current' && 'text-accent-foreground font-semibold')}
          >
            {step.label}
          </span>
        ))}
      </div>
    </div>
  )
}
