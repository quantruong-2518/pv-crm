import { cn } from '../lib/cn'

/** A-18 · RadialGauge — "đã đi được bao nhiêu phần đường tới mục tiêu".
 *
 *  Progress (A-07) là thanh ngang cho tiến độ nằm TRONG một dòng. Gauge này là
 *  thứ đứng ở TÂM một khối: số lớn ở giữa, vòng quanh nó nói tỉ lệ, và các con
 *  số phụ xếp xung quanh. Một màn chỉ nên có một cái.
 *
 *  Vượt mục tiêu là chuyện thường và là tin tốt, nên `value > 1` không bị cắt về
 *  1: vòng chạy trọn và phần vượt đọc ở chữ, không ở hình. Hình chỉ có 360°.
 *
 *  `empty` là trạng thái "chưa đo được" — vòng xám, tâm hiện chữ chứ không hiện
 *  0%. Số 0 nghĩa là "đo rồi, kết quả bằng không", khác hẳn. */
export type RadialGaugeTone = 'primary' | 'success' | 'warning' | 'danger'

const arcClass: Record<RadialGaugeTone, string> = {
  primary: 'stroke-primary',
  success: 'stroke-success',
  warning: 'stroke-warning',
  danger: 'stroke-destructive-foreground',
}

const centerClass: Record<RadialGaugeTone, string> = {
  primary: 'text-accent-foreground',
  success: 'text-on-tint-success-strong',
  warning: 'text-on-tint-warning-strong',
  danger: 'text-destructive-foreground',
}

export type RadialGaugeProps = {
  /** 0–1. Lớn hơn 1 vẫn nhận — vòng đầy, chữ ở tâm nói phần vượt. */
  value: number
  /** chữ ở tâm, đã format sẵn: "84%" · "2/3" */
  center: string
  /** dòng nhỏ dưới chữ tâm */
  caption?: string
  /** nhãn cho trình đọc màn hình — vòng tròn một mình không nói được gì */
  label: string
  tone?: RadialGaugeTone
  /** đường kính, px. 168 cho ô tâm của drawer, 96 cho ô trong thẻ. */
  size?: number
  /** chưa đo được: vòng xám và tâm hiện đúng chữ này */
  empty?: string
  className?: string
}

export function RadialGauge({
  value,
  center,
  caption,
  label,
  tone = 'primary',
  size = 168,
  empty,
  className,
}: RadialGaugeProps) {
  const stroke = size >= 140 ? 10 : 8
  const r = 50 - stroke / 2
  const circumference = 2 * Math.PI * r
  const filled = empty ? 0 : Math.min(Math.max(value, 0), 1)

  return (
    <div
      role="img"
      aria-label={`${label} · ${empty ?? center}`}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} fill="none" aria-hidden>
        {/* Vòng chạy từ 12 giờ theo chiều kim đồng hồ — xoay cả hệ toạ độ chứ
            không tự tính lại toạ độ cung. */}
        <g transform="rotate(-90 50 50)">
          <circle cx={50} cy={50} r={r} strokeWidth={stroke} className="stroke-white/10" />
          {/* Không vẽ cung khi chưa đo được: `strokeLinecap="round"` biến một
              cung dài 0 thành một CHẤM ở đỉnh vòng, đọc ra như "đã đi được một
              tí" trong khi sự thật là chưa có số nào. */}
          {!empty && (
            <circle
              cx={50}
              cy={50}
              r={r}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${filled * circumference} ${circumference}`}
              className={arcClass[tone]}
            />
          )}
        </g>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
        <span
          className={cn(
            'tnum font-num font-semibold leading-none',
            size >= 140 ? 'text-[26px] tracking-[-.8px]' : 'text-[15px] tracking-[-.5px]',
            empty ? 'text-warning text-[13px] tracking-normal' : centerClass[tone],
          )}
        >
          {empty ?? center}
        </span>
        {caption && !empty && (
          <span className="text-muted-foreground text-[10.5px] leading-[1.4]">{caption}</span>
        )}
      </div>
    </div>
  )
}
