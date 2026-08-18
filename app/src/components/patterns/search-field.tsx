import { Search } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

/** M-04 · SearchField — topbar h-10 · màn tìm h-13 · tablet kiosk h-16 text-2xl. */
export type SearchFieldProps = {
  size?: 'topbar' | 'page' | 'kiosk'
  placeholder?: string
  value?: string
  /** "4 nguồn · 0,3 giây" — chỉ hiện ở bản màn tìm */
  meta?: string
  onChange?: (value: string) => void
  className?: string
}

const sizeClass = {
  topbar: 'h-10 px-[14px] text-[12.5px] gap-2.5 bg-input',
  page: 'h-13 px-4 text-[14px] gap-2.5 bg-popover shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_45%,transparent)]',
  kiosk: 'h-16 px-4 text-[22px] gap-3 bg-popover',
}

export function SearchField({
  size = 'topbar',
  placeholder = 'Tìm khách hàng, đơn hàng, tài liệu…',
  value,
  meta,
  onChange,
  className,
}: SearchFieldProps) {
  const filled = Boolean(value)
  return (
    <label
      className={cn(
        'motion-std flex items-center rounded-md',
        sizeClass[size],
        filled ? 'text-foreground' : 'text-muted-foreground',
        className,
      )}
    >
      <Icon
        icon={Search}
        size={size === 'topbar' ? 16 : 18}
        className={filled ? 'text-accent-foreground' : 'text-muted-foreground'}
      />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-inherit outline-none placeholder:text-muted-foreground"
      />
      {meta && <span className="font-mono text-[10.5px] text-muted-foreground">{meta}</span>}
    </label>
  )
}
