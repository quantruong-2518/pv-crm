import type { ReactNode } from 'react'
import { cn } from '@pv/ui'

/** Label row · control · hint — the three lines every field of the two lead
 *  doors is built from.
 *
 *  It was declared inside `mas-mail-modal.tsx` and copied by hand into the
 *  meeting drawer the first time; two copies of a label row drift within a
 *  release, and "the label is 11px here and 11.5px there" is the kind of
 *  difference the eye reads before it reads any word. */
export type FieldProps = {
  label: string
  /** Right of the label — a counter such as `12/200`. */
  note?: string
  /** Right of the label too, sharing the counter's slot — a small control. */
  action?: ReactNode
  hint?: ReactNode
  /** One sentence in `--warning` under the control: what is wrong with what is
   *  typed, said where it is typed rather than only at the footer. */
  problem?: string
  children: ReactNode
  className?: string
}

export function Field({ label, note, action, hint, problem, children, className }: FieldProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="text-muted-foreground text-[11px]">{label}</span>
        {note && <span className="text-muted-foreground font-mono text-[10.5px]">{note}</span>}
        {action}
      </div>
      {children}
      {problem ? (
        <span className="text-warning text-[11px] leading-[1.5]">{problem}</span>
      ) : (
        hint && <span className="text-muted-foreground text-[11px] leading-[1.5]">{hint}</span>
      )}
    </div>
  )
}
