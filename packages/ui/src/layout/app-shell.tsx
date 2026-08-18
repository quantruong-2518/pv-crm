import type { ReactNode } from 'react'
import { AuroraField } from '../layout/aurora-field'
import { AssistantFab } from '../layout/assistant-fab'
import { AppSidebar, type AppSidebarProps } from '../organisms/app-sidebar'
import { TopBar, type TopBarProps } from '../organisms/top-bar'
import { BottomNav, type BottomNavKey } from '../organisms/bottom-nav'

/** AppShell — khung màn, mobile-first (T-01 ở ≥ lg, 1024px).
 *  < lg: không Sidebar, không FAB — BottomNav (Home·Duyệt·Tìm·Trợ lý) thay
 *  cả hai. ≥ lg: Sidebar 232 · gutter 24 · margin 32 · FAB Trợ lý AI nổi.
 *  AGENTS.md §4: đây là component dựng trước tiên, mọi màn ngồi bên trong nó. */
export type AppShellProps = {
  sidebar: AppSidebarProps
  topbar: TopBarProps
  /** mục đang active trên BottomNav (< lg) */
  activeNav: BottomNavKey
  approvalsCount?: number
  children: ReactNode
  onOpenAssistant?: () => void
  onNavigate?: (key: BottomNavKey) => void
}

export function AppShell({
  sidebar,
  topbar,
  activeNav,
  approvalsCount,
  children,
  onOpenAssistant,
  onNavigate,
}: AppShellProps) {
  return (
    <AuroraField>
      <div className="relative z-[1] flex min-h-screen gap-4 p-4 pb-[calc(84px+env(safe-area-inset-bottom)+24px)] lg:gap-6 lg:p-8 lg:pb-8">
        <AppSidebar {...sidebar} className="hidden shrink-0 lg:flex" />
        <div className="flex min-w-0 flex-1 flex-col gap-4 lg:gap-6">
          <TopBar {...topbar} />
          <main className="flex-1">{children}</main>
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
