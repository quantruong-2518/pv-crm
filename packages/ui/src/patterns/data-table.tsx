import type { KeyboardEvent, ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-07 · TableRow — default · hover · selected · hidden-by-permission.
 *  h-11 · divide-white/6 · hover:bg-white/5
 *  selected = shadow-[inset_2px_0_0] shadow-primary + bg-primary/10
 *
 *  Bảng LUÔN nằm trên .glass-b, không bao giờ .glass-a (luật 8 · docs/luat-thiet-ke.md) —
 *  component không tự vẽ mặt kính, khối cha phải là <GlassCard variant="b">.
 *  Dòng `hidden` là kết quả E2 trả về, không phải cách trình bày của màn.
 *
 *  Hai việc thêm ở bản này:
 *   · `row.onOpen` — CẢ DÒNG mở object, không chỉ cái mã trong ô đầu. Dòng bấm
 *     được thì phải nói ra: con trỏ pointer, nền sáng lên, thẻ nổi lên bằng
 *     shadow-card, và bàn phím vào được (tabIndex + Enter/Space).
 *   · `sortKey` + `sort`/`onSort` — header thành nút sắp xếp. Component KHÔNG tự
 *     sắp xếp mảng: thứ tự là trạng thái của màn, DataTable chỉ vẽ mũi tên và
 *     báo người dùng vừa bấm cột nào. */
/** `hover` là trạng thái ép cứng — chỉ dùng để chụp tài liệu trong theme kit. */
export type RowState = 'default' | 'hover' | 'selected' | 'hidden'

export type TableColumn = {
  header: string
  /** phần của grid-template-columns, ví dụ '1.4fr' */
  width: string
  align?: 'left' | 'right'
  /** có khoá này thì header thành nút sắp xếp — khoá đi ra ở `onSort(key)` */
  sortKey?: string
}

export type TableRowModel = {
  id: string
  cells: ReactNode[]
  state?: RowState
  /** cả dòng mở object. Nút riêng nằm trong ô thì màn tự `stopPropagation`
   *  ở nút đó — ở đây chỉ bắt click nổi bọt lên dòng, không nuốt gì cả. */
  onOpen?: () => void
}

export type TableSort = {
  key: string
  dir: 'asc' | 'desc'
}

export function DataTable({
  columns,
  rows,
  className,
  sort,
  onSort,
}: {
  columns: TableColumn[]
  rows: TableRowModel[]
  className?: string
  /** cột đang sắp xếp và chiều — của màn giữ, không của bảng */
  sort?: TableSort
  /** người dùng bấm header có `sortKey`; đảo chiều là việc của màn */
  onSort?: (key: string) => void
}) {
  const template = columns.map((c) => c.width).join(' ')

  return (
    /* `overflow-x-hidden`: header nút sắp xếp cuối cùng dùng `-m-1` để nới
       vùng bấm mà không đẩy chữ (xem bên dưới) — ở cột cuối, mép phải của nút
       tràn ra ngoài bảng đúng 4px vì không còn cột nào bên phải để `gap-3`
       nuốt phần tràn đó. Bảng luôn nằm trong khối cha `overflow-y-auto`
       (luật 8), mà CSS coi cặp overflow-x/overflow-y là MỘT cặp: chỉ đặt một
       trục thành `auto` thì trục kia tự động cũng thành `auto`, nên 4px tràn
       này biến thành một thanh cuộn ngang thật — vô hình khi bảng đủ dòng để
       cần cuộn dọc (thanh cuộn dọc đã chiếm khoảng đó), lộ ra thành một thanh
       cuộn ngang trơ trọi giữa khoảng trống khi bảng lọc còn ít dòng. */
    <div className={cn('overflow-x-hidden', className)} role="table">
      <div
        role="row"
        className="border-b-white/6 text-muted-foreground grid gap-3 border-b pb-2 text-[11px]"
        style={{ gridTemplateColumns: template }}
      >
        {columns.map((col) => {
          const sortable = Boolean(col.sortKey) && Boolean(onSort)
          const active = Boolean(col.sortKey) && sort?.key === col.sortKey
          const glyph = active ? (sort?.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

          return (
            <span
              key={col.header}
              role="columnheader"
              aria-sort={
                !col.sortKey
                  ? undefined
                  : active
                    ? sort?.dir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
              }
              className={cn('flex min-w-0 items-center', col.align === 'right' && 'justify-end')}
            >
              {sortable ? (
                <button
                  type="button"
                  onClick={() => onSort?.(col.sortKey as string)}
                  className={cn(
                    // rounded-md: đây là CONTROL (bấm được, có focus ring), mà
                    // control bo 4 — `rounded-sm` 3px là cấp tag (luật 5).
                    'motion-std hover:text-foreground -m-1 inline-flex items-center gap-1 rounded-md p-1',
                    active && 'text-accent-foreground font-semibold',
                  )}
                >
                  {col.header}
                  <Icon icon={glyph} size={14} className={cn(!active && 'opacity-45')} />
                </button>
              ) : (
                col.header
              )}
            </span>
          )
        })}
      </div>

      {rows.map((row, i) => {
        const openable = Boolean(row.onOpen) && row.state !== 'hidden'
        const open = () => row.onOpen?.()
        const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          // Space cuộn trang nếu để nguyên — dòng bảng là nút, không phải trang.
          if (event.key === ' ') event.preventDefault()
          open()
        }

        return (
          <div
            key={row.id}
            role="row"
            tabIndex={openable ? 0 : undefined}
            /* Hai thuộc tính nói CÙNG một điều, và đó là chủ ý.
               `aria-selected` chỉ hợp lệ trên `row` của `grid`/`treegrid`; ở
               đây vai ngoài là `role="table"` nên nó bị bỏ qua — trình đọc màn
               hình KHÔNG biết dòng nào đang mở. `aria-current` hợp lệ ở mọi
               phần tử và được đọc ra, nên nó là thứ thật sự tải nghĩa.
               Chỗ đúng về lâu dài là đổi cả bảng sang `role="grid"` +
               `gridcell`, lúc đó `aria-selected` mới có hiệu lực và
               `aria-current` gỡ đi. Chưa làm bây giờ vì việc đó phá 12
               assertion ở `leads.test.tsx` và `sales-config.test.tsx` — hai
               file đang có người sửa dở. `aria-selected` giữ nguyên để test
               hiện có không đỏ. */
            aria-selected={row.state === 'selected' ? true : undefined}
            aria-current={row.state === 'selected' ? true : undefined}
            onClick={openable ? open : undefined}
            onKeyDown={openable ? onKeyDown : undefined}
            className={cn(
              /* `gap-3` giữa các cột là bắt buộc, không phải trang trí: ô căn
                 phải chạm sát ô kế bên và hai giá trị dính liền nhau thành một
                 chuỗi vô nghĩa ("6/6Mới · 4 ngày"). Header dùng cùng khe để hai
                 lưới không lệch. */
              'motion-std grid h-11 items-center gap-3 text-[12.5px]',
              i < rows.length - 1 && 'border-b-white/6 border-b',
              openable &&
                'hover:bg-white/8 focus-visible:bg-white/8 cursor-pointer outline-none focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
              /* Bóng nổi CHỈ cho dòng chưa được chọn. Dòng `selected` đọc bằng
                 vệt azure `inset 2px 0 0` bên trái, mà `box-shadow` không cộng
                 dồn giữa hai class — `hover:shadow-card` sẽ thay chỗ vệt đó và
                 dòng đang mở mất dấu ngay lúc người dùng rê chuột lên nó. */
              openable && row.state !== 'selected' && 'hover:shadow-card',
              !openable && row.state !== 'hidden' && 'hover:bg-white/5',
              row.state === 'hover' && 'bg-white/5',
              row.state === 'selected' && 'bg-primary/10 shadow-[inset_2px_0_0_var(--primary)]',
              row.state === 'hidden' && 'opacity-55',
            )}
            style={{ gridTemplateColumns: template }}
          >
            {row.cells.map((cell, c) => (
              <span
                key={c}
                role="cell"
                className={cn('min-w-0', columns[c]?.align === 'right' && 'text-right')}
              >
                {cell}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}
