import type { ReactNode } from 'react'
import { Chip } from '../ui/chip'
import { GlassCard } from '../layout/glass-card'
import { cn } from '../lib/cn'

/** O-05 · KioskTile — tablet, đọc xa 3m.
 *  Số ≥34px · chữ phụ ≥14px · nút ≥48px.
 *
 *  `highContrast` là NGOẠI LỆ DUY NHẤT được dùng viền (2px) trong cả hệ —
 *  cho kiosk đứng ngoài sáng, nơi bỏ viền là mất đọc (luật 4 · CLAUDE.md). */
export type KioskTileProps = {
  /** đã format sẵn: "68%" */
  value: string
  /** hai dòng ngữ cảnh, ví dụ "WO-1180 · chậm 2 ngày" / "hạn giao 22/08" */
  lines: ReactNode
  /** nhánh sinh ra số này */
  source?: string
  highContrast?: boolean
  action?: { label: string; onClick?: () => void }
  className?: string
}

export function KioskTile({
  value,
  lines,
  source,
  highContrast,
  action,
  className,
}: KioskTileProps) {
  if (highContrast) {
    return (
      <div
        className={cn(
          'bg-hc-surface flex flex-col rounded-lg border-2 border-[var(--hc-border)] p-[22px]',
          className,
        )}
      >
        <div className="text-glass-foreground mb-2.5 font-mono text-[10px] tracking-[.14em]">
          TƯƠNG PHẢN CAO
        </div>
        <div className="tnum font-num text-[36px] font-bold tracking-[-1px] text-white">
          {value}
        </div>
        <div className="text-foreground mt-2.5 text-[14px] leading-[1.6]">{lines}</div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="bg-warning text-brand-navy mt-auto h-12 rounded-md border-2 border-[var(--warning)] text-[14px] font-bold"
          >
            {action.label}
          </button>
        )}
      </div>
    )
  }

  return (
    <GlassCard className={cn('flex flex-col p-[22px]', className)}>
      <div className="tnum font-num text-[36px] font-semibold tracking-[-1px]">{value}</div>
      <div className="text-muted-foreground mt-2.5 text-[14px] leading-[1.6]">{lines}</div>
      {source && (
        <div className="mt-auto pt-3.5">
          <Chip variant="source" className="text-[11.5px]">
            {source}
          </Chip>
        </div>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="motion-std bg-primary text-primary-foreground shadow-primary mt-auto h-12 rounded-md text-[14px] font-semibold hover:brightness-[1.12]"
        >
          {action.label}
        </button>
      )}
    </GlassCard>
  )
}
