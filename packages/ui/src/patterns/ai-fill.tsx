import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Orbit } from '../icons'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { Skeleton } from '../ui/skeleton'
import { cn } from '../lib/cn'

/** M-21…M-24 · AI fill — the pieces of "fill the empty fields" on a record.
 *
 *  Unlike M-09 the press IS the consent (owner's decision, no review step):
 *  values land straight in empty fields and the result toast (O-08 `Toast`
 *  with an undo action) is the way back. The basis law 9 asks for is
 *  carried per field by `AiFieldMark`, which names where each value came from.
 *
 *  Fixed Vietnamese copy lives here, as in `AiAction`, so every screen says
 *  the same words; the screen only passes data and callbacks. */

/** How long a filled box stays lit; screens pace their own steps by it. */
export const AI_FLASH_MS = 600

/** A ≥48px touch target around a text link or button that sits on a 16px line
 *  (law 13); the caller's row must leave the room. */
const TOUCH_HALO =
  "relative after:absolute after:inset-x-0 after:content-[''] pointer-coarse:after:-inset-y-4"

export type AiFillButtonProps = {
  onClick: () => void
  /** The request is out: busy wording, clicks swallowed. Not `disabled`, which
   *  would fade it under 4.5:1 and drop focus to the page body. */
  busy?: boolean
  /** Given = the button is off and this line, under it, says what is missing. */
  disabledReason?: string
  className?: string
}

/** M-21 · AiFillButton */
export function AiFillButton({
  onClick,
  busy = false,
  disabledReason,
  className,
}: AiFillButtonProps) {
  const reasonId = useId()
  return (
    <span className={cn('inline-flex flex-col items-start gap-1', className)}>
      <Button
        variant="secondary"
        className={cn('pointer-coarse:h-12', busy && 'cursor-progress')}
        disabled={disabledReason !== undefined}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        aria-describedby={disabledReason ? reasonId : undefined}
        onClick={busy ? undefined : onClick}
      >
        <Icon icon={Orbit} />
        {busy ? 'Đang điền…' : 'Điền ô còn thiếu'}
      </Button>
      {disabledReason && (
        <span id={reasonId} className="text-muted-foreground text-[12px] leading-[1.6]">
          {disabledReason}
        </span>
      )}
    </span>
  )
}

/** `filled` draws the field as it is; the caption under it is `AiFieldMark`. */
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

export type AiFieldMarkProps = {
  /** Where the value came from: a host, or the tax registry. */
  source: string
  /** Opens the source in a new tab so the reader can check it. */
  sourceHref?: string
  /** Only one web source, or the registry name did not match: adds the warning badge. */
  unsure?: boolean
  className?: string
}

/** M-23 · AiFieldMark — the caption under an AI-filled field. The screen drops
 *  it once a person edits that field. */
export function AiFieldMark({ source, sourceHref, unsure, className }: AiFieldMarkProps) {
  return (
    <span
      className={cn(
        'text-accent-foreground inline-flex flex-wrap items-center gap-1 text-[12px] leading-[16px]',
        sourceHref && 'pointer-coarse:min-h-12',
        className,
      )}
    >
      <Icon icon={Orbit} size={12} />
      <span>AI điền ·</span>
      {sourceHref ? (
        <a
          href={sourceHref}
          target="_blank"
          rel="noreferrer"
          className={cn('underline underline-offset-2 hover:no-underline', TOUCH_HALO)}
        >
          {source}
        </a>
      ) : (
        <span>{source}</span>
      )}
      {unsure && (
        <>
          <span aria-hidden>·</span>
          <Badge tone="warning">Chưa chắc</Badge>
        </>
      )}
    </span>
  )
}

export type AiFieldConflictProps = {
  /** The value found, e.g. the tax code. */
  value: string
  /** The account in the book that already holds `value`. */
  ownerName: string
  /** Opens that account; absent (no permission to view it) = plain name. */
  onOpenOwner?: () => void
  /** Attaches the record to that account instead of filling the field. */
  onAttach: () => void
  className?: string
}

/** M-24 · AiFieldConflict — the value was found but belongs to another account,
 *  so the field stays empty and the person chooses. */
export function AiFieldConflict({
  value,
  ownerName,
  onOpenOwner,
  onAttach,
  className,
}: AiFieldConflictProps) {
  return (
    <span
      className={cn(
        'text-muted-foreground flex flex-wrap items-center gap-2 text-[12px] leading-[16px]',
        className,
      )}
    >
      <Badge tone="danger">Trùng công ty</Badge>
      <span className="pointer-coarse:min-h-12 inline-flex flex-wrap items-center gap-1">
        <span className="font-mono">{value}</span>
        <span>đã thuộc</span>
        {onOpenOwner ? (
          <button
            type="button"
            onClick={onOpenOwner}
            className={cn(
              'text-accent-foreground underline underline-offset-2 hover:no-underline',
              TOUCH_HALO,
            )}
          >
            {ownerName}
          </button>
        ) : (
          ownerName
        )}
      </span>
      <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onAttach}>
        Gắn vào công ty này
      </Button>
    </span>
  )
}
