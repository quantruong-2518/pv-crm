import { cn } from '../lib/cn'
import { billions, dong, millions } from '../lib/format'

/** A-10 · Money — chuẩn VN: phẩy thập phân, chấm ngăn nghìn, luôn tabular-nums.
 *  hero  → Space Grotesk 26 (bậc 2) · trong thẻ → Space Grotesk 20
 *  table → IBM Plex Mono 12.5, ghi đủ số đồng. */
export type MoneyProps = {
  /** giá trị bằng đồng */
  value: number
  scale?: 'hero' | 'card' | 'table'
  className?: string
}

export function Money({ value, scale = 'card', className }: MoneyProps) {
  if (scale === 'table') {
    return <span className={cn('tnum font-mono text-[12.5px]', className)}>{dong(value)}</span>
  }
  if (scale === 'hero') {
    return (
      <span
        className={cn(
          'tnum font-num text-[26px] font-semibold leading-none tracking-[-.8px]',
          className,
        )}
      >
        {billions(value)}
      </span>
    )
  }
  return (
    <span className={cn('tnum font-num text-[20px] font-semibold tracking-[-.4px]', className)}>
      {millions(value)}
    </span>
  )
}
