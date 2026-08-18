import { cn } from '@/lib/cn'
import { percent as fmtPercent } from '@/lib/format'

/** A-07 · Progress — h-2 rounded-sm bg-white/10 · số luôn font-num. */
export type ProgressProps = {
  /** 0–1 */
  value: number
  label: string
  /** azure = tiến độ đang chạy · warning = chỉ số đang dưới đích */
  tone?: 'primary' | 'warning'
  className?: string
}

export function Progress({ value, label, tone = 'primary', className }: ProgressProps) {
  const pct = Math.min(Math.max(value, 0), 1)
  return (
    <div className={className}>
      <div className="mb-2 flex justify-between">
        <span className="text-[11.5px] text-muted-foreground">{label}</span>
        <span className="tnum font-num text-[13px] font-semibold">{fmtPercent(pct)}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-sm bg-white/10"
      >
        <span
          className={cn(
            'block h-full rounded-sm',
            tone === 'primary'
              ? 'bg-[linear-gradient(90deg,var(--primary),var(--accent-foreground))]'
              : 'bg-warning',
          )}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  )
}
