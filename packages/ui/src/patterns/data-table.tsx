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
    <div className={className} role="table">
      <div
        role="row"
        className="border-b-white/6 text-muted-foreground grid border-b pb-2 text-[11px]"
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
                    'motion-std hover:text-foreground -m-1 inline-flex items-center gap-1 rounded-sm p-1',
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
            aria-selected={row.state === 'selected' ? true : undefined}
            onClick={openable ? open : undefined}
            onKeyDown={openable ? onKeyDown : undefined}
            className={cn(
              'motion-std grid h-11 items-center text-[12.5px]',
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
