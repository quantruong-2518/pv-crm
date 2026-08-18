import type { ReactNode } from 'react'
import { AuroraField } from '@/components/layout/aurora-field'
import { AssistantFab } from '@/components/layout/assistant-fab'
import { AppSidebar, type AppSidebarProps } from '@/components/organisms/app-sidebar'
import { TopBar, type TopBarProps } from '@/components/organisms/top-bar'

/** AppShell — khung màn desktop 1440×900 (T-01).
 *  Sidebar 232 · gutter 24 · margin 32 · aurora field 4 lớp · FAB Trợ lý AI.
 *  AGENTS.md §4: đây là component dựng trước tiên, mọi màn ngồi bên trong nó. */
export type AppShellProps = {
  sidebar: AppSidebarProps
  topbar: TopBarProps
  children: ReactNode
  onOpenAssistant?: () => void
}

export function AppShell({ sidebar, topbar, children, onOpenAssistant }: AppShellProps) {
  return (
    <AuroraField>
      <div className="relative z-[1] flex min-h-screen gap-6 p-8">
        <AppSidebar {...sidebar} className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <TopBar {...topbar} />
          <main className="flex-1">{children}</main>
        </div>
      </div>
      <AssistantFab onClick={onOpenAssistant} />
    </AuroraField>
  )
}
