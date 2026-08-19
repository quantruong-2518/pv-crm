import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Lock, Orbit, type LucideIcon } from 'lucide-react'
import { SearchField, type SearchFieldProps } from '../patterns/search-field'
import { Avatar } from '../ui/avatar'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'
import markLight from '../assets/mark-light.webp'

/** O-06 · AppHeader — nav hai tầng, thay AppSidebar từ 19/08.
 *
 *  VÌ SAO BỎ NAV DỌC. Bộ mục đã vượt sức chứa của một cột: đo được 1040px nội
 *  dung trên màn cao 801px, tức mục cuối và khối người dùng nằm ngoài tầm nhìn
 *  vĩnh viễn. Nhét thêm vào cột đó chỉ đổi chỗ đau — chữ nhỏ lại, khoảng thở
 *  hẹp lại, và 232px chiều ngang vẫn mất trắng ở MỌI màn.
 *
 *  HAI TẦNG, hai câu hỏi khác nhau:
 *   · tầng 1 — "tôi là ai, tôi tìm gì, có gì đang chờ tôi": thương hiệu · ô tìm
 *     toàn cục · việc chờ (duyệt, thông báo) · trợ lý · người đang đăng nhập.
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
  icon: LucideIcon
  label: string
  /** số việc đang chờ — hiện thành huy hiệu trên icon */
  count?: number
  active?: boolean
  /** chưa mở — nút tắt và hiện ổ khoá */
  locked?: boolean
  onClick?: () => void
}

export type HeaderApp = {
  icon: LucideIcon
  label: string
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
  /** khối bên phải tầng 1, sau avatar — ví dụ nút "Đổi vai" */
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
 *  `aria-label` nên trình đọc màn hình và tooltip đều còn chữ. */
function CoreButton({ action }: { action: HeaderAction }) {
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
        action.active ? 'bg-primary/15 text-accent-foreground' : 'text-muted-foreground',
        action.locked ? 'cursor-not-allowed opacity-45' : 'hover:bg-white/10',
      )}
    >
      <Icon icon={action.icon} size={17} />
      {action.count ? <CountBadge count={action.count} /> : null}
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
  const uid = useId()
  /** Ứng dụng đang xổ module con. Một lúc chỉ một — hai dropdown cùng mở thì
   *  người dùng không biết mục nào đang được nói tới. */
  const [openApp, setOpenApp] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  /** Nav đã dính đỉnh màn chưa.
   *
   *  Ở trạng thái thường nav là một THẺ: nằm trong lề khung, bo góc, có bóng —
   *  cùng một mặt kính với mọi thẻ khác trên trang. Khi trang cuộn tới đúng
   *  đỉnh của nó, nó đổi vai: không còn là một thẻ trong trang mà là thanh
   *  công cụ của cả cửa sổ. Lúc đó nó nở ngang ra ăn hết phần lề hai bên, bỏ bo
   *  góc trên, và ngồi sát mép — hình dạng nói đúng vai trò mới.
   *
   *  Đo bằng `IntersectionObserver` trên CHÍNH nav, không bằng `scroll` +
   *  `getBoundingClientRect`: một `scroll` listener chạy mọi khung hình và mỗi
   *  lần đọc `rect` là ép trình duyệt tính lại bố cục giữa lúc đang cuộn.
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

  return (
    <header
      ref={headerRef}
      className={cn(
        'glass-a flex flex-col',
        /* `--shell-pad-lg` (24px) là lề khung ở `lg`. Nở ngang đúng bằng hai
             lần lề đó, bằng margin âm, nên nav trùm hết bề ngang cửa sổ mà
             KHÔNG cần biết gì về khung chứa nó.
             `transition` chỉ chạy trên margin/bo góc — không `transform`:
             `scale` sẽ kéo giãn cả chữ và icon bên trong, còn ở đây chỉ có
             mặt kính nở ra. */
        'motion-std lg:transition-[margin,border-radius]',
        stuck ? 'rounded-b-lg lg:-mx-6 lg:rounded-t-none' : 'rounded-lg',
        className,
      )}
    >
      {/* ---- Tầng 1 · tôi là ai · tôi tìm gì · gì đang chờ tôi ---- */}
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="flex shrink-0 items-center gap-2">
          <img src={markLight} alt="" className="size-8 shrink-0 object-contain" />
          {/* Tên sản phẩm ẩn dưới `md`: ở đó mỗi pixel ngang thuộc về ô tìm, và
              logo đã nói đủ đây là app nào. */}
          <div className="hidden md:block">
            <b className="font-display block text-[13.5px] leading-tight">{product}</b>
            <small className="text-muted-foreground block text-[10.5px] font-normal leading-tight">
              {org}
            </small>
          </div>
        </div>

        <SearchField className="min-w-0 flex-1" {...search} />

        {/* Việc chờ ẩn dưới `lg` — BottomNav đã giữ đúng bộ này ở điện thoại,
            bày hai lần là hai chỗ phải cùng đúng. */}
        <div className="hidden items-center gap-1 lg:flex">
          {core.map((action) => (
            <CoreButton key={action.label} action={action} />
          ))}
        </div>

        <button
          type="button"
          onClick={onOpenAssistant}
          className="motion-std text-accent-foreground hidden h-10 shrink-0 items-center gap-2 rounded-md bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_30%,transparent),color-mix(in_srgb,var(--primary)_12%,transparent))] px-4 text-[12.5px] font-semibold shadow-[var(--shadow-assistant),inset_0_1px_0_var(--sheen-ai)] hover:brightness-[1.12] lg:flex"
        >
          <Icon icon={Orbit} size={16} />
          {assistantLabel}
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <Avatar name={user.name} initials={user.initials} />
          {unread ? <span className="sr-only">có thông báo chưa đọc</span> : null}
          {userAction}
        </div>
      </div>

      {/* ---- Tầng 2 · tôi đang làm ở đâu ----
          Căn GIỮA từ `lg`: tầng 2 chỉ có chín mục ngắn, dồn trái thì chúng nằm
          lệch hẳn một góc dưới ô tìm dài, còn nửa phải trống trơn. Dưới `lg`
          vẫn dồn trái vì hàng đã cuộn ngang — căn giữa một hàng cuộn được thì
          mục đầu bị đẩy khuất khỏi mép trái. */}
      <div
        ref={barRef}
        className="relative flex h-12 items-center gap-1 overflow-x-auto px-4 lg:justify-center lg:overflow-x-visible"
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
                className={cn(
                  'motion-std flex h-9 items-center gap-2 whitespace-nowrap rounded-md px-3 text-[12.5px]',
                  app.active
                    ? 'bg-primary/15 text-accent-foreground font-semibold'
                    : 'text-muted-foreground',
                  app.locked ? 'cursor-not-allowed opacity-45' : 'hover:bg-white/10',
                )}
              >
                <Icon icon={app.icon} size={16} />
                {app.label}
                {app.locked ? <Icon icon={Lock} size={14} className="opacity-70" /> : null}
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
                  className="glass-menu shadow-card absolute left-0 z-50 mt-1 flex min-w-[232px] flex-col gap-1 rounded-lg p-2"
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
                          ? 'bg-primary/15 text-accent-foreground font-semibold'
                          : 'text-muted-foreground hover:bg-white/10',
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
