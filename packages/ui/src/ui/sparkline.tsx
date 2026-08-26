import { cn } from '../lib/cn'

/** A-11 · Sparkline — 86×26 · stroke 1.5 · LUÔN kèm nhãn nguồn dữ liệu.
 *  Nhãn nguồn là bằng chứng "một hệ": số nằm cạnh nhau nhưng sinh ở bốn nhánh. */
export type SparklineTone = 'success' | 'warning' | 'danger' | 'primary'

const strokeClass: Record<SparklineTone, string> = {
  success: 'stroke-success',
  warning: 'stroke-warning',
  danger: 'stroke-destructive-foreground',
  primary: 'stroke-primary',
}

export type SparklineProps = {
  /** toạ độ y trong hệ viewBox 0–26, một điểm mỗi mốc */
  points: number[]
  tone?: SparklineTone
  /** ví dụ "T8 · CRM" — bắt buộc, đây là nhãn nguồn dữ liệu */
  source: string
  height?: number
  className?: string
}

export function Sparkline({
  points,
  tone = 'primary',
  source,
  height = 26,
  className,
}: SparklineProps) {
  // Thang x của theme kit: bước 12px, điểm cuối luôn chạm mép phải 86.
  const last = points.length - 1
  const path = points.map((y, i) => `${i === last ? 86 : Math.min(i * 12, 86)},${y}`).join(' ')

  return (
    <div className={cn('flex items-end gap-3', className)}>
      <svg
        width={86}
        height={height}
        viewBox="0 0 86 26"
        fill="none"
        role="img"
        aria-label={`Xu hướng ${source}`}
      >
        <polyline
          points={path}
          strokeWidth={1.5}
          fill="none"
          strokeLinejoin="round"
          className={strokeClass[tone]}
        />
      </svg>
      <span className="text-muted-foreground font-mono text-[10.5px]">{source}</span>
    </div>
  )
}
