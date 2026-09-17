import { useMemo, type ReactNode } from 'react'
import { Input, Select, Textarea, billions, cn, vnd } from '@pv/ui'
import { CURRENCIES, toMoneyVnd, type CurrencyCode } from '@pv/engines/fixtures/das-vina'
import { peopleRoleOptions, useSalesPeople } from '@/data/directory'
import type { LeadDraft } from '@/data/lead-draft'
import {
  channelUrlLabel,
  DEADLINE_MAX,
  DEADLINE_MIN,
  inputModeOf,
  isEditable,
  isRequired,
  maxCharsOf,
  readField,
  type FormField,
  type FormValues,
} from '@/data/lead-form'

/** Module 2 · The controls one box of the lead form is made of — label, star,
 *  control, and the complaint when a save was refused.
 *
 *  Split out of `lead-parts.tsx` on 17/09 because three cards draw boxes now
 *  (the form's tabs, the owner card, the create door) and none of them should
 *  own the rules about what a box looks like.
 *
 *  Every box is exactly one grid cell — that is what keeps a thirty-box form
 *  readable, and one `col-span` exception is enough to lose it. A textarea
 *  grows taller, never wider.
 *
 *  WHERE THE COMPLAINT SITS: under the box that caused it. With autosave there
 *  is no button to put a sentence beside, and a red line far from the box it is
 *  about is a line nobody connects to what they just typed. */

/** One box: label (starred when the write refuses it empty) · control · either
 *  its hint or the complaint about it.
 *
 *  `plain` drops the wrapping `<label>`. Two controls carry their own: `Select`
 *  (A-15) wraps one already — nesting two is invalid HTML and a screen reader
 *  announces two names for one box — and a printed value has no control for a
 *  label to point at. */
function FieldShell({
  field,
  required,
  error,
  plain,
  children,
}: {
  field: FormField
  /** The star. Handed in rather than asked for here, because the two doors ask
   *  two contracts — `LeadPatch` while editing, `LeadCreate` while typing. */
  required: boolean
  error?: string
  plain?: boolean
  children: ReactNode
}) {
  const head = (
    <span className="text-glass-foreground text-[13px] font-semibold leading-[1.4]">
      {field.label}
      {required && (
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
      {plain ? body : <label className="flex flex-col gap-2">{body}</label>}
      {/* The complaint REPLACES the hint: two lines under one box is one line
          too many, and the hint is the less urgent of the two. */}
      {error ? (
        <span role="alert" className="text-destructive-foreground text-[12px] leading-[1.6]">
          {error}
        </span>
      ) : (
        field.hint && (
          <span className="text-muted-foreground text-[12px] leading-[1.6]">{field.hint}</span>
        )
      )}
    </div>
  )
}

/** Thousands separators for a number in a box — law 6.
 *
 *  Display only. `writeField` strips every non-digit on the way back, so typing
 *  the dots or leaving them out lands the same value. */
const grouped = (raw: string) => (raw === '' ? '' : Number(raw).toLocaleString('vi-VN'))

function FieldControl({
  field,
  value,
  required,
  invalid,
  options,
  onChange,
  onBlur,
}: {
  field: FormField
  value: string
  required: boolean
  invalid: boolean
  /** The select's list. Handed in rather than read off `field.options`: the
   *  three holder boxes take theirs from the directory on the server, and
   *  `FieldRow` builds that once for the whole row. */
  options: { value: string; label: string }[]
  onChange: (raw: string) => void
  /** Absent on the boxes that commit the moment they change. */
  onBlur?: () => void
}) {
  const marked = required || undefined

  if (field.kind === 'read') {
    const shown = options.find((o) => o.value === value)?.label ?? value
    return (
      <span
        className={cn(
          'flex h-11 items-center text-[13px]',
          field.mono && 'font-mono',
          value === '' && 'text-muted-foreground',
        )}
      >
        {value === '' ? '—' : shown}
      </span>
    )
  }

  if (field.kind === 'select') {
    return (
      <Select
        label={field.label}
        hideLabel
        value={value}
        options={options}
        onChange={onChange}
        neutralValue={value}
        className="[&_button]:pointer-coarse:h-12 w-full [&_button]:h-11 [&_button]:text-[13px]"
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
        maxLength={maxCharsOf(field)}
        placeholder={field.placeholder}
        aria-label={field.label}
        aria-required={marked}
        className="text-[13px]"
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    )
  }

  if (field.kind === 'date') {
    return (
      <Input
        type="date"
        value={value.slice(0, 10)}
        invalid={invalid}
        min={DEADLINE_MIN}
        max={DEADLINE_MAX}
        aria-label={field.label}
        aria-required={marked}
        className="h-11 text-[13px]"
        onChange={(e) => onChange(e.target.value)}
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
          aria-required={marked}
          className="h-11 min-w-0 flex-1 font-mono text-[13px]"
          /* Clamped by DIGITS, not by `maxLength`: the box shows `1.000.000`
             while the value behind it is `1000000`, so a character ceiling on
             the control would cut the number short by the separators. */
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, maxCharsOf(field)))}
          onBlur={onBlur}
        />
        {field.unit && (
          <span className="text-muted-foreground shrink-0 text-[12.5px]">{field.unit}</span>
        )}
      </span>
    )
  }

  return (
    <Input
      type={field.key === 'email' ? 'email' : 'text'}
      inputMode={inputModeOf(field)}
      /* Nothing on this card benefits from the browser's own suggestions, and
         one of them actively harms: a box asking for the contact person invites
         the autofill of whoever is TYPING, not of the customer being recorded. */
      autoComplete="off"
      value={value}
      invalid={invalid}
      maxLength={maxCharsOf(field)}
      placeholder={field.placeholder}
      aria-label={field.label}
      aria-required={marked}
      className={cn('h-11 text-[13px]', field.mono && 'font-mono')}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
    />
  )
}

/** Does this box write itself through the moment it changes?
 *
 *  A select, a date picker and a segmented control have no blur a person would
 *  recognise: the value is chosen and the pointer moves on, often without the
 *  control ever holding focus. Waiting for a blur there means waiting forever. */
const savesOnChange = (field: FormField) => field.kind === 'select' || field.kind === 'date'

/** The field as THIS door draws it.
 *
 *  Swapped at draw time rather than written back into `PROFILE_FIELDS`, which
 *  is a module constant: writing into it would relabel every open profile after
 *  whichever lead drew last.
 *
 *  A reader gets the SAME printed line a field the contract cannot patch gets:
 *  one shape for "you cannot change this here", rather than a typeable box
 *  whose every blur earns a 403 the reader never asked for. */
function drawnField(field: FormField, draft: LeadDraft, writable: boolean): FormField {
  const printed = draft.mode === 'edit' && (!writable || !isEditable(field))
  return {
    ...field,
    label:
      field.key === 'channelUrl'
        ? channelUrlLabel(readField(draft.values, 'channel'))
        : field.label,
    kind: printed ? 'read' : field.kind,
  }
}

/** A row of boxes on an even grid — two columns from the tablet up, one on a
 *  phone. Autosave is wired here, once, for every card that draws boxes.
 *
 *  `canEdit` is `lead.edit` and it DEFAULTS TO DENY, the same default the form
 *  card holds: a row drawn without an answer must not hand typing to a reader.
 *  The create door ignores it — nothing exists yet whose scope could refuse. */
export function FieldRow({
  fields,
  draft,
  canEdit = false,
}: {
  fields: FormField[]
  draft: LeadDraft
  canEdit?: boolean
}) {
  const writable = draft.mode === 'create' || canEdit

  /* The three holder boxes read the directory on the server. Built here, once
     for the whole row: a box declaring `people` gets its own "nobody yet" line
     followed by names and roles. */
  const people = useSalesPeople()
  const staffOptions = useMemo(() => peopleRoleOptions(people), [people])

  return (
    <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
      {fields.map((field) => {
        const drawn = drawnField(field, draft, writable)
        const error = draft.fieldError(field.key)
        const instant = savesOnChange(drawn)
        const options = field.people
          ? [{ value: '', label: field.people }, ...staffOptions]
          : (field.options ?? [])

        return (
          <FieldShell
            key={field.key}
            field={drawn}
            required={writable && isRequired(field, draft.mode)}
            error={error}
            plain={drawn.kind === 'select' || drawn.kind === 'read'}
          >
            <FieldControl
              field={drawn}
              value={readField(draft.values, field.key)}
              required={writable && isRequired(field, draft.mode)}
              invalid={error !== undefined}
              options={options}
              /* `onSet` gets the ORIGINAL field: a label swapped for the eye
                 must not change where the value is written. */
              onChange={(raw) => {
                if (!writable) return
                draft.set(field, raw)
                if (instant) draft.commit(field)
              }}
              onBlur={!writable || instant ? undefined : () => draft.commit(field)}
            />
            {drawn.kind === 'money' && (
              <MoneyRead work={draft.values} value={readField(draft.values, field.key)} />
            )}
          </FieldShell>
        )
      })}
    </div>
  )
}

/** The money just typed, read back in words.
 *
 *  Seven digits in a box cannot be read by eye — one zero too many is ten times
 *  the number and nobody sees it. This prints it in the unit people say out
 *  loud (billions), and a foreign currency converted too, because the
 *  opportunity book adds up in one currency. */
function MoneyRead({ work, value }: { work: FormValues; value: string }) {
  if (value === '') return null
  const amount = Number(value)
  const currency: CurrencyCode = work.currency
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? ''

  return (
    <span className="text-muted-foreground text-[12px] leading-[1.6]">
      {currency === 'VND'
        ? `${vnd(amount)} · ${billions(amount)}`
        : `${amount.toLocaleString('vi-VN')} ${symbol} · ${billions(toMoneyVnd(amount, currency))} quy ra đồng`}
    </span>
  )
}
