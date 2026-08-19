import { cn } from '../lib/cn'
import { percent as fmtPercent } from '../lib/format'

/** A-07 · Progress — h-2 rounded-sm bg-white/10 · số luôn font-num. */
export type ProgressProps = {
  /** 0–1 */
  value: number
  label: string
  /** azure = tiến độ ĐANG CHẠY · warning = chỉ số dưới đích · success = đã đạt đích */
  tone?: 'primary' | 'warning' | 'success'
  className?: string
}

/** Nền thanh theo tone.
 *
 *  `success` có mặt vì không có nó thì màn phải mượn `primary` để nói "đợt này
 *  ĐẠT kỳ vọng" — sai đúng cái nghĩa component tự khai (azure = đang chạy), và
 *  đẻ thêm một vệt azure trên màn trong khi luật 3 bắt đếm từng vệt một. Màu lấy
 *  từ `--success` đã có trong bảng token, không chế hex mới.
 *
 *  Chỉ `primary` mang gradient: vệt chuyển màu là thứ tả CHUYỂN ĐỘNG, hợp với
 *  tiến độ đang chạy. `warning` và `success` là phán xét về một chỉ số đã đo
 *  xong — không còn gì chuyển động để tả — nên cả hai đều nền phẳng, và giữ
 *  phẳng như nhau thì hai tone đó đọc ra như một cặp. */
const FILL: Record<NonNullable<ProgressProps['tone']>, string> = {
  primary: 'bg-[linear-gradient(90deg,var(--primary),var(--accent-foreground))]',
  warning: 'bg-warning',
  success: 'bg-success',
}

export function Progress({ value, label, tone = 'primary', className }: ProgressProps) {
  const pct = Math.min(Math.max(value, 0), 1)
  return (
    <div className={className}>
      <div className="mb-2 flex justify-between">
        <span className="text-muted-foreground text-[11.5px]">{label}</span>
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
          className={cn('block h-full rounded-sm', FILL[tone])}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  )
}
