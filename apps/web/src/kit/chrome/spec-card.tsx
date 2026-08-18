import type { ReactNode } from 'react'
import { cn } from '@pv/ui'

/** Khung tài liệu của theme kit: mã item · tên component · ghi chú phải ·
 *  thân · chân khối chứa chuỗi class Tailwind để dev dựng 1:1.
 *  Đây là chrome của trang styleguide, không phải component sản phẩm. */
export type SpecCardProps = {
  /** "A-01" · "M-07" */
  code: string
  /** tên component shadcn/ui */
  name: string
  /** ghi chú góc phải: "4 variant · 3 size" */
  note?: ReactNode
  /** azure hoá ghi chú khi đó là một luật, không phải một con số */
  noteAccent?: boolean
  /** chuỗi class Tailwind ở chân khối */
  footer?: ReactNode
  bodyClassName?: string
  className?: string
  children: ReactNode
}

export function SpecCard({
  code,
  name,
  note,
  noteAccent,
  footer,
  bodyClassName,
  className,
  children,
}: SpecCardProps) {
  return (
    <section className={cn('glass-b-flat overflow-hidden rounded-lg', className)}>
      <header className="flex items-center gap-2.5 bg-white/[4.5%] px-4 py-[11px]">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[.1em]">{code}</span>
        <h3 className="font-display text-[13.5px] font-semibold">{name}</h3>
        {note && (
          <span
            className={cn(
              'ml-auto font-mono text-[10px]',
              noteAccent ? 'text-accent-foreground' : 'text-muted-foreground',
            )}
          >
            {note}
          </span>
        )}
      </header>

      <div className={bodyClassName}>{children}</div>

      {footer && (
        <footer className="text-muted-foreground bg-black/20 px-4 py-2.5 font-mono text-[10px] leading-[1.8]">
          {footer}
        </footer>
      )}
    </section>
  )
}
