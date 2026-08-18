import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

/** A-05 · Avatar — rounded-md, không rounded-full: hệ này góc sắc.
 *  Viết tắt tên, không ảnh. Ba cỡ: 38 · 30 · 24. */
const avatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-md bg-[linear-gradient(135deg,var(--avatar-from),var(--avatar-to))] font-semibold text-foreground',
  {
    variants: {
      size: {
        lg: 'size-[38px] text-[12.5px]',
        md: 'size-[30px] text-[11px]',
        sm: 'size-6 text-[9.5px]',
      },
    },
    defaultVariants: { size: 'lg' },
  },
)

export type AvatarProps = VariantProps<typeof avatarVariants> & {
  /** Tên đầy đủ — dùng cho aria-label; hiển thị là chữ viết tắt */
  name: string
  /** Ghi đè chữ viết tắt nếu cách rút gọn tự động không đúng */
  initials?: string
  className?: string
}

/** "Nguyễn Văn Thắng" → "NT" — chữ cái đầu của họ và của tên gọi. */
export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({ name, initials, size, className }: AvatarProps) {
  return (
    <span role="img" aria-label={name} className={cn(avatarVariants({ size }), className)}>
      {initials ?? initialsOf(name)}
    </span>
  )
}

export { avatarVariants }
