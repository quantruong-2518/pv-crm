import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Lock, Orbit, type IconGlyph } from '../icons'
import { SearchField, type SearchFieldProps } from '../patterns/search-field'
import { Avatar } from '../ui/avatar'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'
import { markBlue, markLight, wordmarkBlue, wordmarkLight } from '../assets'
import { useThemeMode } from '../ui/theme-switch'

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
 *  Tầng 2 CUỘN NGANG dưới `lg`. Chín ứng dụng không xếp vừa màn điện thoại, mà
 *  xuống dòng thì chiều cao khung đổi theo số mục — khung phải cao cố định để
 *  nội dung bên dưới không nhảy.
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
  /** ứng dụng — tầng 2 */
  apps: HeaderApp[]
  user: { name: string; initials?: string; role?: string }
  unread?: boolean
  assistantLabel?: string
  search?: Pick<SearchFieldProps, 'placeholder' | 'meta'>
  /** các hành động tài khoản — hiện trong dropdown của avatar */
  userAction?: ReactNode
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

/** Bản có chữ của một mục Core khi nó nằm trong menu tài khoản. Giữ cùng trạng
 * thái active/locked với nút icon trên header nhưng cho người dùng đủ ngữ cảnh
 * để chọn đúng nơi mình muốn đi. */
function AccountAction({ action, onSelect }: { action: HeaderAction; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={action.locked}
      aria-current={action.active ? 'page' : undefined}
      onClick={() => {
        onSelect()
        action.onClick?.()
      }}
      className={cn(
        'motion-std flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-left text-[12.5px]',
        action.active
          ? 'bg-primary/15 text-on-tint-primary font-semibold'
          : 'text-muted-foreground',
        action.locked ? 'cursor-not-allowed' : 'hover:bg-surface-ink/10 hover:text-foreground',
      )}
    >
      <span className="bg-surface-ink/9 relative flex size-7 shrink-0 items-center justify-center rounded-sm">
        <Icon icon={action.icon} size={16} className={cn(action.locked && 'opacity-55')} />
        {action.count ? <CountBadge count={action.count} /> : null}
      </span>
      <span className="flex-1">{action.label}</span>
      {action.locked ? (
        <>
          <Icon icon={Lock} size={14} className="opacity-55" />
          <span className="sr-only">chưa mở</span>
        </>
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
  userAction,
  onOpenAssistant,
  className,
}: AppHeaderProps) {
  const themeMode = useThemeMode()
  const uid = useId()
  const notificationAction = core.find((action) => action.label === 'Thông báo')
  const otherCoreActions = core.filter((action) => action !== notificationAction)
  /** Ứng dụng đang xổ module con. Một lúc chỉ một — hai dropdown cùng mở thì
   *  người dùng không biết mục nào đang được nói tới. */
  const [openApp, setOpenApp] = useState<string | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

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

  /* Bấm ra ngoài hoặc Esc thì đóng. Không có hai đường này thì dropdown mắc lại
     trên màn và che mất chính nội dung người dùng vừa chuyển tới. */
  useEffect(() => {
    if (openApp === null) return

    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenApp(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenApp(null)
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openApp])

  useEffect(() => {
    if (!accountOpen) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest('[data-account-menu]')) setAccountOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [accountOpen])

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

      {/* ---- Tầng 1 · tôi là ai · tôi tìm gì · gì đang chờ tôi ---- */}
      <div className="relative z-[1] flex h-16 items-center gap-3 px-4 lg:gap-4">
        <div className="flex shrink-0 items-center">
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

        {/* Search is an entry point, not the top bar's visual background. Its
            cap keeps the query legible without overpowering the brand and
            pending-work controls. */}
        <SearchField className="min-w-[96px] flex-1 md:max-w-[560px]" {...search} />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Hàng một chỉ giữ lại tín hiệu cần xem nhanh: Thông báo và người đang
              đăng nhập. Các lối vào còn lại sống trong menu avatar để header nhẹ
              hơn, đặc biệt khi search bị co ở màn hình nhỏ. */}
          {notificationAction ? <CoreButton action={notificationAction} unread={unread} /> : null}
          {unread ? <span className="sr-only">có thông báo chưa đọc</span> : null}

          <div className="relative shrink-0" data-account-menu>
            <button
              type="button"
              aria-label={`Mở tài khoản của ${user.name}`}
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              onClick={() => {
                setOpenApp(null)
                setAccountOpen((open) => !open)
              }}
              className={cn(
                'motion-std focus-visible:outline-ring rounded-md p-0 focus-visible:outline-2 focus-visible:outline-offset-2',
                accountOpen && 'bg-primary/15',
              )}
            >
              <Avatar
                name={user.name}
                initials={user.initials}
                className="transition-transform duration-[var(--motion-duration)]"
              />
            </button>
            {accountOpen && (
              <div
                role="menu"
                aria-label={`Tài khoản của ${user.name}`}
                className="glass-overlay shadow-panel absolute right-0 top-[calc(100%+10px)] z-50 flex max-h-[min(640px,calc(100vh-88px))] w-[min(280px,calc(100vw-32px))] flex-col overflow-y-auto rounded-lg p-2"
              >
                <div className="flex items-center gap-3 px-3 py-2">
                  <Avatar name={user.name} initials={user.initials} size="md" />
                  <div className="min-w-0">
                    <div className="text-foreground truncate text-[13px] font-semibold">
                      {user.name}
                    </div>
                    <div className="text-muted-foreground truncate text-[11px]">
                      {user.role ?? org}
                    </div>
                  </div>
                </div>

                <div aria-hidden className="bg-surface-ink/12 my-1 h-px" />
                <div className="text-muted-foreground px-3 pb-1 pt-2 text-[10px] font-semibold tracking-[0.08em]">
                  Đi đến
                </div>
                <div className="flex flex-col gap-1">
                  {otherCoreActions.map((action) => (
                    <AccountAction
                      key={action.label}
                      action={action}
                      onSelect={() => setAccountOpen(false)}
                    />
                  ))}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!onOpenAssistant}
                    onClick={() => {
                      setAccountOpen(false)
                      onOpenAssistant?.()
                    }}
                    className={cn(
                      'motion-std flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-left text-[12.5px]',
                      onOpenAssistant
                        ? 'text-muted-foreground hover:bg-surface-ink/10 hover:text-foreground'
                        : 'text-muted-foreground cursor-not-allowed',
                    )}
                  >
                    <span className="bg-surface-ink/9 flex size-7 shrink-0 items-center justify-center rounded-sm">
                      <Icon
                        icon={Orbit}
                        size={16}
                        className={cn(!onOpenAssistant && 'opacity-55')}
                      />
                    </span>
                    <span className="flex-1">{assistantLabel}</span>
                    {!onOpenAssistant ? (
                      <Icon icon={Lock} size={14} className="opacity-55" />
                    ) : null}
                  </button>
                </div>

                <div aria-hidden className="bg-surface-ink/12 my-1 h-px" />
                <div className="text-muted-foreground px-3 pb-1 pt-2 text-[10px] font-semibold tracking-[0.08em]">
                  Tài khoản
                </div>
                <div
                  className="flex flex-col items-stretch gap-1 [&>button]:w-full [&>button]:justify-start"
                  onClickCapture={() => setAccountOpen(false)}
                >
                  {userAction}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- Tầng 2 · tôi đang làm ở đâu ----
          Căn GIỮA từ `lg`: tầng 2 chỉ có chín mục ngắn, dồn trái thì chúng nằm
          lệch hẳn một góc dưới ô tìm dài, còn nửa phải trống trơn. Dưới `lg`
          vẫn dồn trái vì hàng đã cuộn ngang — căn giữa một hàng cuộn được thì
          mục đầu bị đẩy khuất khỏi mép trái. */}
      <div
        ref={barRef}
        className="relative z-[1] flex h-12 items-center gap-1 overflow-x-auto px-4 lg:justify-start lg:overflow-x-visible"
      >
        {apps.map((app) => {
          const open = openApp === app.label
          const hasItems = Boolean(app.items?.length) && !app.locked
          const menuId = `${uid}-${app.label}`

          return (
            /* `relative` ở ĐÂY, không ở hàng: dropdown phải neo vào chính nút
               đã mở nó. Neo vào hàng thì mọi menu rơi về cùng một chỗ ở mép
               trái — đo được lệch 133px so với nút "Kinh doanh". */
            <div key={app.label} className="relative shrink-0">
              <button
                type="button"
                title={app.description ?? app.label}
                aria-label={app.description ? `${app.label}. ${app.description}` : undefined}
                disabled={app.locked}
                aria-expanded={hasItems ? open : undefined}
                aria-haspopup={hasItems ? 'menu' : undefined}
                aria-controls={hasItems && open ? menuId : undefined}
                aria-current={app.active ? 'page' : undefined}
                onClick={() => {
                  if (hasItems) {
                    setOpenApp(open ? null : app.label)
                    return
                  }
                  app.onClick?.()
                }}
                /* Mục khoá: chỉ hai ICON mờ đi, CHỮ giữ nguyên
                   `--muted-foreground`. Dìm cả nút bằng `opacity-45` như bản
                   trước là 2,29:1 — phá luật 13. Dấu hiệu "chưa mở" nằm ở ổ
                   khoá, không ở độ mờ (tiền lệ: `patterns/nav-item.tsx`). */
                className={cn(
                  'motion-std flex h-9 items-center gap-2 whitespace-nowrap rounded-md px-3 text-[12.5px]',
                  app.active
                    ? 'bg-primary/15 text-on-tint-primary font-semibold'
                    : 'text-muted-foreground',
                  app.locked ? 'cursor-not-allowed' : 'hover:bg-surface-ink/10',
                )}
              >
                <Icon icon={app.icon} size={16} className={cn(app.locked && 'opacity-55')} />
                {app.label}
                {app.locked ? (
                  <>
                    <Icon icon={Lock} size={14} className="opacity-55" />
                    <span className="sr-only">chưa mở</span>
                  </>
                ) : null}
                {hasItems ? (
                  <Icon
                    icon={ChevronDown}
                    size={14}
                    className={cn('motion-std opacity-60', open && 'rotate-180')}
                  />
                ) : null}
              </button>

              {hasItems && open ? (
                /* `glass-b` — dropdown nổi TRÊN nội dung, cần mặt đục hơn khung
                   chứa nó, không phải cùng một lớp kính (luật 12). */
                <div
                  id={menuId}
                  role="menu"
                  aria-label={app.label}
                  className="glass-overlay shadow-card absolute left-0 z-50 mt-1 flex min-w-[232px] flex-col gap-1 rounded-lg p-2"
                >
                  {app.items?.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      aria-current={item.active ? 'page' : undefined}
                      onClick={() => {
                        setOpenApp(null)
                        item.onClick?.()
                      }}
                      className={cn(
                        'motion-std flex h-9 items-center gap-2 whitespace-nowrap rounded-md px-3 text-left text-[12.5px]',
                        item.active
                          ? 'bg-primary/15 text-on-tint-primary font-semibold'
                          : 'text-muted-foreground hover:bg-surface-ink/10',
                      )}
                    >
                      <Icon icon={item.icon} size={16} />
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </header>
  )
}
