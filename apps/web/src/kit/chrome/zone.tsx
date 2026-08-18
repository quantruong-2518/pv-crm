import type { ReactNode } from 'react'
import { cn, Kicker } from '@pv/ui'

/** Dải số lớn mở đầu mỗi zone của theme kit (00 → 04). */
export function ZoneHeader({
  number,
  kicker,
  title,
  description,
  className,
}: {
  number: string
  kicker: string
  title: string
  description: string
  className?: string
}) {
  return (
    <div className={cn('mb-7 flex items-end gap-7', className)}>
      <div
        aria-hidden
        className="font-num text-white/11 text-[104px] font-semibold leading-[.78] tracking-[-5px]"
      >
        {number}
      </div>
      <div className="flex-1 pb-2.5">
        <Kicker className="mb-2">{kicker}</Kicker>
        <h2 className="font-display m-0 text-[28px] font-semibold tracking-[-.4px]">{title}</h2>
        <p className="text-muted-foreground mt-2 max-w-[640px] text-[12.5px] leading-[1.7]">
          {description}
        </p>
      </div>
    </div>
  )
}

/** Nền zone — tấm rất mờ gom các SpecCard của cùng một tầng atomic design. */
export function ZoneBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-lg bg-white/[2.2%] p-6', className)}>{children}</div>
}
