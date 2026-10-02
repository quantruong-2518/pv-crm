import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button, Icon, cn, type ButtonProps, type IconGlyph } from '@pv/ui'

/** A button that discloses a short list of choices — the record action bar's
 *  "which contact" pickers and its more menu.
 *
 *  Local because `@pv/ui` has no menu yet (requested); same face as the mail
 *  composer's send menu (`glass-overlay`, 48px rows). A disclosure of plain
 *  buttons, not `role="menu"`: that role promises arrow keys this does not
 *  have. A shut row stays focusable (`aria-disabled`) with its reason in its
 *  own text, not in a `title`: a finger never sees a tooltip. */

export type MenuChoice = {
  key: string
  label: ReactNode
  /** A second line — role, number, or why the row is shut. */
  hint?: ReactNode
  /** Set = the row is shut, and this is printed as its hint. */
  blocked?: string
  tone?: 'danger'
  onSelect: () => void
}

export function MenuButton({
  label,
  icon,
  ariaLabel,
  choices,
  up = false,
  variant = 'ghost',
  size = 'lg',
  align = 'left',
  className,
}: {
  label: ReactNode
  icon?: IconGlyph
  ariaLabel?: string
  choices: MenuChoice[]
  /** Open above the button — for a bar pinned to the bottom of the screen. */
  up?: boolean
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  align?: 'left' | 'right'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    panel.current?.querySelector('button')?.focus()
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const pick = (choice: MenuChoice) => {
    if (choice.blocked !== undefined) return
    setOpen(false)
    /* Back on the trigger first, so a dialog the choice opens returns here. */
    trigger.current?.focus()
    choice.onSelect()
  }

  return (
    <div
      ref={root}
      className="relative"
      /* `null` (a Safari click, a window switch) is left to the pointer guard. */
      onBlur={(e) => {
        const next = e.relatedTarget
        if (next && !root.current?.contains(next)) setOpen(false)
      }}
    >
      <Button
        ref={trigger}
        size={size}
        variant={variant}
        className={className}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {icon && <Icon icon={icon} size={16} />}
        {label}
      </Button>
      {open && (
        <div
          ref={panel}
          id={menuId}
          className={cn(
            'glass-overlay absolute z-30 flex max-h-[60vh] min-w-[240px] max-w-[320px] flex-col overflow-y-auto rounded-lg p-1',
            up ? 'bottom-full mb-2' : 'top-full mt-2',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {choices.map((choice) => (
            <button
              key={choice.key}
              type="button"
              aria-disabled={choice.blocked !== undefined || undefined}
              onClick={() => pick(choice)}
              className={cn(
                'motion-std flex min-h-12 flex-col justify-center gap-1 rounded-md px-4 py-2 text-left',
                choice.blocked === undefined ? 'hover:bg-surface-ink/9' : 'cursor-not-allowed',
                choice.tone === 'danger' && 'text-destructive-foreground',
              )}
            >
              <span
                className={cn(
                  'text-[14px] font-medium',
                  choice.blocked !== undefined && 'text-muted-foreground',
                )}
              >
                {choice.label}
              </span>
              {(choice.blocked ?? choice.hint) && (
                <span className="text-muted-foreground text-[12px] leading-[1.5]">
                  {choice.blocked ?? choice.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
