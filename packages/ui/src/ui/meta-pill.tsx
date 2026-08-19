import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { Avatar } from './avatar'
import { Icon } from './icon'
import { cn } from '../lib/cn'

/** A-12 · MetaPill — ngày · mã · tên người, ba thứ hay bị chôn trong câu chữ.
 *
 *  Chip (A-03) là mã object và bấm được. MetaPill KHÔNG bấm được: nó chỉ tách
 *  một mẩu metadata ra khỏi dòng chữ để mắt bắt được ngay. Vì vậy nó không có
 *  `onOpen`, không hover — cần bấm thì dùng Chip.
 *
 *  Tag → `rounded-sm` (luật 5 · docs/luat-thiet-ke.md). Không `rounded-full`:
 *  hệ này góc sắc, tròn dành cho StatusDot và FAB. */
const metaPillVariants = cva('inline-flex items-center gap-2 rounded-sm px-2 py-1 text-[11px]', {
  variants: {
    tone: {
      muted: 'bg-white/9 text-glass-foreground',
      accent: 'bg-primary/24 text-accent-foreground',
      warning: 'bg-warning/20 text-warning',
      success: 'bg-success/20 text-success',
    },
    /** ngày và mã đọc bằng mắt theo cột — mono + tabular giữ chúng thẳng hàng */
    mono: {
      true: 'tnum font-mono',
      false: '',
    },
  },
  defaultVariants: { tone: 'muted', mono: false },
})

export type MetaPillProps = {
  icon?: LucideIcon
  /** tên người → hiện <Avatar size="sm"> thay cho icon; `icon` bị bỏ qua */
  avatar?: string
  tone?: 'muted' | 'accent' | 'warning' | 'success'
  /** chữ mono — dùng cho ngày và mã */
  mono?: boolean
  children: ReactNode
  className?: string
}

export function MetaPill({ icon, avatar, tone, mono, children, className }: MetaPillProps) {
  return (
    <span className={cn(metaPillVariants({ tone, mono }), className)}>
      {avatar ? <Avatar name={avatar} size="sm" /> : icon ? <Icon icon={icon} size={14} /> : null}
      {children}
    </span>
  )
}

export { metaPillVariants }
