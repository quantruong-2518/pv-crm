import { GlassCard } from '@/components/layout/glass-card'
import { ContextRail, type RailObject } from '@/components/patterns/context-rail'
import { Progress } from '@/components/ui/progress'
import { StatusDot, type StatusDotState } from '@/components/ui/status-dot'
import { cn } from '@/lib/cn'

/** O-06 · OrderLifecycleCard — hero 2×2 của dashboard (AGENTS.md §7, màn 01:
 *  "1 ô hero 2×2, order lifecycle 10 mốc"). Header (StatusDot + tiêu đề + tiền)
 *  → mô tả → Progress mốc đang chạy → dải mốc vòng đời → ContextRail. */
export type LifecycleStep = Extract<StatusDotState, 'ok' | 'current' | 'next'>

export type OrderLifecycleCardProps = {
  state: Extract<StatusDotState, 'bad' | 'warning' | 'ok' | 'current'>
  title: string
  /** tiền đã format sẵn, ví dụ "₫1.84bn" */
  amount: string
  description: string
  progress: { label: string; value: number }
  /** mốc vòng đời — bao nhiêu phần tử cũng được, chỉ 3 mốc đầu/hiện tại/cuối có nhãn */
  milestones: LifecycleStep[]
  milestoneLabels: [start: string, current: string, end: string]
  objects: RailObject[]
  className?: string
}

function LifecycleTrack({
  steps,
  labels,
}: {
  steps: LifecycleStep[]
  labels: OrderLifecycleCardProps['milestoneLabels']
}) {
  return (
    <div className="rounded-md bg-black/20 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
      <div className="flex items-center">
        {steps.map((step, i) => (
          <span key={i} className="contents">
            {i > 0 && (
              <span
                className={cn(
                  'h-[1.5px] flex-1',
                  steps[i - 1] === 'current' || step === 'current' ? 'bg-primary/45' : 'bg-white/12',
                )}
              />
            )}
            <StatusDot state={step} />
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex justify-between text-[10.5px] text-muted-foreground">
        <span>{labels[0]}</span>
        <span className="font-semibold text-accent-foreground">{labels[1]}</span>
        <span>{labels[2]}</span>
      </div>
    </div>
  )
}

export function OrderLifecycleCard({
  state,
  title,
  amount,
  description,
  progress,
  milestones,
  milestoneLabels,
  objects,
  className,
}: OrderLifecycleCardProps) {
  return (
    <GlassCard hoverable className={cn('flex flex-col gap-4 px-6 py-[22px]', className)}>
      <div className="flex items-center gap-[11px]">
        <StatusDot state={state} />
        <b className="flex-1 font-display text-[17px] font-semibold">{title}</b>
        <span className="tnum font-num text-[17px] font-semibold tracking-[-.4px]">{amount}</span>
      </div>

      <p className="-mt-2.5 text-[12.5px] text-muted-foreground">{description}</p>

      <Progress
        value={progress.value}
        label={progress.label}
        className="rounded-md bg-black/20 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]"
      />

      <LifecycleTrack steps={milestones} labels={milestoneLabels} />

      <ContextRail objects={objects} className="mt-auto pt-1" />
    </GlassCard>
  )
}
