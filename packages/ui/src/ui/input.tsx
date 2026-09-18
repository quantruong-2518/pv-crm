import * as React from 'react'
import { cn } from '../lib/cn'

/** A-04 · Input — bg-input h-10 rounded-md focus:ring-2 ring-ring.
 *  Borderless: trạng thái đọc bằng ring, không bằng viền. */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean
  /** A unit riding at the right edge, INSIDE the box — `₫ VND`, `%`, `kg`.
   *
   *  A flex sibling of the field rather than an overlay pinned with `absolute`:
   *  an overlay needs right padding guessed wide enough for the longest unit,
   *  and the guess is wrong twice — it crowds `₫ VND` at nine digits and leaves
   *  a hole after `%`. As a sibling the gap is 8px whatever either one is.
   *
   *  It is decoration, so it carries `aria-hidden` and does not swallow clicks;
   *  the field still needs its own accessible name. The focus and invalid rings
   *  move to the shell, which is the whole point of having it here: a caller
   *  building this shape by hand copies both rings and they drift on the next
   *  edit to this file. */
  suffix?: React.ReactNode
}

/** ONE literal for the 14px side padding, which is off the 8-step scale and an
 *  existing line of lint debt (`Textarea` says the same and refuses to copy it).
 *  The shell must match the bare field to the pixel, and a second copy of the
 *  number is both a second debt and the place the two shapes drift apart. */
const FIELD_PAD = 'px-[14px]'

/* Both focus rings are written out WHOLE, never built from a shared piece:
   Tailwind only generates classes it finds verbatim in source, so a
   `focus-within:${ring}` template produces no CSS at all. */
const INVALID_RING =
  'text-destructive-foreground shadow-[0_0_0_2px_color-mix(in_srgb,var(--destructive)_50%,transparent)]'

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, suffix, ...props }, ref) => {
    const field = (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'motion-std bg-input text-foreground h-10 w-full rounded-md text-[12.5px] outline-none',
          FIELD_PAD,
          'placeholder:text-muted-foreground',
          'focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
          invalid && INVALID_RING,
          className,
        )}
        {...props}
      />
    )

    if (suffix === undefined) return field

    /* The shell takes the ground and both rings; the field goes transparent and
       keeps only what the caller sent it (alignment, `font-mono`, `tnum`). */
    return (
      <span
        className={cn(
          'motion-std bg-input flex h-10 w-full min-w-0 items-center gap-2 rounded-md',
          FIELD_PAD,
          'focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
          invalid && INVALID_RING,
        )}
      >
        {React.cloneElement(field, {
          className: cn(
            'text-foreground min-w-0 flex-1 bg-transparent p-0 text-[12.5px] outline-none',
            'placeholder:text-muted-foreground',
            className,
          ),
        })}
        <span aria-hidden className="text-muted-foreground shrink-0 text-[11px]">
          {suffix}
        </span>
      </span>
    )
  },
)
Input.displayName = 'Input'
