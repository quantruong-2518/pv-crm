import { AppShell, EmptyState, Icon, ScreenHeader, ScreenLayout, ShieldCheck } from '@pv/ui'
import { useNavigate } from 'react-router-dom'
import { useAppChrome } from '@/app/chrome'

/** One Core · the door behind the avatar menu's settings entry.
 *
 *  Reads `chrome.settings`, already cut by the same permission checks as the
 *  routes, so a role sees only the screens it can open. No ContextRail (law 10):
 *  this is a menu, not an E1 object. */
export function SettingsPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker="One Core"
          title="Cài đặt & quản trị"
          description="Người dùng, vai trò và các danh mục định hình cách cả đội làm việc."
        />
        {chrome.settings.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            message="Vai trò của bạn không có màn cài đặt nào."
            action={{ label: 'Về trang chủ', onClick: () => navigate('/') }}
            className="py-12"
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {chrome.settings.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  onClick={() => navigate(entry.path)}
                  className="glass-a hover:bg-surface-ink/6 focus-visible:outline-ring flex w-full items-start gap-3 rounded-lg p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <Icon icon={entry.icon} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-display text-[15px] font-semibold">{entry.label}</span>
                    <span className="text-muted-foreground text-[12px]">{entry.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default SettingsPage
