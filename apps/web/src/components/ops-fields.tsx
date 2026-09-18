import { type ReactNode } from 'react'
import { TriangleAlert } from '@pv/ui'
import { Button, Icon, Kicker, Textarea, cn } from '@pv/ui'
import { OPPORTUNITY_LOSS_NOTE_MAX } from '@pv/contracts'
import type { FieldErrors } from '@/app/api'
import type { SetDraft } from '@/data/deal-draft'
import {
  OPPORTUNITY_STATES,
  PIPELINE_STAGES,
  type OpportunityDraft,
} from '@pv/engines/fixtures/das-vina'
import { useLossReasons } from '@/data/sales-config'

/** The FRAME and the labels every deal form shares.
 *
 *  One field frame, one status wording, one loss block — drawn by the convert
 *  panel (`convert-dialog.tsx`) and the deal form card
 *  (`pages/opportunity-form-card.tsx`) alike. Two copies drift on the first
 *  fix: a label moves on one screen, a refusal lands elsewhere on the other,
 *  and no test catches it because each copy agrees with itself.
 *
 *  The BOXES live in `deal-fields.tsx` — both screens now ask for the same
 *  ones. Not in `@pv/ui`: `LossBlock` reads an app query and the deal states
 *  are Sales knowledge, which the library may not hold (package boundary).
 *
 *  COMPONENTS ONLY. `missingOf` and `toggled` are rules of the form rather
 *  than ways of drawing a box, so they sit in `data/opportunities.ts`. */

/** Re-exported so a screen drawing these boxes has ONE door to import from.
 *  Declared beside the draft itself — the write layer owns the shape. */
export type { SetDraft }

export const STATE_LABEL = new Map(OPPORTUNITY_STATES.map((s) => [s.key, s.label]))
export const STAGE_LABEL = new Map(PIPELINE_STAGES.map((s) => [s.key, s.label]))

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

/** Why the deal was lost — shown only while the status is Close lost.
 *
 *  The catalog reasons are one tap, and the note box stays OPEN rather than
 *  hiding behind an "other" button: the real reason is usually a catalog
 *  reason PLUS a sentence of this deal's own, not one or the other.
 *
 *  A lost deal with no reason recorded is a lesson thrown away, so this block
 *  holds the submit button until it has one. */
export function LossBlock({
  draft,
  onSet,
  errors = {},
}: {
  draft: OpportunityDraft
  onSet: SetDraft
  errors?: FieldErrors
}) {
  /* The buttons read from the server's `LOSS_REASON` catalog, not from a
     fixture constant: changing a reason is the sales team's job on the
     configuration screen, not a build. */
  const reasons = useLossReasons()

  return (
    <section
      className="bg-surface-ink/5 flex flex-col gap-4 rounded-md p-4"
      aria-label="Lý do thua"
    >
      <div className="flex flex-col gap-2">
        <Kicker>
          <span className="flex items-center gap-2">
            <Icon icon={TriangleAlert} size={16} className="text-warning" />
            Vì sao thua
          </span>
        </Kicker>
        <span className="text-muted-foreground text-[11px] leading-[1.5]">
          Danh sách MỞ, sửa được ở Thiết lập — khác sáu lý do lead ra khỏi luồng, vốn là danh sách
          đóng. Một đơn thua không ghi lý do là một bài học mất trắng.
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {reasons.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={draft.lossReason === r ? 'default' : 'ghost'}
              aria-pressed={draft.lossReason === r}
              onClick={() => onSet('lossReason', draft.lossReason === r ? '' : r)}
            >
              {r}
            </Button>
          ))}
        </div>
        {/* The seven buttons are a fixed list well inside the contract's 120,
            so this line only ever carries the CROSS-FIELD refusal — "a lost
            deal must record a reason", which zod reports on `lossReason`. */}
        {errors.lossReason && (
          <span role="alert" className="text-destructive-foreground text-[11px] leading-[1.5]">
            {errors.lossReason.join(' · ')}
          </span>
        )}
      </div>

      <Field
        label="Ghi rõ thêm"
        errors={errors.lossNote}
        hint="Câu của riêng đơn này — tên đối thủ, con số họ chào, ai đổi ý."
      >
        <Textarea
          autoGrow
          rows={2}
          maxLength={OPPORTUNITY_LOSS_NOTE_MAX}
          invalid={Boolean(errors.lossNote)}
          value={draft.lossNote}
          aria-label="Ghi rõ lý do thua"
          onChange={(e) => onSet('lossNote', e.target.value)}
        />
      </Field>
    </section>
  )
}
