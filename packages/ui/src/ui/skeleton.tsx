import { cn } from '../lib/cn'

/** A-08 · Skeleton — animate-pulse bg-white/10 rounded-sm.
 *  Trong theme kit nhịp là `shimmer` .3 → .7 → .3 trong 1,6s, lệch pha 200ms. */
export type SkeletonProps = {
  /** phần trăm bề ngang, ví dụ '58%' */
  width?: string
  height?: number
  /** độ trễ nhịp, ms */
  delay?: number
  className?: string
}

export function Skeleton({ width = '100%', height = 11, delay = 0, className }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn('animate-shimmer rounded-sm bg-white/10', className)}
      style={{ width, height, animationDelay: delay ? `${delay}ms` : undefined }}
    />
  )
}
