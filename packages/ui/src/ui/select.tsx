import { ChevronDown } from 'lucide-react'
import { Icon } from './icon'
import { cn } from '../lib/cn'

/** A-15 · Select — một ô lọc, một dòng.
 *
 *  Thanh lọc cũ của Sổ lead là ba chục nút pill trải ba dòng: mắt phải quét cả
 *  ba dòng mới biết mình đang lọc gì. Một `<select>` gói cùng chỗ đó vào một ô
 *  cao 40px, và giá trị đang chọn LÀ câu trả lời — không phải đi tìm nút nào
 *  đang sáng.
 *
 *  Dùng `<select>` gốc chứ không dựng popover: nó có sẵn bàn phím, chạm, tìm
 *  theo chữ cái, và trên điện thoại là bánh xe của hệ điều hành. Popover tự
 *  dựng thua cả ba thứ đó. Popup xổ xuống lấy màu từ `color-scheme: dark` ở
 *  tầng token, không phải từ class ở đây.
 *
 *  Ô đang lọc khác mặc định thì SÁNG LÊN. Đây là điểm khác nút pill: pill nói
 *  "tôi đang bật" bằng nền azure, còn select thì phải tự nói ra, nếu không người
 *  dùng nhìn một bảng 6 dòng mà không hiểu 94 dòng kia đi đâu. */
export type SelectOption = { value: string; label: string }

export type SelectProps = {
  /** Nhãn đứng trước ô — "Trạng thái", "Ngành". Luôn có, kể cả khi ẩn. */
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  /** Giá trị "không lọc gì". Mặc định là option đầu. */
  neutralValue?: string
  /** Ẩn nhãn khỏi mắt, giữ cho trình đọc màn hình. */
  hideLabel?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function Select({
  label,
  value,
  options,
  onChange,
  neutralValue,
  hideLabel = false,
  size = 'md',
  className,
}: SelectProps) {
  const neutral = neutralValue ?? options[0]?.value ?? ''
  const active = value !== neutral

  return (
    <label
      className={cn(
        'motion-std relative inline-flex min-w-0 items-center gap-2 rounded-md pl-3 pr-8',
        size === 'sm' ? 'h-8 text-[11.5px]' : 'h-10 text-[12.5px]',
        active ? 'bg-primary/24 text-accent-foreground' : 'bg-input text-foreground',
        'focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
        className,
      )}
    >
      <span
        className={cn(
          'shrink-0 whitespace-nowrap text-[11px]',
          hideLabel && 'sr-only',
          active ? 'text-accent-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-inherit outline-none',
          active && 'font-semibold',
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon
        icon={ChevronDown}
        size={16}
        className={cn(
          'pointer-events-none absolute right-2',
          active ? 'text-accent-foreground' : 'text-muted-foreground',
        )}
      />
    </label>
  )
}
