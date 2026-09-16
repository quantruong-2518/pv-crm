import { useEffect, useRef, useState } from 'react'
import { Lock, type IconGlyph } from '../icons'
import { SearchField, type SearchFieldProps } from '../patterns/search-field'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'
import { markBlue, markLight, wordmarkBlue, wordmarkLight } from '../assets'
import { useThemeMode } from '../ui/theme-switch'
import { AccountMenu } from './account-menu'
import { AppNav } from './app-nav'

/** O-06 · AppHeader — nav hai tầng, thay AppSidebar từ 19/08.
 *
 *  VÌ SAO BỎ NAV DỌC. Bộ mục đã vượt sức chứa của một cột: đo được 1040px nội
 *  dung trên màn cao 801px, tức mục cuối và khối người dùng nằm ngoài tầm nhìn
 *  vĩnh viễn. Nhét thêm vào cột đó chỉ đổi chỗ đau — chữ nhỏ lại, khoảng thở
 *  hẹp lại, và 232px chiều ngang vẫn mất trắng ở MỌI màn.
 *
 *  HAI TẦNG, hai câu hỏi khác nhau:
 *   · tầng 1 — "tôi là ai, tôi tìm gì, có gì đang chờ tôi": thương hiệu · ô tìm
 *     toàn cục · thông báo · người đang đăng nhập. Các lối vào ít dùng hơn
 *     (duyệt, trợ lý, quản trị và cài đặt tài khoản) nằm trong avatar dropdown.
 *     Ô tìm ở đây LÀ "Tìm toàn cục" của One Core, không phải một ô thứ hai —
 *     gom một lần, không để hai lối vào cùng một việc.
 *   · tầng 2 — "tôi đang làm ở đâu": các ứng dụng. Ứng dụng có module con thì
 *     bấm vào xổ ra, không trải sẵn. Trải sẵn là thứ đã làm nav dọc vỡ.
 *
 *  Tier 2 SCROLLS SIDEWAYS rather than wrapping: a wrapped row changes the
 *  frame's height with the entry count, and the content below would jump.
 *  Details in `app-nav.tsx`.
 *
 *  @pv/ui không biết router: `active` và `onClick` do app tính rồi truyền vào. */

export type HeaderAction = {
  icon: IconGlyph
  label: string
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
}: AppHeaderProps) {
  const themeMode = useThemeMode()
  const notificationAction = core.find((action) => action.label === 'Thông báo')
  const otherCoreActions = core.filter((action) => action !== notificationAction)
  /** Nav đã dính đỉnh màn chưa.
   *
   *  Ở trạng thái thường nav là một THẺ nền đặc: nằm trong cùng trục với main,
   *  bo góc, có bóng. Khi trang cuộn tới đúng đỉnh, nó chỉ bỏ bo góc trên; bề
   *  rộng, logo, ô tìm và các nút đều đứng nguyên chỗ.
   *
   *  Đo bằng `IntersectionObserver` trên CHÍNH nav, không bằng `scroll` +
   *  `getBoundingClientRect`: một `scroll` listener chạy mọi khung hình và mỗi
   *  lần đọc `rect` là ép trình duyệt tính lại bố cục giữa lúc đang cuộn. Phần
   *  tử được đo cũng giữ nguyên hình học ở cả hai state: bản trước animate
   *  `margin`, khiến chính header đổi bề rộng trong lúc observer đang đo nó và
   *  toàn bộ control bên trong phải layout lại từng frame — nguồn của nhịp giật.
   *
   *  Mẹo ở `rootMargin` âm 1px trên cạnh trên cộng `threshold: 1`: chừng nào
   *  nav còn nằm trọn trong vùng nhìn đã thu hẹp thì tỉ lệ giao bằng 1; lúc nó
   *  dính đỉnh, đúng 1px của nó bị dải âm đó cắt mất nên tỉ lệ tụt xuống dưới 1.
   *
   *  KHÔNG dùng một thẻ mốc riêng đặt phía trên: fragment trả về hai phần tử
   *  thì cả hai thành hai flex item của khung, và cái mốc ăn nguyên một nhịp
   *  `gap` — đo được nav bị đẩy xuống thêm 24px. */
  const [stuck, setStuck] = useState(false)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = headerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    const io = new IntersectionObserver(
      ([entry]) => setStuck((entry?.intersectionRatio ?? 1) < 1),
      {
        rootMargin: '-1px 0px 0px 0px',
        threshold: [1],
      },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <header
      ref={headerRef}
      className={cn(
        /* Header không tự mang mặt kính. Mặt nền là một layer riêng ngay dưới
           đây để nó có thể nở mà không đổi box đang chứa nội dung và không làm
           IntersectionObserver tự kích lại giữa animation. */
        'relative isolate flex flex-col',
        className,
      )}
    >
      {/* `glass-overlay` đục hẳn: chữ của nội dung đang cuộn không lọt qua nav.
          Layer tuyệt đối giữ nền tách khỏi layout; khi sticky chỉ radius đổi,
          không có bề rộng hay control nào bị kéo theo. */}
      <div
        aria-hidden
        className={cn(
          'glass-overlay pointer-events-none absolute inset-0 z-0 transition-[border-radius] duration-[var(--motion-duration)] ease-[var(--motion-ease)]',
          stuck ? 'rounded-b-lg rounded-t-none' : 'rounded-lg',
        )}
      />

      {/* ---- Tầng 1 · tôi là ai · tôi tìm gì · gì đang chờ tôi ----
          Outer columns `1fr` from `md`, so search sits on the true centre however
          wide brand and account are. `z-[2]` so the account menu paints over tier 2. */}
      <div className="relative z-[2] grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 md:grid-cols-[1fr_minmax(0,560px)_1fr] lg:gap-4">
        <div className="flex items-center">
          {/* One brand read at two widths, not two logos: the wordmark already
              contains the square mark, so the short one is only what is left
              when there is no room for the name. Under `md`, every horizontal
              pixel belongs to search. */}
          <img
            src={themeMode === 'stone' ? markBlue : markLight}
            alt={product}
            className="size-9 shrink-0 object-contain md:hidden"
          />
          <img
            src={themeMode === 'stone' ? wordmarkBlue : wordmarkLight}
            alt={product}
            className="hidden h-7 shrink-0 object-contain md:block"
          />
        </div>

        <SearchField className="w-full" {...search} />

        <div className="flex items-center justify-end gap-2">
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

      {/* A hairline, not a border: the two tiers answer different questions and
          used to run together into one undivided slab. */}
      <div aria-hidden className="bg-surface-ink/10 relative z-[1] mx-4 h-px" />

      {/* ---- Tầng 2 · tôi đang làm ở đâu ---- */}
      <AppNav groups={apps} />
    </header>
  )
}
