import { Lock, type IconGlyph } from '../icons'
import { SearchField, type SearchFieldProps } from '../patterns/search-field'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'
import { markBlue, markLight, wordmarkBlue, wordmarkLight } from '../assets'
import { useThemeMode } from '../ui/theme-switch'
import { AccountMenu } from './account-menu'
import { AppNav } from './app-nav'

/** O-06 · AppHeader — the whole nav in ONE row from `lg`, replacing the two tiers.
 *
 *  Brand (home) · apps · search · approvals · notifications · account. Two tiers
 *  spent 112px of every screen on a map most people read once; one row gives
 *  that height back to the content and puts the screen's own title right under
 *  the nav. Below `lg` the apps drop to a second, sideways-scrolling row —
 *  BottomNav carries only One Core, so the apps cannot simply disappear there.
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
function CountBadge({ count }: { count: number }) {
  return (
    <span className="bg-destructive text-primary-foreground absolute -right-1 -top-1 min-w-[17px] rounded-full px-1 text-center text-[10px] font-semibold leading-[17px]">
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** Một mục tầng 1. Icon-only từ `lg` xuống để nhường chỗ cho ô tìm; tên vẫn ở
 *  `aria-label` nên trình đọc màn hình và tooltip đều còn chữ.
 *
 *  `locked` theo đúng tiền lệ `patterns/nav-item.tsx`: nút tắt, không hover, ổ
 *  khoá 14 đứng chỗ badge số, và độ mờ chỉ đặt lên ICON. Bản trước phủ
 *  `opacity-45` lên cả nút — đo được 2,29:1, dưới ngưỡng 4,5:1 của luật 13. */
function CoreButton({ action, unread }: { action: HeaderAction; unread?: boolean }) {
  return (
    <button
      type="button"
      title={action.label}
      aria-label={action.label}
      aria-current={action.active ? 'page' : undefined}
      disabled={action.locked}
      onClick={action.onClick}
      className={cn(
        'motion-std relative flex size-10 shrink-0 items-center justify-center rounded-md',
        action.active ? 'bg-primary/15 text-on-tint-primary' : 'text-muted-foreground',
        action.locked ? 'cursor-not-allowed' : 'hover:bg-surface-ink/10',
      )}
    >
      <Icon icon={action.icon} size={17} className={cn(action.locked && 'opacity-55')} />
      {action.locked ? (
        <span className="text-muted-foreground absolute -right-1 -top-1">
          <Icon icon={Lock} size={14} className="opacity-55" />
          <span className="sr-only">chưa mở</span>
        </span>
      ) : action.count ? (
        <CountBadge count={action.count} />
      ) : unread ? (
        <span
          aria-hidden
          className="bg-destructive ring-background absolute right-0.5 top-0.5 size-2 rounded-full ring-2"
        />
      ) : null}
    </button>
  )
}

/** Approvals keep their name in the row from `2xl`: it is the one Core entry
 *  that asks something of the reader, and a bare icon hides what the count counts. */
function ApprovalsButton({ action }: { action: HeaderAction }) {
  return (
    <button
      type="button"
      title={action.label}
      aria-label={action.count ? `${action.label} · ${action.count} đang chờ` : action.label}
      aria-current={action.active ? 'page' : undefined}
      disabled={action.locked}
      onClick={action.onClick}
      className={cn(
        'motion-std pointer-coarse:h-12 flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-[12.5px]',
        action.active
          ? 'bg-primary/15 text-on-tint-primary font-semibold'
          : 'text-foreground hover:bg-surface-ink/10',
        action.locked && 'cursor-not-allowed',
      )}
    >
      <Icon icon={action.icon} size={16} className="text-muted-foreground" />
      <span className="hidden 2xl:inline">{action.label}</span>
      {action.count ? (
        <span className="bg-warning/20 text-on-tint-warning-strong tnum min-w-[18px] rounded-sm px-1 text-center text-[11px] font-semibold leading-[18px]">
          {action.count > 99 ? '99+' : action.count}
        </span>
      ) : null}
    </button>
  )
}

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
  return (
    <header className={cn('relative isolate flex flex-col', className)}>
      {/* A full-bleed bar with no radius, so nothing changes when it sticks.
          `glass-overlay` is opaque: scrolling text does not show through. */}
      <div aria-hidden className="glass-overlay pointer-events-none absolute inset-0 z-0" />

      <div
        className={cn(
          'relative z-[2] flex min-h-16 flex-wrap items-center gap-x-3 lg:flex-nowrap lg:gap-x-4',
          frameClassName,
        )}
      >
        <button
          type="button"
          onClick={home?.onClick}
          aria-label={home?.label ?? product}
          aria-current={home?.active ? 'page' : undefined}
          className="flex h-16 shrink-0 items-center"
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

        <AppNav
          groups={apps}
          className="order-last basis-full lg:order-none lg:min-w-0 lg:flex-1 lg:basis-auto"
        />

        <SearchField
          className="min-w-0 flex-1 lg:w-[200px] lg:flex-none 2xl:w-[280px]"
          {...search}
        />

        <div className="flex shrink-0 items-center justify-end gap-2">
          {approvals ? <ApprovalsButton action={approvals} /> : null}
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
