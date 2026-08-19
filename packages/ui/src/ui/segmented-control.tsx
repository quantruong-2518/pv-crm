import { cn } from '../lib/cn'

/** A-19 · SegmentedControl — chọn ĐÚNG MỘT trong vài lựa chọn ngang hàng.
 *
 *  Khác Select (A-15): select giấu các lựa chọn cho tới lúc bấm, hợp với danh
 *  sách dài; cái này để lộ hết, hợp với 2–6 lựa chọn mà người dùng đổi qua đổi
 *  lại liên tục — bộ chọn kỳ, bộ lọc theo vai. Đổi kỳ mà phải mở popup rồi chọn
 *  là hai thao tác cho một việc.
 *
 *  Nền chung của cả nhóm là một tấm mờ, ô đang chọn nổi lên trên nó. Nhờ vậy
 *  nhóm đọc ra như MỘT control chứ không ra như mấy cái nút rời nhau. */
export type SegmentedOption = {
  value: string
  label: string
  /** số nhỏ sau nhãn — "Sale · 3" */
  count?: number
  disabled?: boolean
}

export type SegmentedControlProps = {
  /** Nhãn đứng trước nhóm. Luôn có, kể cả khi ẩn khỏi mắt. */
  label: string
  value: string
  options: SegmentedOption[]
  onChange: (value: string) => void
  size?: 'sm' | 'md'
  hideLabel?: boolean
  className?: string
}

export function SegmentedControl({
  label,
  value,
  options,
  onChange,
  size = 'md',
  hideLabel = false,
  className,
}: SegmentedControlProps) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <span
        className={cn('text-muted-foreground shrink-0 text-[11px]', hideLabel && 'sr-only')}
        id={`seg-${label}`}
      >
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={`seg-${label}`}
        className={cn(
          'flex min-w-0 flex-wrap items-center gap-1 rounded-md bg-white/5 p-1',
          size === 'sm' ? 'text-[11px]' : 'text-[12px]',
        )}
      >
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              disabled={o.disabled}
              onClick={() => onChange(o.value)}
              className={cn(
                'motion-std inline-flex items-center gap-2 whitespace-nowrap rounded-sm font-semibold',
                size === 'sm' ? 'h-6 px-2' : 'h-8 px-3',
                active
                  ? 'bg-primary text-primary-foreground shadow-primary'
                  : 'text-muted-foreground hover:bg-white/8 hover:text-foreground',
                o.disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent',
              )}
            >
              {o.label}
              {typeof o.count === 'number' && (
                <span
                  className={cn(
                    'tnum font-num text-[10.5px] font-normal',
                    active ? 'text-on-tint-primary' : 'text-muted-foreground',
                  )}
                >
                  {o.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
