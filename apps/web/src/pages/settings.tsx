import type { ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  AppShell,
  Avatar,
  ChevronRight,
  GlassCard,
  Icon,
  ScreenHeader,
  ScreenLayout,
  cn,
} from '@pv/ui'
import { useSession } from '@/app/auth'
import {
  ACCOUNT_PATH,
  SETTINGS_GROUP_LABEL,
  useAppChrome,
  type SettingsEntry,
  type SettingsGroup,
} from '@/app/chrome'
import { ROLE_LABEL } from '@/data/users'

/** The parent list a phone picks a settings screen from.
 *
 *  From lg up the settings nav is the parent, so this path opens the reader's
 *  account instead. Reads `chrome.settings`, already cut by the same permission
 *  checks as the routes. No ContextRail (law 10): a menu, not an E1 object. */

const WIDE = '(min-width: 1280px)'
/* The account is drawn on its own card above the lists. */
const GROUPS = (Object.keys(SETTINGS_GROUP_LABEL) as SettingsGroup[]).filter((g) => g !== 'mine')

/** Hairline between rows, drawn with a shadow because borders are banned (law 4). */
const ROW_BASE =
  'hover:bg-surface-ink/6 focus-visible:outline-ring flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2'
const HAIRLINE = 'shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface-ink)_10%,transparent)]'

function Row({
  onClick,
  divided,
  children,
}: {
  onClick: () => void
  divided?: boolean
  children: ReactNode
}) {
  return (
    <button type="button" onClick={onClick} className={cn(ROW_BASE, divided && HAIRLINE)}>
      {children}
    </button>
  )
}

function Chevron() {
  return <Icon icon={ChevronRight} size={16} className="text-muted-foreground shrink-0" />
}

function EntryRow({
  entry,
  first,
  onOpen,
}: {
  entry: SettingsEntry
  first: boolean
  onOpen: () => void
}) {
  return (
    <Row onClick={onOpen} divided={!first}>
      <span className="bg-surface-ink/8 text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
        <Icon icon={entry.icon} size={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-foreground text-[15px] font-semibold">
          {entry.label}
        </span>
        {entry.description ? (
          <span className="text-muted-foreground truncate text-[12px]">{entry.description}</span>
        ) : null}
      </span>
      <Chevron />
    </Row>
  )
}

export function SettingsPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const actor = useSession((s) => s.actor)
  const account = chrome.settings.find((e) => e.group === 'mine')

  if (window.matchMedia(WIDE).matches) return <Navigate to={ACCOUNT_PATH} replace />

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader title="Cài đặt" />
        {actor && account ? (
          <GlassCard className="overflow-hidden">
            <Row onClick={() => navigate(account.path)}>
              <Avatar name={actor.name} card={false} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-display text-foreground truncate text-[15px] font-semibold">
                  {actor.name}
                </span>
                <span className="text-muted-foreground truncate text-[12px]">
                  {actor.roleIds.map((id) => ROLE_LABEL[id]).join(' · ')} · {account.label}
                </span>
              </span>
              <Chevron />
            </Row>
          </GlassCard>
        ) : null}
        {GROUPS.map((group) => {
          const entries = chrome.settings.filter((e) => e.group === group)
          if (!entries.length) return null
          return (
            <section
              key={group}
              aria-label={SETTINGS_GROUP_LABEL[group]}
              className="flex flex-col gap-2"
            >
              <h2 className="text-muted-foreground m-0 px-1 text-[12px] font-semibold">
                {SETTINGS_GROUP_LABEL[group]}
              </h2>
              <GlassCard variant="b" className="overflow-hidden">
                {entries.map((entry, i) => (
                  <EntryRow
                    key={entry.path}
                    entry={entry}
                    first={i === 0}
                    onOpen={() => navigate(entry.path)}
                  />
                ))}
              </GlassCard>
            </section>
          )
        })}
      </ScreenLayout>
    </AppShell>
  )
}

export default SettingsPage
