import type { LucideIcon } from 'lucide-react'
import { Lock } from 'lucide-react'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-06 · NavItem — h-[38px] rounded-md · active = bg-accent · badge số dùng bg-destructive.
 *  Icon 16 trong nút, nhưng trong nav dùng 16 để khớp chiều cao 38px của theme kit.
 *
 *  `locked` = phần chưa mở: nút tắt hẳn, không hover, ổ khoá 14 thay chỗ badge.
 *  Chữ giữ nguyên `text-muted-foreground` — chỉ hai icon mờ đi (opacity-55, cùng
 *  mức với hàng ẩn-vì-quyền của DataTable). Không dìm chữ vì luật 13 đòi tương
 *  phản ≥ 4.5:1 trên `.glass-a`; dấu hiệu "khoá" nằm ở ổ khoá, không ở độ mờ. */
export type NavItemProps = {
  icon: LucideIcon
  label: string
  active?: boolean
  /** số việc chờ — 0 hoặc undefined thì không vẽ badge */
  count?: number
  /** chưa mở trong bản dựng này — nút disabled, hiện ổ khoá thay badge */
  locked?: boolean
  /** 0 = mục cấp một (nhánh, năng lực Core/Plus) · 1 = module NẰM TRONG một
   *  nhánh, thụt vào 32px.
   *
   *  Cấp phải khớp cấu trúc sản phẩm: bốn nhánh vệ tinh đồng cấp với nhau,
   *  module của một nhánh thì nằm dưới nhánh đó. Để module ngang hàng nhánh là
   *  nói sai sản phẩm, không phải sai thẩm mỹ. */
  depth?: 0 | 1
  onClick?: () => void
  className?: string
}

export function NavItem({
  icon,
  label,
  active,
  count,
  locked,
  depth = 0,
  onClick,
  className,
}: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'motion-std flex h-[38px] w-full items-center gap-2.5 rounded-md px-3 text-left text-[13.5px]',
        depth === 1 && 'pl-8',
        locked
          ? 'text-muted-foreground cursor-not-allowed'
          : active
            ? 'bg-accent text-foreground shadow-[inset_0_1px_0_var(--sheen-ai)]'
            : 'text-muted-foreground hover:bg-white/6',
        className,
      )}
    >
      <Icon
        icon={icon}
        size={16}
        className={cn(locked && 'opacity-55', active && !locked && 'text-accent-foreground')}
      />
      {label}
      {locked ? (
        <>
          <Icon icon={Lock} size={14} className="ml-auto opacity-55" />
          <span className="sr-only">chưa mở</span>
        </>
      ) : count ? (
        <span className="bg-destructive text-primary-foreground ml-auto rounded-sm px-[7px] py-px text-[10.5px] font-semibold">
          {count}
        </span>
      ) : null}
    </button>
  )
}
