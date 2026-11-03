import { useEffect, useRef, useState } from 'react'
import { AiMark, ChevronDown, Lock } from '../icons'
import { Avatar } from '../ui/avatar'
import { Icon } from '../ui/icon'
import { THEMES, setTheme, useThemeMode, type ThemeMode } from '../ui/theme-switch'
import { cn } from '../lib/cn'
import type { HeaderAction, HeaderChoice } from './app-header'
import { DEFAULT_SHELL_COPY, type ShellCopy } from './shell-copy'

/** The avatar trigger and its menu, private to AppHeader.
 *
 *  Every row is one shape — icon, label, optional trailing value — because the
 *  menu used to mix icon tiles, section captions and ghost `Button`s passed in
 *  as a ReactNode, three visual languages in a 280px panel. Account actions now
 *  arrive as data, so the app decides WHAT is in the menu and this file alone
 *  decides how a row looks. */

type AccountMenuProps = {
  user: { name: string; role?: string }
  org: string
  /** Core entries reached from here instead of from the top bar. */
  destinations: HeaderAction[]
  assistantLabel: string
  onOpenAssistant?: () => void
  actions?: HeaderAction[]
  /** Set once per person, so it sits here beside the theme, not in the row. */
  language?: HeaderChoice
  copy?: ShellCopy
}

/** The arrow tying a dropdown to its trigger, drawn over the panel's top edge.
 *  10px square, so a `top` 5px above that edge centres it on the edge. */
export function MenuCaret({ className, left }: { className?: string; left?: number }) {
  return (
    <span
      aria-hidden
      style={left === undefined ? undefined : { left }}
      className={cn(
        'glass-overlay-caret absolute z-[51] size-2.5 -translate-x-1/2 rotate-45 rounded-tl-[2px]',
        className,
      )}
    />
  )
}

function Divider() {
  return <div aria-hidden className="bg-surface-ink/10 -mx-2 my-2 h-px" />
}

/** Also the row of tier 2's dropdowns, so both menus in the header share one shape. */
export function MenuRow({
  action,
  trailing,
  onSelect,
  copy = DEFAULT_SHELL_COPY,
}: {
  action: HeaderAction
  trailing?: string
  onSelect: () => void
  copy?: ShellCopy
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={action.locked}
      aria-current={action.active ? 'page' : undefined}
      onClick={() => {
        onSelect()
        action.onClick?.()
      }}
      className={cn(
        'motion-std pointer-coarse:h-12 flex h-9 w-full shrink-0 items-center gap-3 rounded-md px-3 text-left text-[13px]',
        action.active
          ? 'bg-primary/15 text-on-tint-primary font-semibold'
          : action.locked
            ? 'text-muted-foreground'
            : 'text-foreground',
        action.locked ? 'cursor-not-allowed' : 'hover:bg-surface-ink/10',
      )}
    >
      <Icon
        icon={action.icon}
        size={16}
        className={cn(!action.active && 'text-muted-foreground', action.locked && 'opacity-55')}
      />
      <span className="min-w-0 flex-1 truncate">{action.label}</span>
      {trailing ? <span className="text-muted-foreground text-[12px]">{trailing}</span> : null}
      {action.count ? (
        <span className="bg-destructive text-primary-foreground min-w-[18px] rounded-sm px-1 text-center text-[10.5px] font-semibold tabular-nums leading-[18px]">
          {action.count > 99 ? '99+' : action.count}
        </span>
      ) : null}
      {action.locked ? (
        <>
          <Icon icon={Lock} size={14} className="text-muted-foreground opacity-55" />
          <span className="sr-only">{copy.locked}</span>
        </>
      ) : null}
    </button>
  )
}

/** Menu radios rather than a SegmentedControl: inside `role="menu"` only menu
 *  items are announced, and the quiet ground keeps the lit cell at 4.5:1 in
 *  Aurora where white on primary does not reach it. */
function ChoicePicker({ choice }: { choice: HeaderChoice }) {
  return (
    <div role="group" aria-label={choice.label} className="flex flex-col gap-1 px-3 py-1">
      <span aria-hidden className="text-muted-foreground text-[12px]">
        {choice.label}
      </span>
      <div
        className="bg-surface-ink/5 grid gap-1 rounded-md p-1"
        style={{ gridTemplateColumns: `repeat(${choice.options.length}, minmax(0, 1fr))` }}
      >
        {choice.options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={option.value === choice.value}
            onClick={() => choice.onChange(option.value)}
            className={cn(
              'motion-std pointer-coarse:h-12 h-8 rounded-sm text-[12px] font-semibold',
              option.value === choice.value
                ? 'bg-surface-ink/12 text-foreground'
                : 'text-muted-foreground hover:bg-surface-ink/8',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function AccountMenu({
  user,
  org,
  destinations,
  assistantLabel,
  onOpenAssistant,
  actions = [],
  language,
  copy = DEFAULT_SHELL_COPY,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const theme = useThemeMode()
  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={copy.openAccount(user.name)}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'motion-std focus-visible:outline-ring pointer-coarse:h-12 flex h-10 items-center gap-1 rounded-md pl-2 pr-2 focus-visible:outline-2 focus-visible:outline-offset-2',
          open ? 'bg-surface-ink/10' : 'hover:bg-surface-ink/10',
        )}
      >
        {/* Avatar only, no hover card (the button owns hover): the one-row header has no width for a name, and the
            open menu prints name and role in full. */}
        <Avatar name={user.name} size="md" card={false} />
        <Icon
          icon={ChevronDown}
          size={14}
          className={cn('text-muted-foreground motion-std', open && 'rotate-180')}
        />
      </button>

      {open ? <MenuCaret className="left-1/2 top-[calc(100%+7px)]" /> : null}
      {open ? (
        <div
          role="menu"
          aria-label={copy.accountOf(user.name)}
          className="glass-overlay absolute right-0 top-[calc(100%+12px)] z-50 flex max-h-[min(640px,calc(100vh-88px))] w-[min(272px,calc(100vw-32px))] flex-col overflow-y-auto rounded-lg p-2"
        >
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar name={user.name} card={false} />
            <div className="min-w-0">
              <div className="text-foreground truncate text-[13px] font-semibold">{user.name}</div>
              <div className="text-muted-foreground truncate text-[11.5px]">
                {user.role ? `${user.role} · ${org}` : org}
              </div>
            </div>
          </div>

          <Divider />
          {destinations.map((action) => (
            <MenuRow key={action.label} action={action} onSelect={close} copy={copy} />
          ))}
          <MenuRow
            action={{
              icon: AiMark,
              label: assistantLabel,
              locked: !onOpenAssistant,
              onClick: onOpenAssistant,
            }}
            onSelect={close}
            copy={copy}
          />

          <Divider />
          {/* Stays open on purpose: the point of the click is to watch the
              theme change, and closing would hide the very panel that changed. */}
          <ChoicePicker
            choice={{
              label: copy.theme,
              value: theme,
              options: THEMES.map((mode) => ({ value: mode, label: copy.themeNames[mode] })),
              onChange: (mode) => setTheme(mode as ThemeMode),
            }}
          />
          {language ? <ChoicePicker choice={language} /> : null}
          <Divider />
          {actions.map((action) => (
            <MenuRow key={action.label} action={action} onSelect={close} copy={copy} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
