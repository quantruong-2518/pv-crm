import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'

/** Luật 11 · docs/luat-thiet-ke.md — Lucide outline, stroke 1.75, size 16 trong nút / 20 trong nav.
 *  Không icon fill, không emoji. Trợ lý AI dùng `orbit`. */
export type IconProps = {
  icon: LucideIcon
  /** 16 trong nút · 20 trong nav · 24–26 cho ô quét và empty state
   *  14 chỉ dành cho icon delta nằm cùng dòng với chữ 11.5px trong StatCard,
   *  và ổ khoá của NavItem `locked` — nó đứng chỗ badge số 10.5px, 16 sẽ to hơn badge */
  size?: 14 | 16 | 17 | 18 | 20 | 24 | 26
  /** 1.75 mặc định; 1.9 chỉ cho icon nằm trên nền azure đặc (nút quét, khối AI) */
  strokeWidth?: 1.75 | 1.9
  className?: string
}

export function Icon({ icon: Glyph, size = 16, strokeWidth = 1.75, className }: IconProps) {
  return (
    <Glyph
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      aria-hidden
      className={cn('inline-flex shrink-0', className)}
    />
  )
}
