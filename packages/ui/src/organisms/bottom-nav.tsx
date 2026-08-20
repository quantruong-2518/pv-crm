import type { LucideIcon } from 'lucide-react'
import { House, Lock, Orbit, Search, SquareCheckBig } from 'lucide-react'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** O-07 · BottomNav — thay Sidebar dưới lg (1024px).
 *  Bốn mục cố định theo "Ba thiết bị là ba vai" (docs/luat-thiet-ke.md): Home · Duyệt ·
 *  Tìm · Trợ lý. Cao 84 + safe-area đáy — không cấu hình được danh sách mục,
 *  đây là điều hướng CHỐT, không phải sidebar rút gọn.
 *
 *  Cấu hình được ĐÚNG một thứ: mục nào đang khoá. Ba trong bốn màn của bộ này
 *  chưa dựng, mà một mục bấm không ra gì tệ hơn một mục nói thẳng là chưa mở. */
export type BottomNavKey = 'home' | 'approvals' | 'search' | 'assistant'

const ITEMS: { key: BottomNavKey; icon: LucideIcon; label: string }[] = [
  /* Luật 14: năng lực bên trong luôn tiếng Việt — chỉ TÊN NHÁNH (Sales ·
     Supply · Factory · Finance) mới giữ tiếng Anh. Bốn mục này là One Core. */
  { key: 'home', icon: House, label: 'Trang chủ' },
  { key: 'approvals', icon: SquareCheckBig, label: 'Duyệt' },
  { key: 'search', icon: Search, label: 'Tìm' },
  { key: 'assistant', icon: Orbit, label: 'Trợ lý' },
]

export type BottomNavProps = {
  /** Mục đang đứng. Vắng mặt là câu trả lời hợp lệ: màn nhánh (`/sales/*`)
   *  không thuộc bốn mục One Core nào, và bịa một mục sáng ở đó là nói dối
   *  người dùng bằng `aria-current`. */
  active?: BottomNavKey
  /** số việc chờ duyệt — 0 hoặc undefined thì không vẽ badge */
  approvalsCount?: number
  /** mục chưa có màn — nút tắt, ổ khoá 14 đứng chỗ badge số */
  locked?: BottomNavKey[]
  onNavigate?: (key: BottomNavKey) => void
  className?: string
}

export function BottomNav({
  active,
  approvalsCount,
  locked,
  onNavigate,
  className,
}: BottomNavProps) {
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
        const locked_ = Boolean(locked?.includes(item.key))
        return (
          <button
            key={item.key}
            type="button"
            disabled={locked_}
            onClick={() => onNavigate?.(item.key)}
            aria-current={active_ ? 'page' : undefined}
            className={cn(
              'motion-std relative flex h-12 min-w-16 flex-col items-center justify-center gap-1 rounded-md px-3',
              active_ && !locked_ ? 'text-accent-foreground' : 'text-muted-foreground',
              locked_ && 'cursor-not-allowed',
            )}
          >
            {/* Chỉ ICON mờ. Chữ ở lại `--muted-foreground` — luật 13 đòi
                ≥ 4,5:1, và một nhãn 10px đã mờ sẵn thì dìm thêm là mất hẳn.
                Tiền lệ: `patterns/nav-item.tsx`. */}
            <Icon
              icon={item.icon}
              size={20}
              className={cn(
                active_ && !locked_ && 'text-accent-foreground',
                locked_ && 'opacity-55',
              )}
            />
            <span className="text-[10px] font-medium">{item.label}</span>
            {locked_ ? (
              <span className="text-muted-foreground absolute right-2 top-0">
                <Icon icon={Lock} size={14} className="opacity-55" />
                <span className="sr-only">chưa mở</span>
              </span>
            ) : item.key === 'approvals' && Boolean(approvalsCount) ? (
              <span className="bg-destructive text-primary-foreground absolute right-2 top-0 rounded-sm px-[5px] py-px text-[9.5px] font-semibold">
                {approvalsCount}
              </span>
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}
