import { useId, type ReactNode } from 'react'
import { ArrowLeft } from '../icons'
import { cn } from '../lib/cn'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { GlassCard } from './glass-card'

/** T-06 · ScreenLayout — nhịp nội dung chuẩn nằm bên trong AppShell.
 *
 * AppShell giữ nền, header và bề rộng toàn cục. ScreenLayout giữ cấu trúc mà
 * mọi màn sản phẩm lặp lại: đầu màn → chỉ số → công cụ → nội dung. Mỗi slot là
 * tùy chọn; bỏ slot thì khối biến mất, nhịp giữa các khối còn lại vẫn đúng. */
export type ScreenLayoutProps = {
  children: ReactNode
  className?: string
}

export function ScreenLayout({ children, className }: ScreenLayoutProps) {
  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-6 lg:gap-8', className)}>{children}</div>
  )
}

export type ScreenHeaderProps = {
  title: ReactNode
  description?: ReactNode
  kicker?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  context?: ReactNode
  back?: { label: string; onClick: () => void }
  className?: string
}

/** Một đầu màn, một thứ bậc: back → kicker → TITLE → mô tả/meta; action nằm
 * bên phải từ `sm`, tự rơi xuống dưới trên mobile. Title luôn uppercase. */
export function ScreenHeader({
  title,
  description,
  kicker,
  meta,
  actions,
  context,
  back,
  className,
}: ScreenHeaderProps) {
  const titleId = useId()

  return (
    <header className={cn('flex min-w-0 flex-col gap-4', className)} aria-labelledby={titleId}>
      {back && (
        <Button size="sm" variant="ghost" className="self-start" onClick={back.onClick}>
          <Icon icon={ArrowLeft} size={16} />
          {back.label}
        </Button>
      )}

      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          {kicker && (
            <div className="text-muted-foreground font-mono text-[10px] font-semibold uppercase tracking-[.1em]">
              {kicker}
            </div>
          )}
          <h2
            id={titleId}
            className="font-display text-[26px] font-semibold uppercase tracking-[-.6px] lg:text-[30px]"
          >
            {title}
          </h2>
          {description && (
            <div className="text-muted-foreground max-w-[920px] text-[12px] leading-[1.6]">
              {description}
            </div>
          )}
          {meta && <div className="flex flex-wrap items-center gap-2">{meta}</div>}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        )}
      </div>

      {context && <div className="flex min-w-0 flex-wrap items-center gap-3">{context}</div>}
    </header>
  )
}

export type ScreenScoreGridProps = {
  children: ReactNode
  className?: string
}

/** Một card trên mobile, 2 card trên tablet/Mac hẹp, 4 card từ desktop rộng. */
export function ScreenScoreGrid({ children, className }: ScreenScoreGridProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {children}
    </div>
  )
}

export type ScreenToolbarProps = {
  children: ReactNode
  label: string
  className?: string
}

/** Mặt công cụ chuẩn. Màn quyết định số cột vì số bộ lọc là dữ liệu nghiệp vụ;
 * template chỉ khóa mặt kính, padding và nhịp giữa control. */
export function ScreenToolbar({ children, label, className }: ScreenToolbarProps) {
  return (
    <GlassCard
      variant="b"
      className={cn('grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:flex xl:items-center', className)}
      aria-label={label}
    >
      {children}
    </GlassCard>
  )
}

export type ScreenDetailGridProps = {
  main: ReactNode
  side: ReactNode
  sideLabel: string
  className?: string
}

/** Màn chi tiết giữ một trục đến hết `lg`; từ `xl` mới chia main–side 3:1 để
 * Mac 13 inch không bị hai cột hẹp, màn lớn vẫn quét được ngữ cảnh bên phải. */
export function ScreenDetailGrid({ main, side, sideLabel, className }: ScreenDetailGridProps) {
  return (
    <div
      className={cn(
        'grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)] xl:gap-8',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-6">{main}</div>
      <aside className="flex min-w-0 flex-col gap-6" aria-label={sideLabel}>
        {side}
      </aside>
    </div>
  )
}
