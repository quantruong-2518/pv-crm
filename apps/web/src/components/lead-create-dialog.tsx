import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Plus, X } from '@pv/ui'
import { Button, Drawer, Icon, Input, Select, Textarea, cn } from '@pv/ui'
import type { LeadCreateResponse } from '@pv/contracts'
import { isApiError, type FieldErrors } from '@/app/api'
import { DEADLINE_MAX, DEADLINE_MIN } from '@/data/lead-form'
import {
  buildLeadCreate,
  createFailureMessage,
  createFieldsOf,
  CREATE_GROUPS,
  emptyDraft,
  ROOT_FIELD,
  useCreateLead,
  type CreateField,
  type LeadDraft,
} from '@/data/lead-create'

/** Module 2 · "Gõ tay" — one lead, typed one field at a time.
 *
 *  ------------------------------------------------------------------
 *  THE FOURTH DOOR, AND THE NARROWEST ONE
 *  ------------------------------------------------------------------
 *  Three doors already exist into the lead book: a campaign wave that drops
 *  its answers in, a file dragged onto the import panel, and the public
 *  landing form. This is the fourth — one row, one person, who owns every cell
 *  they typed. `INTAKE_FACE.tay` in `data/intake.ts` has been carrying
 *  `built: false` next to that description; this is the door it was waiting
 *  for.
 *
 *  ------------------------------------------------------------------
 *  A DRAWER, NOT A CENTRED BOX
 *  ------------------------------------------------------------------
 *  `Drawer` (T-04) is what this repo means by "dialog": scrim, `role="dialog"`,
 *  `aria-modal`, Escape to close, focus moved into the panel, and one exit
 *  animation everything shares. `ExitDialog` and `ConvertDialog` are both built
 *  on it. A second modal mechanism next to it would be a second set of all
 *  those behaviours, and the second set is where the focus trap gets forgotten.
 *
 *  ------------------------------------------------------------------
 *  WHAT THIS FORM DELIBERATELY DOES NOT ASK
 *  ------------------------------------------------------------------
 *  There is no Sale / BD / Marketing control, and it is not an oversight. The
 *  contract takes actor IDS, no endpoint hands this app the staff book, and an
 *  id guessed from the frozen fixture may name somebody `platform.actor` has
 *  never heard of — which is a 400 arriving AFTER the user has typed twenty
 *  fields, about a field they had no way to get right. So a lead typed here
 *  lands in the common pool with nobody holding it, exactly like the nineteen
 *  Apollo rows already in the book. Handing it over is a separate act, with a
 *  separate door.
 *
 *  Which controls the form draws at all is not decided here either — see
 *  `data/lead-create.ts`, where the drawn set is the intersection of the
 *  profile's field table and the contract's own shape. */

/** The submit button lives in the drawer's footer, which is a sibling of the
 *  children, not a descendant — so the two are tied by `form=` rather than by
 *  nesting. Keeps Enter-to-submit working, which a footer button wired with
 *  `onClick` would quietly lose. */
const FORM_ID = 'lead-create-form'

export type LeadCreateDialogProps = {
  open: boolean
  onClose: () => void
  /** The row the server just wrote, normalised. Handed straight over so the
   *  screen never has to go looking through the book for what it already has —
   *  the 201 carries the whole row for exactly this reason. */
  onCreated?: (lead: LeadCreateResponse) => void
}

export function LeadCreateDialog({ open, onClose, onCreated }: LeadCreateDialogProps) {
  const [draft, setDraft] = useState<LeadDraft>(emptyDraft)
  const [errors, setErrors] = useState<FieldErrors>({})
  const create = useCreateLead()
  const { reset } = create

  /* Opening is a fresh start. Closing without submitting is an answer too, and
     keeping twenty half-typed fields for next time means the next lead quietly
     inherits the last one's industry. */
  useEffect(() => {
    if (!open) return
    setDraft(emptyDraft())
    setErrors({})
    reset()
  }, [open, reset])

  /* Typing into a box the server just complained about clears that complaint.
     A red outline that survives the fix reads as "still wrong", and the user
     stops believing any of them. */
  const set = (field: CreateField, raw: string) => {
    setDraft((current) => ({ ...current, [field.wire]: raw }))
    setErrors((current) => {
      if (!current[field.wire]) return current
      const { [field.wire]: _fixed, ...rest } = current
      return rest
    })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    /* Two human clicks are two real requests — `mayReplay` only refuses the
       AUTOMATIC replay of a write. Without this the second click is a second
       lead. */
    if (create.isPending) return

    const built = buildLeadCreate(draft)
    if (!built.ok) {
      setErrors(built.errors)
      return
    }

    setErrors({})
    create.mutate(built.body, {
      onSuccess: (lead) => {
        onCreated?.(lead)
        onClose()
      },
      /* The server has the last word, and when it refuses it says which box.
         `errors` empty is not "no complaint" — it is a complaint about no one
         field, and the sentence in the footer carries it. */
      onError: (error) => setErrors(error.errors ?? {}),
    })
  }

  const failure = create.error && isApiError(create.error) ? create.error : null
  const rootErrors = errors[ROOT_FIELD]

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title="Gõ tay một lead"
      subtitle="Một dòng một lần, người gõ chịu trách nhiệm từng ô. Lead vào sổ ở kho chung, chưa ai nhận — giao cho người phụ trách là một việc riêng."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <FooterNote failure={failure ? createFailureMessage(failure) : null} root={rootErrors} />

          <div className="flex shrink-0 gap-2">
            <Button size="md" variant="ghost" type="button" onClick={onClose}>
              <Icon icon={X} size={16} />
              Huỷ
            </Button>
            <Button size="md" type="submit" form={FORM_ID} disabled={create.isPending}>
              <Icon icon={Plus} size={16} />
              {create.isPending ? 'Đang ghi…' : 'Tạo lead'}
            </Button>
          </div>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-6">
        {CREATE_GROUPS.map((group) => (
          <section key={group.key} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-display text-[14px] font-semibold">{group.label}</span>
              <span className="text-muted-foreground text-[11.5px]">{group.purpose}</span>
            </div>

            {/* Two columns and no third, unlike the profile card. Tailwind
                breakpoints measure the VIEWPORT while this panel is 760px wide
                whatever the screen does, so an `xl:grid-cols-3` here would cut
                every box down to 230px on a wide monitor — the exact fault
                `data/lead-form.ts` records as "lần 1". */}
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {createFieldsOf(group.key).map((field) => (
                <FieldShell key={field.wire} field={field} errors={errors[field.wire]}>
                  <FieldControl
                    field={field}
                    value={draft[field.wire] ?? ''}
                    invalid={Boolean(errors[field.wire])}
                    onChange={(raw) => set(field, raw)}
                  />
                </FieldShell>
              ))}
            </div>
          </section>
        ))}
      </form>
    </Drawer>
  )
}

// ---------------------------------------------------------------------------
// One box
// ---------------------------------------------------------------------------

/** Label · control · then EITHER the field's hint OR what the server disliked
 *  about it, never both.
 *
 *  Swapping rather than stacking is the whole trick: the eye already goes to
 *  the line under a box it just filled in, so the complaint belongs exactly
 *  there. Stacking both pushes the message down a line and grows the form by
 *  one row for every field in error, which on a twenty-field form is enough to
 *  move the button off screen mid-correction. */
function FieldShell({
  field,
  errors,
  children,
}: {
  field: CreateField
  errors?: string[]
  children: ReactNode
}) {
  const wrong = Boolean(errors?.length)

  const head = (
    <span
      className={cn('text-[11px]', wrong ? 'text-destructive-foreground' : 'text-muted-foreground')}
    >
      {field.label}
      {field.required && (
        <span className="text-warning" aria-hidden="true">
          {' '}
          *
        </span>
      )}
    </span>
  )

  const body = (
    <>
      {head}
      {children}
    </>
  )

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* `Select` (A-15) brings its own `<label>`; nesting a second one is
          invalid HTML and makes a screen reader announce two names for one
          control. Same exception `ProfileCard` makes. */}
      {field.kind === 'select' ? body : <label className="flex flex-col gap-2">{body}</label>}

      {wrong ? (
        <span role="alert" className="text-destructive-foreground text-[11px] leading-[1.5]">
          {errors?.join(' · ')}
        </span>
      ) : (
        field.hint && (
          <span className="text-muted-foreground text-[11px] leading-[1.5]">{field.hint}</span>
        )
      )}
    </div>
  )
}

/** Thousands separators while typing — same helper and same reason as the
 *  profile form: seven digits in a row cannot be read by eye, and a missing
 *  zero is a factor of ten nobody notices. Display only; `buildLeadCreate`
 *  strips everything that is not a digit on the way out. */
const grouped = (raw: string) => (raw === '' ? '' : Number(raw).toLocaleString('vi-VN'))

function FieldControl({
  field,
  value,
  invalid,
  onChange,
}: {
  field: CreateField
  value: string
  invalid: boolean
  onChange: (raw: string) => void
}) {
  const required = field.required || undefined

  if (field.kind === 'select') {
    /* A-15 takes no `invalid` prop and this file may not add one to the
       library. The refusal still shows: the label turns destructive and the
       message replaces the hint directly under the control. */
    return (
      <Select
        label={field.label}
        hideLabel
        value={value}
        options={field.options ?? []}
        onChange={onChange}
        neutralValue={value}
        className="w-full"
      />
    )
  }

  if (field.kind === 'long') {
    return (
      <Textarea
        autoGrow
        rows={3}
        value={value}
        invalid={invalid}
        maxLength={field.max}
        placeholder={field.placeholder}
        aria-label={field.label}
        aria-required={required}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  if (field.kind === 'date') {
    return (
      <Input
        type="date"
        value={value}
        invalid={invalid}
        min={DEADLINE_MIN}
        max={DEADLINE_MAX}
        aria-label={field.label}
        aria-required={required}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  if (field.kind === 'num' || field.kind === 'money') {
    return (
      <span className="flex items-center gap-2">
        <Input
          inputMode="numeric"
          value={grouped(value)}
          invalid={invalid}
          aria-label={field.label}
          aria-required={required}
          className="min-w-0 flex-1 font-mono"
          /* Clamped by DIGITS, not by `maxLength`: the box shows `1.000.000`
             while the draft holds `1000000`, so a character ceiling on the
             control would cut the number short by however many separators it
             happens to be wearing. */
          onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, field.max))}
        />
        {field.unit && (
          <span className="text-muted-foreground shrink-0 text-[11px]">{field.unit}</span>
        )}
      </span>
    )
  }

  return (
    <Input
      type={field.wire === 'email' ? 'email' : 'text'}
      inputMode={field.inputMode}
      /* Nothing on this form benefits from the browser's own suggestions, and
         one of them actively harms: a box asking for the contact person invites
         the autofill of whoever is TYPING, not of the customer being recorded. */
      autoComplete="off"
      value={value}
      invalid={invalid}
      maxLength={field.max}
      placeholder={field.placeholder}
      aria-label={field.label}
      aria-required={required}
      className={cn(field.mono && 'font-mono')}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/** The line left of the buttons: the one sentence for this attempt.
 *
 *  Three states and they are not interchangeable — nothing has gone wrong yet,
 *  the write was refused for a reason that belongs to no single box, or the
 *  write was refused and the boxes are already saying why. */
function FooterNote({ failure, root }: { failure: string | null; root?: string[] }) {
  if (!failure && !root) {
    return (
      <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
        Ô có dấu sao là bắt buộc. Ô bỏ trống không được ghi xuống sổ.
      </span>
    )
  }

  return (
    <span
      role="alert"
      className="text-destructive-foreground max-w-[420px] text-[11.5px] leading-[1.5]"
    >
      {[failure, root?.join(' · ')].filter(Boolean).join(' ')}
    </span>
  )
}
