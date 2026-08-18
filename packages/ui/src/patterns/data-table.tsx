import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

/** M-07 · TableRow — default · hover · selected · hidden-by-permission.
 *  h-11 · divide-white/6 · hover:bg-white/5
 *  selected = shadow-[inset_2px_0_0] shadow-primary + bg-primary/10
 *
 *  Bảng LUÔN nằm trên .glass-b, không bao giờ .glass-a (luật 8 · CLAUDE.md) —
 *  component không tự vẽ mặt kính, khối cha phải là <GlassCard variant="b">.
 *  Dòng `hidden` là kết quả E2 trả về, không phải cách trình bày của màn. */
/** `hover` là trạng thái ép cứng — chỉ dùng để chụp tài liệu trong theme kit. */
export type RowState = 'default' | 'hover' | 'selected' | 'hidden'

export type TableColumn = {
  header: string
  /** phần của grid-template-columns, ví dụ '1.4fr' */
  width: string
  align?: 'left' | 'right'
}

export type TableRowModel = {
  id: string
  cells: ReactNode[]
  state?: RowState
}

export function DataTable({
  columns,
  rows,
  className,
}: {
  columns: TableColumn[]
  rows: TableRowModel[]
  className?: string
}) {
  const template = columns.map((c) => c.width).join(' ')

  return (
    <div className={className} role="table">
      <div
        role="row"
        className="border-b-white/6 text-muted-foreground grid border-b pb-2 text-[11px]"
        style={{ gridTemplateColumns: template }}
      >
        {columns.map((col) => (
          <span
            key={col.header}
            role="columnheader"
            className={cn(col.align === 'right' && 'text-right')}
          >
            {col.header}
          </span>
        ))}
      </div>

      {rows.map((row, i) => (
        <div
          key={row.id}
          role="row"
          className={cn(
            'motion-std grid h-11 items-center text-[12.5px]',
            i < rows.length - 1 && 'border-b-white/6 border-b',
            row.state !== 'hidden' && 'hover:bg-white/5',
            row.state === 'hover' && 'bg-white/5',
            row.state === 'selected' && 'bg-primary/10 shadow-[inset_2px_0_0_var(--primary)]',
            row.state === 'hidden' && 'opacity-55',
          )}
          style={{ gridTemplateColumns: template }}
        >
          {row.cells.map((cell, c) => (
            <span key={c} role="cell" className={cn(columns[c]?.align === 'right' && 'text-right')}>
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
