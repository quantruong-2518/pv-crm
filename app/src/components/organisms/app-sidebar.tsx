import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { NavItem } from '@/components/patterns/nav-item'
import { Kicker } from '@/components/ui/separator'
import { cn } from '@/lib/cn'
import markLight from '@/assets/mark-light.png'

/** O-01 · AppSidebar — w-[232px].
 *  Logo 32 · NavItem[] · Kicker nhóm.
 *  Mặt kính nhạt hơn .glass-a một bậc (white/6.5) để nav lùi sau nội dung. */
export type SidebarItem = {
  icon: LucideIcon
  label: string
  active?: boolean
  count?: number
}

export type SidebarGroup = {
  /** nhãn mono uppercase phía trên nhóm, ví dụ "Ứng dụng" */
  kicker?: string
  items: SidebarItem[]
}

export type AppSidebarProps = {
  /** tên sản phẩm trung tâm — luôn "PV One" (luật 14 · CLAUDE.md) */
  product: string
  /** tên công ty đang đăng nhập */
  org: string
  groups: SidebarGroup[]
  /** khối cố định đáy sidebar, ví dụ "Admin & audit log" — đẩy xuống bằng mt-auto */
  footer?: ReactNode
  className?: string
}

export function AppSidebar({ product, org, groups, footer, className }: AppSidebarProps) {
  return (
    <nav
      aria-label="Điều hướng chính"
      className={cn(
        'glass-a flex w-[232px] flex-col gap-1 rounded-lg bg-white/[6.5%] px-3.5 py-5',
        className,
      )}
    >
      <div className="flex items-center gap-2.5 px-2 pt-0.5 pb-4">
        <img src={markLight} alt="" className="-m-0.5 size-8 shrink-0 object-contain" />
        <div>
          <b className="font-display text-[14px]">{product}</b>
          <small className="block text-[10.5px] font-normal text-muted-foreground">{org}</small>
        </div>
      </div>

      {groups.map((group, gi) => (
        <div key={group.kicker ?? gi} className="contents">
          {group.kicker && (
            <Kicker tone="muted" className="px-3 pt-4 pb-1.5 tracking-[.2em]">
              {group.kicker}
            </Kicker>
          )}
          {group.items.map((item) => (
            <NavItem key={item.label} {...item} />
          ))}
        </div>
      ))}

      {footer && <div className="mt-auto">{footer}</div>}
    </nav>
  )
}
