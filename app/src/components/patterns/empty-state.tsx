import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

/** M-08 · EmptyState — LUÔN 1 icon + 1 câu hướng dẫn + 1 nút.
 *  Không bao giờ chỉ có chữ "Không có dữ liệu". */
export type EmptyStateProps = {
  icon: LucideIcon
  message: string
  action: { label: string; onClick?: () => void }
  className?: string
}

export function EmptyState({ icon, message, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 text-center', className)}>
      <Icon icon={icon} size={26} className="text-muted-foreground" />
      <p className="text-[12.5px] leading-[1.65] text-pretty text-muted-foreground">{message}</p>
      <Button variant="ghost" size="sm" onClick={action.onClick}>
        {action.label}
      </Button>
    </div>
  )
}
