import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppShell, ArrowLeft, Button, Icon, NavItem, ScreenLayout } from '@pv/ui'
import {
  SETTINGS_GROUP_LABEL,
  SETTINGS_PATH,
  useAppChrome,
  type SettingsEntry,
  type SettingsGroup,
} from '@/app/chrome'

/** The one frame of every settings screen: the nav on the left is the parent,
 *  the screen opens beside it, so moving between them is sideways and needs no
 *  back button. Below xl the wide tables need the room, so the nav gives way and so a back link to the
 *  `/settings` list takes its place — that list is the parent on a phone.
 *
 *  `subNav` hangs under the active entry; Sales setup puts its areas there,
 *  and the lit sub-item then carries the place instead of the entry.
 *  No ContextRail (law 10) and no background of its own (law 12). */

const GROUPS = Object.keys(SETTINGS_GROUP_LABEL) as SettingsGroup[]

/** The longest matching path wins, so the mail book under `/sales/config/…`
 *  lights its own entry rather than Sales setup. */
function activeSetting(entries: readonly SettingsEntry[], pathname: string) {
  return entries
    .filter((e) => pathname === e.path || pathname.startsWith(`${e.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]
}

export function SettingsShell({
  children,
  subNav,
  searchPlaceholder,
}: {
  children: ReactNode
  subNav?: ReactNode
  searchPlaceholder?: string
}) {
  const chrome = useAppChrome({ searchPlaceholder })
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const active = activeSetting(chrome.settings, pathname)

  return (
    <AppShell {...chrome.shell}>
      <div className="flex w-full min-w-0 items-start gap-6">
        <nav
          aria-label="Cài đặt"
          className="glass-b hidden w-[264px] shrink-0 flex-col gap-1 overflow-y-auto rounded-lg p-3 xl:sticky xl:top-[88px] xl:flex xl:max-h-[calc(100dvh-112px)]"
        >
          <p className="font-display text-foreground m-0 px-3 pb-1 pt-2 text-[18px] font-semibold">
            Cài đặt
          </p>
          {GROUPS.map((group) => {
            const entries = chrome.settings.filter((e) => e.group === group)
            if (!entries.length) return null
            return (
              <div key={group} role="group" aria-label={SETTINGS_GROUP_LABEL[group]}>
                <p className="text-glass-foreground m-0 px-3 pb-1 pt-4 text-[12px] font-semibold">
                  {SETTINGS_GROUP_LABEL[group]}
                </p>
                <div className="flex flex-col gap-1">
                  {entries.map((entry) => (
                    <div key={entry.path} className="flex flex-col gap-1">
                      <NavItem
                        icon={entry.icon}
                        label={entry.label}
                        active={entry === active && !subNav}
                        onClick={() => navigate(entry.path)}
                        className="pointer-coarse:h-12"
                      />
                      {entry === active ? subNav : null}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="pointer-coarse:h-12 self-start xl:hidden"
            onClick={() => navigate(SETTINGS_PATH)}
          >
            <Icon icon={ArrowLeft} size={16} />
            Cài đặt
          </Button>
          <ScreenLayout>{children}</ScreenLayout>
        </div>
      </div>
    </AppShell>
  )
}
