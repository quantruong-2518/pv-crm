import type { ReactNode } from 'react'
import { Check } from '../icons'
import { Icon } from './icon'
import { cn } from '../lib/cn'

/** A-16 · Checkbox — chọn nhiều trong một danh sách.
 *
 *  Ô thật là `<input type="checkbox">` nằm dưới `sr-only`: bàn phím, Space,
 *  form và trình đọc màn hình đều là của trình duyệt, phần vẽ mới là của hệ.
 *  Một `<button role="checkbox">` tự dựng phải chép lại cả bốn thứ đó và
 *  thường chép thiếu.
 *
 *  Borderless (luật 4): ô chưa tick đọc bằng nền `white/12`, ô đã tick bằng nền
 *  azure — không viền. Vòng focus là `peer-focus-visible`, tức chỉ hiện khi đi
 *  bằng bàn phím. */
export type CheckboxProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Dòng chính. Bấm vào chữ cũng tick — nhãn bọc cả ô. */
  label: ReactNode
  /** Dòng phụ 11px dưới nhãn — vai, kỹ năng, lý do được gợi ý. */
  hint?: ReactNode
  /** Khối bên phải: avatar, badge, số. */
  trailing?: ReactNode
  disabled?: boolean
  className?: string
}

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  trailing,
  disabled = false,
  className,
}: CheckboxProps) {
  return (
    <label
      className={cn(
        'motion-std flex items-center gap-3 rounded-md px-3 py-2',
        disabled ? 'cursor-not-allowed opacity-55' : 'hover:bg-white/8 cursor-pointer',
        checked && !disabled && 'bg-primary/16',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'motion-std flex size-4 shrink-0 items-center justify-center rounded-sm',
          checked ? 'bg-primary text-primary-foreground' : 'bg-white/12',
          'peer-focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_60%,transparent)]',
        )}
      >
        {checked && <Icon icon={Check} size={14} strokeWidth={1.9} />}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[12.5px] font-semibold">{label}</span>
        {hint && <span className="text-muted-foreground truncate text-[11px]">{hint}</span>}
      </span>

      {trailing && <span className="flex shrink-0 items-center gap-2">{trailing}</span>}
    </label>
  )
}
