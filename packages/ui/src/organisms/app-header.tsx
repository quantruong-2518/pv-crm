import { useState } from 'react'
import { Lock, type IconGlyph } from '../icons'
import type { SearchFieldProps } from '../patterns/search-field'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'
import { markBlue, markLight, wordmarkBlue, wordmarkLight } from '../assets'
import { useThemeMode } from '../ui/theme-switch'
import { AccountMenu } from './account-menu'
import { AppNav } from './app-nav'
import { HeaderSearch } from './header-search'

/** O-06 · AppHeader — the whole nav in ONE row from `lg`, replacing the two tiers.
 *
 *  Three clusters a 24px step apart, a hairline between them: brand + apps,
 *  search, tools (approvals · notifications · account). Two tiers spent 112px
 *  of every screen on a map most people read once; one row gives that height
 *  back to the content. Below `lg` the apps drop to a second, sideways-scrolling
 *  row — BottomNav carries only One Core, so the apps cannot simply disappear.
 *
 *  Entries are picked out of `core` by `slot`: home becomes the brand button,
 *  approvals and notifications stand in the row, the rest go to the avatar.
 *
 *  @pv/ui does not know the router: `active` and `onClick` come from the app. */

export type HeaderAction = {
  icon: IconGlyph
  label: string
  /** Where the entry stands in the row. Without one it goes to the avatar menu. */
  slot?: 'home' | 'approvals' | 'notifications'
  /** số việc đang chờ — hiện thành huy hiệu trên icon */
  count?: number
  active?: boolean
  /** chưa mở — nút tắt và hiện ổ khoá */
  locked?: boolean
  onClick?: () => void
}

export type HeaderApp = {
  icon: IconGlyph
  label: string
  /** Một câu nói đúng việc khu vực này làm; hiện trong tooltip và tên hỗ trợ. */
  description?: string
  active?: boolean
  locked?: boolean
  onClick?: () => void
  /** Module con. Có thì mục này xổ dropdown thay vì đi thẳng. */
  items?: HeaderAction[]
  /** Work waiting on the viewer inside this module, drawn like the approvals count. */
  count?: number
}

export type AppHeaderProps = {
  /** tên sản phẩm trung tâm — luôn "PV One" (luật 14) */
  product: string
  /** công ty đang đăng nhập */
  org: string
  /** One Core — tầng 1 */
  core: HeaderAction[]
  /** Tier 2, in groups — a hairline separates each group from the next. */
  apps: HeaderApp[][]
  user: { name: string; initials?: string; role?: string }
  unread?: boolean
  assistantLabel?: string
  search?: Pick<SearchFieldProps, 'placeholder' | 'meta'>
  /** Account rows at the bottom of the avatar menu, below the theme row. Data,
   *  not a ReactNode, so every row keeps the menu's one shape. */
  accountActions?: HeaderAction[]
  onOpenAssistant?: () => void
  className?: string
  /** Width and side padding of the row inside the full-bleed bar — the shell
   *  passes main's own axis, so the brand lines up with the page title. */
  frameClassName?: string
}

/** Huy hiệu số việc chờ. Ngồi trên icon chứ không đứng cạnh chữ: tầng 1 là hàng
 *  icon, một con số đứng cạnh sẽ đội chiều ngang của cả hàng lên. */
function CountBadge({ count, tone }: { count: number; tone: 'primary' | 'destructive' }) {
  return (
    <span
      className={cn(
        'text-primary-foreground ring-popover absolute right-0.5 top-0.5 min-w-4 rounded-full px-1 text-center text-[11px] font-semibold leading-4 ring-2',
        tone === 'primary' ? 'bg-primary' : 'bg-destructive',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function Hairline({ className }: { className?: string }) {
  return <span aria-hidden className={cn('bg-surface-ink/10 h-6 w-px shrink-0', className)} />
}

/** A tool in the right-hand cluster: icon only, with the name in `title` and
 *  `aria-label`. Approvals wears its count as a badge, notifications a dot.
 *
 *  `locked` follows `patterns/nav-item.tsx`: disabled, no hover, a padlock where
 *  the badge would sit, and the dimming on the ICON alone — dimming the whole
 *  button measured 2.29:1, under law 13's 4.5:1. */
function CoreButton({ action, unread }: { action: HeaderAction; unread?: boolean }) {
  return (
    <button
      type="button"
      title={action.label}
      aria-label={action.count ? `${action.label} · ${action.count} đang chờ` : action.label}
      aria-current={action.active ? 'page' : undefined}
      disabled={action.locked}
      onClick={action.onClick}
      className={cn(
        'motion-std pointer-coarse:size-12 relative flex size-10 shrink-0 items-center justify-center rounded-md',
        action.active ? 'bg-primary/15 text-on-tint-primary' : 'text-foreground/80',
        action.locked ? 'cursor-not-allowed' : 'hover:bg-surface-ink/10 hover:text-foreground',
      )}
    >
      <Icon icon={action.icon} size={18} className={cn(action.locked && 'opacity-55')} />
      {action.locked ? (
        <span className="text-muted-foreground absolute right-0.5 top-0.5">
          <Icon icon={Lock} size={14} className="opacity-55" />
          <span className="sr-only">chưa mở</span>
        </span>
      ) : action.count ? (
        <CountBadge
          count={action.count}
          tone={action.slot === 'approvals' ? 'primary' : 'destructive'}
        />
      ) : unread ? (
        <span
          aria-hidden
          className="bg-destructive ring-popover absolute right-1.5 top-1.5 size-2 rounded-full ring-2"
        />
      ) : null}
    </button>
  )
}

/** What the rest of the row does while the search is open (from `lg`). */
const dim =
  'transition-[filter,opacity] duration-300 lg:group-data-[search=open]/hd:pointer-events-none lg:group-data-[search=open]/hd:opacity-35 lg:group-data-[search=open]/hd:blur-[6px]'

export function AppHeader({
  product,
  org,
  core,
  apps,
  user,
  unread,
  assistantLabel = 'Trợ lý',
  search,
  accountActions,
  onOpenAssistant,
  className,
  frameClassName,
}: AppHeaderProps) {
  const themeMode = useThemeMode()
  const home = core.find((action) => action.slot === 'home')
  const approvals = core.find((action) => action.slot === 'approvals')
  const notificationAction = core.find((action) => action.slot === 'notifications')
  const otherCoreActions = core.filter((action) => !action.slot)
  const [searchOpen, setSearchOpen] = useState(false)
  const targets = apps.flat().flatMap((app) => (app.items?.length ? app.items : [app]))
  return (
    <header
      data-search={searchOpen ? 'open' : 'closed'}
      className={cn('group/hd relative isolate flex flex-col', className)}
    >
      {/* A full-bleed bar with no radius, so nothing changes when it sticks.
          `glass-overlay` is opaque: scrolling text does not show through. */}
      <div aria-hidden className="glass-overlay pointer-events-none absolute inset-0 z-0" />
      {/* Veil over the page while the search is open. It starts under the bar. */}
      <div
        aria-hidden
        className={cn(
          'bg-background/55 absolute inset-x-0 top-full z-[1] h-screen backdrop-blur-sm transition-opacity duration-300 max-lg:hidden',
          searchOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <div
        className={cn(
          'relative z-[2] flex min-h-16 flex-wrap items-center gap-x-3 lg:flex-nowrap lg:gap-x-6',
          frameClassName,
        )}
      >
        <button
          type="button"
          onClick={home?.onClick}
          aria-label={home?.label ?? product}
          aria-current={home?.active ? 'page' : undefined}
          className={cn('flex h-16 shrink-0 items-center', dim)}
        >
          {/* One brand at two widths: the wordmark already holds the mark. */}
          <img
            src={themeMode === 'stone' ? markBlue : markLight}
            alt=""
            className="size-9 shrink-0 object-contain md:hidden"
          />
          <img
            src={themeMode === 'stone' ? wordmarkBlue : wordmarkLight}
            alt=""
            className="hidden h-6 shrink-0 object-contain md:block"
          />
        </button>
        <Hairline className={cn('max-lg:hidden', dim)} />

        <AppNav
          groups={apps}
          className={cn(
            'order-last basis-full lg:order-none lg:min-w-0 lg:shrink lg:basis-auto',
            dim,
          )}
        />

        <div className="flex min-w-0 flex-1 items-center lg:ml-auto lg:flex-none lg:gap-6">
          <HeaderSearch
            placeholder={search?.placeholder}
            targets={targets}
            onOpenChange={setSearchOpen}
          />
          <Hairline className={cn('max-lg:hidden', dim)} />
        </div>

        <div className={cn('flex shrink-0 items-center justify-end gap-2', dim)}>
          {approvals ? <CoreButton action={approvals} /> : null}
          {notificationAction ? <CoreButton action={notificationAction} unread={unread} /> : null}
          {unread ? <span className="sr-only">có thông báo chưa đọc</span> : null}
          <AccountMenu
            user={user}
            org={org}
            destinations={otherCoreActions}
            assistantLabel={assistantLabel}
            onOpenAssistant={onOpenAssistant}
            actions={accountActions}
          />
        </div>
      </div>
    </header>
  )
}
