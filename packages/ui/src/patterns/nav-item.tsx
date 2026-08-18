import type { LucideIcon } from 'lucide-react'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-06 · NavItem — h-[38px] rounded-md · active = bg-accent · badge số dùng bg-destructive.
 *  Icon 16 trong nút, nhưng trong nav dùng 16 để khớp chiều cao 38px của theme kit. */
export type NavItemProps = {
  icon: LucideIcon
  label: string
  active?: boolean
  /** số việc chờ — 0 hoặc undefined thì không vẽ badge */
  count?: number
  onClick?: () => void
  className?: string
}

export function NavItem({ icon, label, active, count, onClick, className }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'motion-std flex h-[38px] w-full items-center gap-2.5 rounded-md px-3 text-left text-[13.5px]',
        active
          ? 'bg-accent text-foreground shadow-[inset_0_1px_0_var(--sheen-ai)]'
          : 'text-muted-foreground hover:bg-white/6',
        className,
      )}
    >
      <Icon icon={icon} size={16} className={active ? 'text-accent-foreground' : undefined} />
      {label}
      {count ? (
        <span className="bg-destructive text-primary-foreground ml-auto rounded-sm px-[7px] py-px text-[10.5px] font-semibold">
          {count}
        </span>
      ) : null}
    </button>
  )
}
