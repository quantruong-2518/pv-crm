import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Lock } from '../icons'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'
import { MenuCaret, MenuRow } from './account-menu'
import type { HeaderApp } from './app-header'

/** Tier 2 of AppHeader — the apps, in groups, private to AppHeader.
 *
 *  The row scrolls sideways at EVERY width when it does not fit. It used to turn
 *  `overflow-x-visible` from `lg` so dropdowns would not be clipped, which let
 *  the last entries spill out of the header at 1024px. A scroll box clips its
 *  absolute children on both axes, so the open dropdown is rendered beside the
 *  row rather than inside it, and placed under its button by measurement. */

type AppNavProps = {
  /** Empty groups are dropped, so a role that sees none of a cluster gets no
   *  stray separator either. */
  groups: HeaderApp[][]
  className?: string
}

function LockMark() {
  return (
    <>
      <Icon icon={Lock} size={14} className="opacity-55" />
      <span className="sr-only">chưa mở</span>
    </>
  )
}

function AppButton({
  app,
  open,
  menuId,
  onToggle,
}: {
  app: HeaderApp
  open: boolean
  menuId: string
  onToggle: (button: HTMLButtonElement) => void
}) {
  const hasItems = Boolean(app.items?.length) && !app.locked
  return (
    <button
      type="button"
      title={app.description ?? app.label}
      aria-label={
        app.count
          ? `${app.label} · ${app.count} đang chờ`
          : app.description
            ? `${app.label}. ${app.description}`
            : app.label
      }
      disabled={app.locked}
      aria-expanded={hasItems ? open : undefined}
      aria-haspopup={hasItems ? 'menu' : undefined}
      aria-controls={hasItems && open ? menuId : undefined}
      aria-current={app.active ? 'page' : undefined}
      onClick={(e) => (hasItems ? onToggle(e.currentTarget) : app.onClick?.())}
      /* Locked: only the icons dim, the label keeps `--muted-foreground`.
         Dimming the whole button measured 2.29:1, below law 13's 4.5:1. */
      className={cn(
        'motion-std pointer-coarse:h-12 group flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-[14px] font-medium max-xl:w-10 max-xl:px-0',
        app.active || open ? 'bg-primary/15 text-on-tint-primary' : 'text-foreground/80',
        app.locked ? 'cursor-not-allowed' : 'hover:bg-surface-ink/10 hover:text-foreground',
      )}
    >
      <Icon icon={app.icon} size={18} className={cn(app.locked && 'opacity-55')} />
      <span className="hidden xl:inline">{app.label}</span>
      {app.count ? (
        /* No fill on an active or hovered entry: warning/20 over primary/15
           measured 4.06:1 in stone, over the hover tint 4.16:1; the bare ink
           reads 5.40:1 and above (law 13). */
        <span
          className={cn(
            'text-on-tint-warning-strong tnum min-w-[18px] rounded-sm px-1 text-center text-[11px] font-semibold leading-[18px]',
            !app.active && 'bg-warning/20 group-hover:bg-transparent',
          )}
        >
          {app.count > 99 ? '99+' : app.count}
        </span>
      ) : null}
      {hasItems ? (
        <Icon
          icon={ChevronDown}
          size={14}
          className={cn('motion-std -ml-1 hidden xl:block', open && 'rotate-180')}
        />
      ) : null}
      {app.locked ? <LockMark /> : null}
    </button>
  )
}

/** Half of the dropdown's fixed width — how far its centre must stay from either
 *  edge of the header so a menu opened near a scrolled edge is not cut off. */
const MENU_HALF = 116

export function AppNav({ groups, className }: AppNavProps) {
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  /** One dropdown at a time — two open menus leave nobody sure which entry is
   *  being talked about. `center` is the opening button's midpoint in the root. */
  const [open, setOpen] = useState<{ label: string; center: number } | null>(null)
  const openApp = open ? groups.flat().find((a) => a.label === open.label) : undefined
  const visible = groups.filter((group) => group.length > 0)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const renderApp = (app: HeaderApp) => (
    <AppButton
      key={app.label}
      app={app}
      open={open?.label === app.label}
      menuId={menuId}
      onToggle={(button) =>
        setOpen(
          open?.label === app.label
            ? null
            : {
                label: app.label,
                center:
                  button.offsetLeft + button.offsetWidth / 2 - (rowRef.current?.scrollLeft ?? 0),
              },
        )
      }
    />
  )
  const rootWidth = rootRef.current?.clientWidth ?? 0

  return (
    <div
      ref={rootRef}
      className={cn(
        'max-lg:before:bg-surface-ink/10 relative z-[1] max-lg:before:absolute max-lg:before:inset-x-0 max-lg:before:top-0 max-lg:before:h-px',
        className,
      )}
    >
      {/* Scrolling closes the menu, which would otherwise float free. */}
      <div
        ref={rowRef}
        onScroll={() => setOpen(null)}
        className="flex h-12 items-center overflow-x-auto"
      >
        <div className="flex shrink-0 items-center gap-1">
          {visible.map((group, i) => (
            <Fragment key={group[0]?.label}>
              {i > 0 ? (
                <span aria-hidden className="bg-surface-ink/10 mx-2 h-5 w-px shrink-0" />
              ) : null}
              {group.map(renderApp)}
            </Fragment>
          ))}
        </div>
      </div>

      {open && openApp?.items ? (
        <>
          <MenuCaret left={open.center} className="top-[calc(100%-1px)]" />
          <div
            id={menuId}
            role="menu"
            aria-label={openApp.label}
            style={{ left: Math.min(Math.max(open.center, MENU_HALF), rootWidth - MENU_HALF) }}
            className="glass-overlay motion-std starting:-translate-y-1 starting:opacity-0 absolute top-[calc(100%+4px)] z-50 flex w-[232px] -translate-x-1/2 flex-col rounded-lg p-2"
          >
            {openApp.items.map((item) => (
              <MenuRow key={item.label} action={item} onSelect={() => setOpen(null)} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
