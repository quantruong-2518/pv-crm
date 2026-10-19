import type { IconGlyph } from '../icons'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-08 · EmptyState — LUÔN 1 icon + 1 câu hướng dẫn + 1 nút.
 *  Không bao giờ chỉ có chữ "Không có dữ liệu". */
export type EmptyStateProps = {
  icon: IconGlyph
  message: string
  action: { label: string; onClick?: () => void }
  /** `danger` when the block reports a failure (a load that broke) rather than
   *  an empty result: every error line in the app reads in the danger tone. */
  tone?: 'muted' | 'danger'
  className?: string
}

export function EmptyState({ icon, message, action, tone = 'muted', className }: EmptyStateProps) {
  const ink = tone === 'danger' ? 'text-destructive-foreground' : 'text-muted-foreground'
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cn('flex flex-col items-center gap-3 text-center', className)}
    >
      <Icon icon={icon} size={26} className={ink} />
      <p className={cn(ink, 'text-pretty text-[12.5px] leading-[1.65]')}>{message}</p>
      <Button variant="ghost" size="sm" className="pointer-coarse:h-12" onClick={action.onClick}>
        {action.label}
      </Button>
    </div>
  )
}
