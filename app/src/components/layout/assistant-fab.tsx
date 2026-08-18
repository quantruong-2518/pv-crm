import { Orbit } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/cn'

/** Nút Trợ lý AI nổi — 60px, góc phải dưới.
 *  Một trong hai chỗ duy nhất được dùng rounded-full (luật 5 · CLAUDE.md).
 *  Icon `orbit`: One ở tâm, bốn nhánh quay quanh — không `sparkles`, không `bot`. */
export function AssistantFab({
  onClick,
  className,
}: {
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Mở Trợ lý AI"
      className={cn(
        'motion-std fixed right-8 bottom-8 z-10 flex size-[60px] items-center justify-center rounded-full',
        'bg-[linear-gradient(135deg,var(--primary),var(--brand-blue))] text-primary-foreground',
        'shadow-[var(--shadow-primary),inset_0_1px_0_var(--sheen-ai)] hover:brightness-[1.12]',
        className,
      )}
    >
      <Icon icon={Orbit} size={24} strokeWidth={1.9} />
    </button>
  )
}
