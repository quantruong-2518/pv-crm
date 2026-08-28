import { Orbit } from '../icons'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** Nút Trợ lý AI nổi — 60px, góc phải dưới.
 *  Một trong hai chỗ duy nhất được dùng rounded-full (luật 5 · docs/luat-thiet-ke.md).
 *  Icon `orbit`: One ở tâm, bốn nhánh quay quanh — không `sparkles`, không `bot`. */
export function AssistantFab({ onClick, className }: { onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Mở Trợ lý AI"
      className={cn(
        'motion-std fixed bottom-8 right-8 z-10 flex size-[60px] items-center justify-center rounded-full',
        'text-primary-foreground bg-[linear-gradient(135deg,var(--primary),var(--brand-blue))]',
        'shadow-[var(--shadow-primary),inset_0_1px_0_var(--sheen-ai)] hover:brightness-[1.12]',
        className,
      )}
    >
      <Icon icon={Orbit} size={24} strokeWidth={1.9} />
    </button>
  )
}
