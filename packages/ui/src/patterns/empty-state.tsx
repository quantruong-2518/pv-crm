import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-08 · EmptyState — LUÔN 1 icon + 1 câu hướng dẫn + 1 nút.
 *  Không bao giờ chỉ có chữ "Không có dữ liệu".
 *
 *  `message` nhận ReactNode chứ không chỉ chuỗi: câu rỗng hay phải nhắc lại một
 *  MÃ (lead L-2608-042, lô DS-0108), mà mã thì in bằng `font-mono` — luật 6.
 *  Ép chuỗi thì màn phải chép lại cả khối rỗng chỉ để mono hoá một cụm, và đó
 *  đúng là lý do `lead-detail.tsx` còn giữ một bản `EmptyLead` viết tay. */
export type EmptyStateProps = {
  icon: LucideIcon
  message: ReactNode
  action: { label: string; onClick?: () => void }
  className?: string
}

export function EmptyState({ icon, message, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 text-center', className)}>
      <Icon icon={icon} size={26} className="text-muted-foreground" />
      <p className="text-muted-foreground text-pretty text-[12.5px] leading-[1.65]">{message}</p>
      <Button variant="ghost" size="sm" onClick={action.onClick}>
        {action.label}
      </Button>
    </div>
  )
}
