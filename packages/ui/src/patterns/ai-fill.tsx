import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { AiMark } from '../icons'
import { Icon } from '../ui/icon'
import { Skeleton } from '../ui/skeleton'
import { cn } from '../lib/cn'

/** M-21…M-22 · AI fill — the pieces of "fill the empty fields" on a record.
 *
 *  Unlike M-09 the press IS the consent (owner's decision, no review step):
 *  values land straight in empty fields and Undo on the finished job in the
 *  task tray (O-12) is the way back.
 *
 *  Words come in by props, as in `AiTaskTray`: en/ko screens must not show
 *  Vietnamese, so nothing here carries a default string. */

/** How long a filled box stays lit; screens pace their own steps by it. */
export const AI_FLASH_MS = 600

export type AiFillButtonProps = {
  onClick: () => void
  /** A job is running: the mark animates, and a press opens the tray
   *  (the caller decides) instead of starting a second job. */
  busy?: boolean
  /** Tooltip and aria-label while idle, e.g. "Fill empty fields with AI". */
  label: string
  /** The same while a job runs, e.g. "Filling with AI, see the task tray". */
  busyLabel: string
  /** Given = the button is off and this line, under it, says what is missing. */
  disabledReason?: string
  className?: string
}

/** M-21 · AiFillButton — icon only; the words live in `title` and `aria-label`. */
export function AiFillButton({
  onClick,
  busy = false,
  label: idleLabel,
  busyLabel,
  disabledReason,
  className,
}: AiFillButtonProps) {
  const reasonId = useId()
  const hintId = useId()
  const label = busy ? busyLabel : idleLabel
  return (
    <span
      className={cn('group/ai-fill relative inline-flex flex-col items-start gap-1', className)}
    >
      <button
        type="button"
        className="focus-visible:outline-ring pointer-coarse:size-12 inline-flex size-10 items-center justify-center rounded-md bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-45"
        disabled={disabledReason !== undefined}
        aria-label={label}
        aria-busy={busy || undefined}
        aria-describedby={disabledReason ? `${hintId} ${reasonId}` : hintId}
        onClick={onClick}
      >
        <Icon icon={AiMark} size={30} aiState={busy ? 'loading' : 'idle'} />
      </button>
      <span
        id={hintId}
        role="tooltip"
        className="bg-popover text-popover-foreground pointer-events-none absolute bottom-[calc(100%+8px)] right-0 z-30 w-max max-w-60 rounded-md px-3 py-2 text-xs leading-[1.4] opacity-0 shadow-[var(--shadow-pop)] transition-opacity duration-150 group-focus-within/ai-fill:opacity-100 group-hover/ai-fill:opacity-100"
      >
        {label}
      </span>
      {disabledReason && (
        <span id={reasonId} className="text-muted-foreground text-[12px] leading-[1.6]">
          {disabledReason}
        </span>
      )}
    </span>
  )
}

/** `filled` draws the field as it is. */
export type AiFillState = 'waiting' | 'flash' | 'filled'

export type AiFillFieldProps = {
  state?: AiFillState
  /** Any field control (`Input`, `Select`, `TagInput`…); it is not touched. */
  children: ReactNode
  className?: string
}

/** M-22 · AiFillField — wraps a control instead of adding a prop to each atom.
 *
 *  Both states are layers over the control: `waiting` hides it under a skeleton
 *  (it keeps its height and cannot be typed into); `flash` lays a tint + 2px ring on
 *  top and fades it over `AI_FLASH_MS`. The tint is `primary/16`, not `--accent`:
 *  `--accent` is opaque in the stone and porcelain themes and would hide the
 *  value it announces. */
export function AiFillField({ state, children, className }: AiFillFieldProps) {
  const flash = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = flash.current
    if (!el) return
    /* Force a style pass so the lit frame is the transition's start; without it
       the browser sees only opacity 0 and nothing fades. */
    el.getBoundingClientRect()
    el.style.opacity = '0'
  }, [state])

  return (
    <span aria-busy={state === 'waiting' || undefined} className={cn('relative block', className)}>
      <span className={cn('block', state === 'waiting' && 'invisible')}>{children}</span>
      {state === 'waiting' && (
        <span className="bg-input absolute inset-0 flex items-center rounded-md px-4">
          <Skeleton width="70%" height={12} />
        </span>
      )}
      {state === 'flash' && (
        <span
          ref={flash}
          aria-hidden
          style={{ transitionDuration: `${AI_FLASH_MS}ms` }}
          className="bg-primary/16 pointer-events-none absolute inset-0 rounded-md shadow-[inset_0_0_0_2px_var(--ring)] transition-opacity ease-out motion-reduce:hidden"
        />
      )}
    </span>
  )
}
