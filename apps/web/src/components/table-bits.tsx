import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Filter, Mail } from '@pv/ui'
import { Avatar, Button, Checkbox, Icon, cn } from '@pv/ui'

/** Những mảnh dùng chung của MỌI SỔ — lead · cơ hội · chiến dịch.
 *
 *  Cả bọn từng nằm private trong `pages/leads.tsx`. Chúng chuyển ra đây khi sổ
 *  thứ hai cần đúng những thứ đó, và lý do tách quan trọng hơn chuyện đỡ gõ
 *  lại: mấy cái sổ của cùng một phòng phải phân trang giống nhau, lọc giống
 *  nhau, in hòm thư giống nhau, và vẽ ô trống giống nhau. Chép sang màn thứ
 *  hai là mở đường cho chúng trôi khỏi nhau — bên này "Trước/Sau", bên kia
 *  "◀ ▶", cùng một app.
 *
 *  Chúng KHÔNG lên `@pv/ui`: cả ba biết cách phòng kinh doanh đọc một dòng sổ,
 *  đó là kiến thức của app chứ không của thư viện component (biên giới package ·
 *  CLAUDE.md). */

/** Page indexes to print: first, last, and the current one with its neighbours.
 *  `null` marks a gap, so ten pages never turn into ten buttons. */
function pageWindow(page: number, pageCount: number): (number | null)[] {
  const keep = [...new Set([0, page - 1, page, page + 1, pageCount - 1])]
    .filter((p) => p >= 0 && p < pageCount)
    .sort((a, b) => a - b)
  return keep.flatMap((p, i) => (i > 0 && p - (keep[i - 1] ?? p) > 1 ? [null, p] : [p]))
}

function PageButton({
  label,
  current,
  disabled,
  onClick,
  children,
}: {
  label: string
  current?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      /* 48px wherever the pointer is a finger — tablets page these books by touch (law 13). */
      className={cn(
        'motion-std tnum font-num pointer-coarse:h-12 pointer-coarse:min-w-12 flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[12px]',
        current ? 'bg-surface-ink/12 text-foreground font-semibold' : 'text-muted-foreground',
        disabled ? 'cursor-not-allowed opacity-45' : !current && 'hover:bg-surface-ink/8',
      )}
    >
      {children}
    </button>
  )
}

/** The foot of a book card: which rows are showing, then numbered pages.
 *  `page` is 0-based. */
export function TableFooter({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <span className="text-muted-foreground tnum text-[11.5px]">
        Hiển thị {from}–{to} trong {total}
      </span>
      {pageCount > 1 && (
        <nav aria-label="Phân trang" className="flex items-center gap-1">
          <PageButton label="Trang trước" disabled={page === 0} onClick={() => onPage(page - 1)}>
            <Icon icon={ChevronLeft} size={16} />
          </PageButton>
          {pageWindow(page, pageCount).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} aria-hidden className="text-muted-foreground px-1">
                …
              </span>
            ) : (
              <PageButton
                key={p}
                label={`Trang ${p + 1}`}
                current={p === page}
                onClick={() => onPage(p)}
              >
                {p + 1}
              </PageButton>
            ),
          )}
          <PageButton
            label="Trang sau"
            disabled={page >= pageCount - 1}
            onClick={() => onPage(page + 1)}
          >
            <Icon icon={ChevronRight} size={16} />
          </PageButton>
        </nav>
      )}
    </div>
  )
}

/** Cột người bên MÌNH — TÊN trên bảng, hòm thư ở `title`.
 *
 *  Bản trước in ngược lại: hòm thư trên bảng, tên ở tooltip. Lý do khi đó —
 *  tên trùng được, hòm thư thì không — vẫn đúng, nhưng nó là lý do để KHOÁ
 *  theo hòm thư chứ không phải để IN nó. Người quét cột này đang hỏi "ai đang
 *  giữ", và `huydq@pebblevina.com` bắt mắt tự dịch lại thành "Đỗ Quang Huy" ở
 *  từng dòng một. Sổ cơ hội in tên ở hai cột người của nó (`PersonCell` trong
 *  `pages/opportunities.tsx`), nên in hòm thư ở đây còn làm hai sổ của cùng
 *  một phòng đọc ra hai kiểu.
 *
 *  Hòm thư KHÔNG mất, nó lui về `title` — đúng chỗ của thứ chỉ cần khi đối
 *  chiếu với thư hoặc bảng hoa hồng.
 *
 *  Cả hai ĐI VÀO bằng props, không dựng lại từ tên. Bản cũ gọi `staffEmail`
 *  của fixture — một quy ước ghép chữ đúng với 100 dòng đóng băng và là một
 *  phép ĐOÁN với bảng `platform.actor` thật, nơi hòm thư là một cột người ta
 *  gõ vào. Đoán sai ở đây là một lá thư gửi tới địa chỉ không tồn tại, và
 *  không ai biết cho tới lúc nó dội về.
 *
 *  Có hòm thư mà thiếu tên thì in hòm thư, và in bằng mono để đọc ra ngay là
 *  một dạng khác. Hai trường về từ CÙNG một phép join nên ca đó gần như không
 *  xảy ra; nếu xảy ra thì "có người giữ, chưa biết tên" phải đọc khác hẳn
 *  "chưa ai nhận" — dòng "—" bên dưới. */
export function PicCell({
  email,
  name,
  empty,
  avatar = false,
}: {
  email?: string
  name?: string
  empty: string
  /** Initials before the name — the one-row list layout. */
  avatar?: boolean
}) {
  const shown = name ?? email
  if (!shown) {
    return (
      <span className="text-muted-foreground" title={empty}>
        —
      </span>
    )
  }
  const text = (
    <span
      className={name ? 'block truncate' : 'block truncate font-mono text-[11px]'}
      title={email ?? name}
    >
      {shown}
    </span>
  )
  if (!avatar) return text
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar name={shown} size="sm" />
      {text}
    </span>
  )
}

/** Một ô người bên KHÁCH: tên, hoặc "—" kèm lý do ở `title`.
 *
 *  "—" ở đây là DỮ LIỆU, không phải lỗi hiển thị. Điền đại một cái tên cho đủ ô
 *  là phá đúng thứ cổng init data sinh ra để đo — `leadContact` trong fixture
 *  đã ghi thẳng điều đó. */
export function PersonCell({ value, missing }: { value?: string; missing: string }) {
  if (!value) {
    return (
      <span className="text-muted-foreground" title={missing}>
        —
      </span>
    )
  }
  return (
    <span className="block truncate" title={value}>
      {value}
    </span>
  )
}

/** The secondary filters and the reset, behind ONE button — a book's toolbar row
 *  has room for its tabs and its search box, not for four selects. `active`
 *  counts the axes in force and prints that number on the button.
 *
 *  `label` names the popover because three books share this one component: a
 *  hard-coded lead-book name would lie on the other two. */
export function FilterMenu({
  label,
  active,
  children,
}: {
  label: string
  active: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      /* The selects inside portal their listbox to `body`: a press there is still ours. */
      const target = e.target as Element
      if (!root.current?.contains(target) && !target.closest('[role="listbox"]')) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative shrink-0">
      <Button
        size="md"
        variant="ghost"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon icon={Filter} size={16} />
        Bộ lọc
        {active > 0 && (
          <span className="bg-primary/24 text-on-tint-primary tnum rounded-sm px-1 text-[11px] font-semibold">
            {active}
          </span>
        )}
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="glass-overlay absolute right-0 top-[calc(100%+8px)] z-30 flex w-[min(320px,calc(100vw-32px))] flex-col gap-3 rounded-lg p-4"
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** A row's checkbox, shared by every book that lets rows be picked out for a
 *  bulk action. Pressing it starts a paint-drag across rows; the click that
 *  follows the same press is ignored by the shared selection gesture,
 *  so a press toggles once, not twice. */
export function SelectionCell({
  checked,
  label,
  onChange,
  onPress,
}: {
  checked: boolean
  /** What the row IS, for the screen-reader label the checkbox renders — a
   *  company, an opportunity name, whatever names the row on that book. */
  label: string
  onChange: (checked: boolean) => void
  onPress: (event: PointerEvent<HTMLSpanElement>) => void
}) {
  return (
    <span
      className="flex w-full justify-center"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={onPress}
    >
      <Checkbox
        checked={checked}
        onChange={onChange}
        label={<span className="sr-only">Chọn {label}</span>}
        className="h-12 w-full justify-center gap-0 bg-transparent p-0 hover:bg-transparent"
      />
    </span>
  )
}

/** The floating bar a book's selection opens once a row is checked — count,
 *  a way out, and the one bulk action every book with a mail merge needs.
 *  Shared because the lead book and the opportunity book both need this exact
 *  shape, and a screen's own copy is how the two start reading differently. */
export function BookSelectionBar({
  count,
  noun,
  meta,
  onClear,
  onSend,
}: {
  count: number
  /** The picked noun, already declined for the count line — "lead", or an
   *  opportunity book's own word for its rows. */
  noun: string
  /** Second line under the count — an email-address tally, or whatever else
   *  the caller has to say about the picked rows beyond how many there are. */
  meta: string
  onClear: () => void
  onSend: () => void
}) {
  return (
    <div
      className="glass-overlay shadow-panel fixed bottom-[calc(84px+env(safe-area-inset-bottom)+8px)] left-1/2 z-30 flex w-[min(760px,calc(100vw-32px))] -translate-x-1/2 flex-wrap items-center justify-between gap-4 rounded-lg p-3 lg:bottom-6"
      role="region"
      aria-label={`Đang chọn ${count} ${noun}`}
    >
      <div className="flex min-w-0 items-center gap-3" aria-live="polite">
        <span className="bg-accent text-accent-foreground font-num tnum flex size-10 shrink-0 items-center justify-center rounded-md text-[16px] font-semibold">
          {count}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[13px] font-semibold">
            {count} {noun} đã chọn
          </span>
          <span className="text-muted-foreground text-[11.5px]">{meta}</span>
        </span>
      </div>
      <div className="flex flex-1 justify-end gap-2 max-sm:w-full">
        <Button size="lg" variant="ghost" onClick={onClear}>
          Bỏ chọn hết
        </Button>
        <Button size="lg" onClick={onSend}>
          <Icon icon={Mail} size={16} />
          Gửi email
        </Button>
      </div>
    </div>
  )
}
