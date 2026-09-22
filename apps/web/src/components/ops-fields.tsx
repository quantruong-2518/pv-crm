import { type ReactNode } from 'react'
import { cn } from '@pv/ui'
import type { SetDraft } from '@/data/deal-draft'

/** The FRAME every deal form shares — one box, one wording.
 *
 *  Drawn by the convert panel (`convert-dialog.tsx`), the deal form card
 *  (`pages/opportunity-form-card.tsx`) and the sign panel alike. Two copies
 *  drift on the first fix: a label moves on one screen, a refusal lands
 *  elsewhere on the other, and no test catches it because each copy agrees
 *  with itself. The BOXES live in `deal-fields.tsx`.
 *
 *  TWO LABEL TABLES AND THE LOSS BLOCK LEFT ON 22/09 (ADR 0064). Column and
 *  state names come from `OPPORTUNITY_STAGE_LABEL` / `OPPORTUNITY_STATE_LABEL`
 *  in `@pv/contracts`, where the server reads them too — a `Map` built here off
 *  the frozen fixture was a second copy of one vocabulary. And no form asks why
 *  a deal was parked: that is the care door's own panel.
 *
 *  COMPONENTS ONLY — `missingOf` and `toggled` sit in `data/opportunities.ts`. */

/** Re-exported so a screen drawing these boxes has ONE door to import from.
 *  Declared beside the draft itself — the write layer owns the shape. */
export type { SetDraft }

/** One box of a form. Same shape as the lead form's boxes — two places to
 *  type in one app that look different read as two products.
 *
 *  `errors` REPLACES `hint` instead of stacking a line under it: the eye is
 *  already on the line right below the box, so the refusal belongs exactly
 *  there. Stacking both makes every wrong box a line longer, and on a form
 *  this size the submit button drifts off screen mid-fix. */
export function Field({
  label,
  required,
  hint,
  errors,
  plain,
  grow,
  className,
  children,
}: {
  /** `ReactNode` so a box may put a glyph beside its own name. The head is a
   *  flex row, so a node label and the star stay on ONE line. */
  label: ReactNode
  required?: boolean
  hint?: ReactNode
  /** What the server just said about THIS box. Absent or empty = no complaint. */
  errors?: string[]
  /** Drop the wrapping `<label>` — for a Select or a button group that
   *  carries its own name. */
  plain?: boolean
  /** Fill the grid cell instead of hugging the control, so two boxes standing
   *  side by side end on the same line. Off by default: a box that stretches
   *  with nothing to stretch to would collapse its own control. */
  grow?: boolean
  className?: string
  children: ReactNode
}) {
  const wrong = Boolean(errors?.length)

  /* A FLEX ROW, not an inline span. The label may be a node — a status dot
     beside a word — and a block-level child inside an inline span pushes the
     star onto a second line, which is exactly what it used to do. */
  const head = (
    <span
      className={cn(
        'flex items-center gap-1 text-[11px]',
        wrong ? 'text-destructive-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      {required && (
        <span className="text-warning" aria-hidden="true">
          *
        </span>
      )}
    </span>
  )

  const body = cn('flex flex-col gap-2', grow && 'min-h-0 flex-1')

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', grow && 'h-full', className)}>
      {plain ? (
        <div className={body}>
          {head}
          {children}
        </div>
      ) : (
        <label className={body}>
          {head}
          {children}
        </label>
      )}
      {wrong ? (
        <span role="alert" className="text-destructive-foreground text-[11px] leading-[1.5]">
          {errors?.join(' · ')}
        </span>
      ) : (
        hint && <span className="text-muted-foreground text-[11px] leading-[1.5]">{hint}</span>
      )}
    </div>
  )
}
