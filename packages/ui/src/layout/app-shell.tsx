import type { ReactNode } from 'react'
import { AuroraField } from '../layout/aurora-field'
import { AssistantFab } from '../layout/assistant-fab'
import { AppSidebar, type AppSidebarProps } from '../organisms/app-sidebar'
import { TopBar, type TopBarProps } from '../organisms/top-bar'
import { BottomNav, type BottomNavKey } from '../organisms/bottom-nav'
import { cn } from '../lib/cn'

/** AppShell — khung màn, mobile-first (T-01 ở ≥ lg, 1024px).
 *  < lg: không Sidebar, không FAB — BottomNav (Home·Duyệt·Tìm·Trợ lý) thay
 *  cả hai. ≥ lg: Sidebar 232 · gutter 24 · margin 32 · FAB Trợ lý AI nổi.
 *  docs/luat-thiet-ke.md §4: đây là component dựng trước tiên, mọi màn ngồi bên trong nó. */
export type AppShellProps = {
  sidebar: AppSidebarProps
  topbar: TopBarProps
  /** mục đang active trên BottomNav (< lg) */
  activeNav: BottomNavKey
  approvalsCount?: number
  children: ReactNode
  /** Màn "vừa màn hình": ≥ lg khung ngoài cao đúng một màn và KHÔNG cuộn ở tầng
   *  trang — màn tự cuộn bên trong các khối của nó (thường là hai grid chính).
   *
   *  Chỉ áp từ `lg` trở lên, và đó là chủ ý: dưới `lg` không có Sidebar, có
   *  BottomNav 84px + safe-area, nội dung xếp một cột dài. Ép `h-screen` ở đó
   *  là cắt cụt màn trên điện thoại. Mobile cuộn trang như thường.
   *
   *  Mặc định `false` — mọi màn đang có giữ nguyên hành vi cũ. */
  fill?: boolean
  onOpenAssistant?: () => void
  onNavigate?: (key: BottomNavKey) => void
}

export function AppShell({
  sidebar,
  topbar,
  activeNav,
  approvalsCount,
  children,
  fill = false,
  onOpenAssistant,
  onNavigate,
}: AppShellProps) {
  return (
    <AuroraField>
      <div
        className={cn(
          'relative z-[1] flex min-h-screen gap-4 p-4 pb-[calc(84px+env(safe-area-inset-bottom)+24px)] lg:gap-6 lg:p-8 lg:pb-8',
          fill && 'lg:h-screen lg:overflow-hidden',
        )}
      >
        <AppSidebar {...sidebar} className="hidden shrink-0 lg:flex" />
        <div className={cn('flex min-w-0 flex-1 flex-col gap-4 lg:gap-6', fill && 'lg:min-h-0')}>
          <TopBar {...topbar} />
          {/* min-h-0 là điều kiện để overflow-hidden có tác dụng trong flex column:
              không có nó, item flex-1 nở theo nội dung thay vì theo khung. */}
          <main className={cn('flex-1', fill && 'lg:min-h-0 lg:overflow-hidden')}>{children}</main>
        </div>
      </div>

      <AssistantFab onClick={onOpenAssistant} className="hidden lg:flex" />

      <BottomNav
        active={activeNav}
        approvalsCount={approvalsCount}
        onNavigate={(key) => (key === 'assistant' ? onOpenAssistant?.() : onNavigate?.(key))}
      />
    </AuroraField>
  )
}
