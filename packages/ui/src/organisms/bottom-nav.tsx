import type { LucideIcon } from 'lucide-react'
import { House, Orbit, Search, SquareCheckBig } from 'lucide-react'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** O-07 · BottomNav — thay Sidebar dưới lg (1024px).
 *  Bốn mục cố định theo "Ba thiết bị là ba vai" (CLAUDE.md): Home · Duyệt ·
 *  Tìm · Trợ lý. Cao 84 + safe-area đáy — không cấu hình được danh sách mục,
 *  đây là điều hướng CHỐT, không phải sidebar rút gọn. */
export type BottomNavKey = 'home' | 'approvals' | 'search' | 'assistant'

const ITEMS: { key: BottomNavKey; icon: LucideIcon; label: string }[] = [
  { key: 'home', icon: House, label: 'Home' },
  { key: 'approvals', icon: SquareCheckBig, label: 'Approvals' },
  { key: 'search', icon: Search, label: 'Search' },
  { key: 'assistant', icon: Orbit, label: 'Assistant' },
]

export type BottomNavProps = {
  active: BottomNavKey
  /** số việc chờ duyệt — 0 hoặc undefined thì không vẽ badge */
  approvalsCount?: number
  onNavigate?: (key: BottomNavKey) => void
  className?: string
}

export function BottomNav({ active, approvalsCount, onNavigate, className }: BottomNavProps) {
  return (
    <nav
      aria-label="Điều hướng chính"
      className={cn(
        'glass-b fixed inset-x-0 bottom-0 z-10 flex items-center justify-around px-2 lg:hidden',
        'h-[calc(84px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]',
        className,
      )}
    >
      {ITEMS.map((item) => {
        const active_ = item.key === active
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onNavigate?.(item.key)}
            aria-current={active_ ? 'page' : undefined}
            className={cn(
              'motion-std relative flex h-12 min-w-16 flex-col items-center justify-center gap-1 rounded-md px-3',
              active_ ? 'text-accent-foreground' : 'text-muted-foreground',
            )}
          >
            <Icon
              icon={item.icon}
              size={20}
              className={active_ ? 'text-accent-foreground' : undefined}
            />
            <span className="text-[10px] font-medium">{item.label}</span>
            {item.key === 'approvals' && Boolean(approvalsCount) && (
              <span className="bg-destructive text-primary-foreground absolute right-2 top-0 rounded-sm px-[5px] py-px text-[9.5px] font-semibold">
                {approvalsCount}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
