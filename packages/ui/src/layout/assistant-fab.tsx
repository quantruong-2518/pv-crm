import { AiMark } from '../icons'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** Floating AI Assistant button — a 56px disc in the bottom-right corner.
 *  One of the three places allowed `rounded-full` (law 5), with StatusDot and Avatar.
 *
 *  Owner, 03/11: the conic halo is a gradient outside the places law 15 allows.
 *  It is the outer 56px disc showing 2px around a 52px inner disc: no padding and no
 *  border, so laws 4 and 7 stay untouched. */
export function AssistantFab({
  onClick,
  label = 'Mở Trợ lý AI',
  className,
}: {
  onClick?: () => void
  label?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'motion-std focus-visible:outline-ring fixed bottom-8 right-8 z-10 flex size-14 items-center justify-center rounded-full',
        'bg-[conic-gradient(from_200deg,var(--primary),var(--aurora-2),var(--accent-foreground),var(--aurora-1),var(--primary))]',
        'shadow-[var(--shadow-pop)] hover:brightness-[1.06] focus-visible:outline-2 focus-visible:outline-offset-2',
        className,
      )}
    >
      <span className="bg-primary-foreground text-primary flex size-[52px] items-center justify-center rounded-full">
        <Icon icon={AiMark} size={26} />
      </span>
    </button>
  )
}
