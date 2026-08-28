import type { IconGlyph } from '../icons'
import { cva } from 'class-variance-authority'
import { Icon } from './icon'
import { cn } from '../lib/cn'

/** A-13 · ChannelTag — kênh gửi của một nội dung: nhìn là biết đi đường nào.
 *
 *  `@pv/ui` KHÔNG biết Gmail là gì, Zalo là gì. Icon định danh của kênh đi vào
 *  bằng prop; ánh xạ "kênh → icon" là bảng của app, không phải của thư viện
 *  (biên giới package · CLAUDE.md). Nhờ vậy thêm kênh mới không phải sửa @pv/ui.
 *
 *  `warning` dành cho kênh CHƯA có đường gửi thật — trạng thái POC phải nói ra,
 *  không được để người dùng tưởng đã gửi được. */
const channelTagVariants = cva(
  'motion-std inline-flex items-center whitespace-nowrap rounded-sm text-[11px]',
  {
    variants: {
      tone: {
        default: 'bg-white/9 text-glass-foreground',
        warning: 'bg-warning/20 text-warning',
        accent: 'bg-primary/24 text-accent-foreground',
      },
      iconOnly: {
        true: 'justify-center p-1',
        false: 'gap-1 px-2 py-1',
      },
    },
    defaultVariants: { tone: 'default', iconOnly: false },
  },
)

export type ChannelTagProps = {
  icon: IconGlyph
  label: string
  /** kênh chưa có đường gửi thật → tone warning */
  tone?: 'default' | 'warning' | 'accent'
  /** chỉ icon + tooltip, dùng trong ô bảng hẹp */
  iconOnly?: boolean
  className?: string
}

export function ChannelTag({ icon, label, tone, iconOnly = false, className }: ChannelTagProps) {
  return (
    <span
      title={label}
      /* Icon một mình không nói được gì: bản iconOnly phải mang nhãn cho cả
         trình đọc màn hình (role img + aria-label) lẫn chuột (title). */
      role={iconOnly ? 'img' : undefined}
      aria-label={iconOnly ? label : undefined}
      className={cn(channelTagVariants({ tone, iconOnly }), className)}
    >
      <Icon icon={icon} size={14} />
      {!iconOnly && label}
    </span>
  )
}

export { channelTagVariants }
