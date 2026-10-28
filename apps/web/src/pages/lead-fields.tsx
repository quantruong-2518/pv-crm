import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AiFillField,
  Combobox,
  Input,
  PillOverflow,
  Select,
  Textarea,
  billions,
  cn,
  vnd,
} from '@pv/ui'
import { LEAD_NUM } from '@pv/contracts'
import { CURRENCIES, toMoneyVnd, type CurrencyCode } from '@pv/engines/fixtures/das-vina'
import { AddressField, type AddressBoxKey } from '@/components/address-field'
import { peopleRoleOptions, useSalesPeople } from '@/data/directory'
import {
  categoryOptions,
  configName,
  industriesOf,
  industryChoices,
  leadIndustryOptionsQuery,
} from '@/data/industries'
import { leadStopReasonsQuery } from '@/data/leads'
import { stopReasonLabel } from '@/data/sales-config'
import type { LeadDraft } from '@/data/lead-draft'
import {
  channelUrlLabel,
  DEADLINE_MAX,
  DEADLINE_MIN,
  inputModeOf,
  isRequired,
  maxCharsOf,
  PROFILE_FIELDS,
  readField,
  readTags,
  type FieldKey,
  type FormField,
  type FormValues,
} from '@/data/lead-form'
import type { AiFillView } from './lead-ai-fill'

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
  under,
  children,
}: {
  field: FormField
  /** The star. Handed in rather than asked for here, because the two doors ask
   *  two contracts — `LeadPatch` while editing, `LeadCreate` while typing. */
  required: boolean
  error?: string
  plain?: boolean
  /** Below the hint, outside the label: the AI caption and conflict line hold
   *  links and buttons that must not share the box's label. */
  under?: ReactNode
  children: ReactNode
}) {
  const head = (
    <span className="text-glass-foreground text-[13px] font-semibold leading-[1.4]">
      {field.label}
      {required && (
        <span className="text-destructive-foreground" aria-hidden="true">
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
      {under}
    </div>
  )
}

/** The box under an AI fill run's layers, or the bare box when no run is wired. */
function filling(ai: AiFillView | undefined, key: FieldKey, control: ReactNode) {
  return ai ? <AiFillField state={ai.stateOf(key)}>{control}</AiFillField> : control
}

/** Thousands separators for a number in a box — law 6.
 *
 *  Display only. `writeField` strips every non-digit on the way back, so typing
 *  the dots or leaving them out lands the same value. */
const grouped = (raw: string) => (raw === '' ? '' : Number(raw).toLocaleString('vi-VN'))

function FieldControl({
  field,
  value,
  tags,
  category,
  required,
  invalid,
  options,
  onChange,
  onBlur,
  onLeave,
}: {
  field: FormField
  value: string
  /** What a `tags` box holds; `value` is the same list printed as one line. */
  tags: string[]
  /** The lead's category id, which bounds what the industries box offers. */
  category: string
  required: boolean
  invalid: boolean
  /** The select's list. Handed in rather than read off `field.options`: the
   *  three holder boxes take theirs from the directory on the server, and
   *  `FieldRow` builds that once for the whole row. */
  options: { value: string; label: string }[]
  onChange: (raw: string | string[]) => void
  /** Absent on the boxes that commit the moment they change. */
  onBlur?: () => void
  /** The industries popover shut, final list in hand — the one save for it. */
  onLeave: (tags: string[]) => void
}) {
  const marked = required || undefined

  if (field.key === 'industries') {
    return (
      <IndustriesControl
        ids={tags}
        categoryId={category}
        readOnly={field.kind === 'read'}
        onChange={onChange}
        onDone={() => onLeave(tags)}
      />
    )
  }

  if (field.kind === 'read') {
    /* `exitReason` prints a config id or `'other'` on the wire (ADR 0070), not
       a name any static `options` list carries — resolved on its own. */
    if (field.key === 'exitReason') return <StopReasonRead value={value} mono={field.mono} />

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
      /* The unit rides inside the box (`suffix`), so an AI fill's layers cover
         exactly the box and nothing beside it. */
      <Input
        inputMode="numeric"
        value={grouped(value)}
        invalid={invalid}
        aria-label={field.label}
        aria-required={marked}
        suffix={field.unit}
        shellClassName="h-11"
        className="h-11 min-w-0 flex-1 font-mono text-[13px]"
        /* Clamped by DIGITS, not by `maxLength`: the box shows `1.000.000`
           while the value behind it is `1000000`, so a character ceiling on
           the control would cut the number short by the separators. */
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, maxCharsOf(field)))}
        onBlur={onBlur}
      />
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

/** The address pair, drawn by the shared picker instead of two text boxes.
 *
 *  A pick has no blur a person would recognise — the same case as a select —
 *  so it writes both boxes through at once. Typed text still commits on blur,
 *  which is why the picker gets the frame and the form keeps the saving. */
function LeadAddressBoxes({
  address,
  province,
  draft,
  writable,
  ai,
}: {
  address: FormField
  province: FormField
  draft: LeadDraft
  writable: boolean
  ai?: AiFillView
}) {
  const boxOf = (key: AddressBoxKey) => (key === 'address' ? address : province)
  const complaint = (field: FormField) => {
    const message = draft.fieldError(field.key)
    return message === undefined ? undefined : [message]
  }

  return (
    <AddressField
      value={readField(draft.values, address.key)}
      province={readField(draft.values, province.key)}
      labels={{ address: address.label, province: province.label }}
      errors={{ address: complaint(address), province: complaint(province) }}
      maxLength={{ address: maxCharsOf(address), province: maxCharsOf(province) }}
      /* Same two heights every other box on this form takes — 44px, and the
         48px of law 13 the moment the pointer is a finger. */
      inputClassName="pointer-coarse:h-12 h-11 text-[13px]"
      pickerClassName="[&_input]:pointer-coarse:h-12 [&_input]:h-11 [&_input]:text-[13px]"
      onType={(raw) => draft.set(address, raw)}
      onTypeProvince={(raw) => draft.set(province, raw)}
      onCommit={(key) => draft.commit(boxOf(key))}
      onPick={(addr, prov) => {
        draft.set(address, addr)
        draft.commit(address)
        draft.set(province, prov)
        draft.commit(province)
      }}
      frame={({ key, label, plain, errors, children }) => (
        <FieldShell
          key={key}
          field={{ ...boxOf(key), label }}
          required={writable && isRequired(boxOf(key), draft.mode)}
          error={errors?.[0]}
          plain={plain}
          under={ai?.under(key)}
        >
          {filling(ai, key, children)}
        </FieldShell>
      )}
    />
  )
}

/** Does this box write itself through the moment it changes?
 *
 *  A select, a date picker and a segmented control have no blur a person would
 *  recognise: the value is chosen and the pointer moves on, often without the
 *  control ever holding focus. Waiting for a blur there means waiting forever.
 *  A tag box is NOT one of them: saved per pill, three tags were three PATCHes
 *  and three timeline rows, so it writes once, on leaving (`onLeave`). */
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
  const printed = draft.mode === 'edit' && (!writable || !draft.editable(field))
  return {
    ...field,
    label:
      field.key === 'channelUrl'
        ? channelUrlLabel(readField(draft.values, 'channel'))
        : field.label,
    kind: printed ? 'read' : field.kind,
  }
}

/** The two boxes the picker draws together, or `null` when this row holds only
 *  one of them or draws either as printed text. */
function addressPair(
  fields: FormField[],
  draft: LeadDraft,
  writable: boolean,
): { address: FormField; province: FormField } | null {
  const address = fields.find((field) => field.key === 'address')
  const province = fields.find((field) => field.key === 'province')
  if (!address || !province) return null
  const typeable = (field: FormField) => drawnField(field, draft, writable).kind !== 'read'
  return typeable(address) && typeable(province) ? { address, province } : null
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
  ai,
}: {
  fields: FormField[]
  draft: LeadDraft
  canEdit?: boolean
  /** The edit door's AI fill run; absent on every other card. */
  ai?: AiFillView
}) {
  const writable = draft.mode === 'create' || canEdit

  /* The three holder boxes read the directory on the server. Built here, once
     for the whole row: a box declaring `people` gets its own "nobody yet" line
     followed by names and roles. */
  const people = useSalesPeople()
  const staffOptions = useMemo(() => peopleRoleOptions(people), [people])
  const { data: industries } = useQuery({
    ...leadIndustryOptionsQuery,
    enabled: fields.some((f) => f.key === 'category'),
  })

  /* One picker fills both address boxes, so they are drawn as a pair — but
     only while both may still be typed into. */
  const pair = addressPair(fields, draft, writable)

  return (
    <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
      {fields.map((field) => {
        if (pair && field.key === 'province') return null
        if (pair && field.key === 'address') {
          return (
            <LeadAddressBoxes key={field.key} {...pair} draft={draft} writable={writable} ai={ai} />
          )
        }

        const drawn = drawnField(field, draft, writable)
        const error = draft.fieldError(field.key)
        const instant = savesOnChange(drawn)
        const value = readField(draft.values, field.key)
        const options = field.people
          ? [{ value: '', label: field.people }, ...staffOptions]
          : field.key === 'category'
            ? [...(field.options ?? []), ...categoryOptions(industries, value)]
            : (field.options ?? [])

        return (
          <FieldShell
            key={field.key}
            field={drawn}
            required={writable && isRequired(field, draft.mode)}
            error={error}
            /* A tag box holds buttons: a wrapping label would aim its click at
               the first pill's remove button. */
            plain={drawn.kind === 'select' || drawn.kind === 'read' || drawn.kind === 'tags'}
            under={ai?.under(field.key)}
          >
            {filling(
              ai,
              field.key,
              <FieldControl
                field={drawn}
                value={value}
                tags={readTags(draft.values, field.key)}
                category={readField(draft.values, 'category')}
                required={writable && isRequired(field, draft.mode)}
                invalid={error !== undefined}
                options={options}
                /* `onSet` gets the ORIGINAL field: a label swapped for the eye
                 must not change where the value is written. */
                onChange={(raw) => {
                  if (!writable) return
                  draft.set(field, raw)
                  /* The server drops industries of another category on the same write. */
                  if (field.key === 'category' && typeof raw === 'string') {
                    const kept = industriesOf(industries, readTags(draft.values, 'industries'), raw)
                    draft.set(INDUSTRIES_FIELD, kept)
                  }
                  if (instant) draft.commit(field)
                }}
                onBlur={!writable || instant ? undefined : () => draft.commit(field)}
                /* The list `onLeave` hands over, not the draft's: it carries the
                 text still being typed. `commit` writes nothing if unchanged. */
                onLeave={(tags) => {
                  draft.set(field, tags)
                  draft.commit(field)
                }}
              />,
            )}
            {drawn.kind === 'money' && (
              <MoneyRead work={draft.values} value={readField(draft.values, field.key)} />
            )}
          </FieldShell>
        )
      })}
    </div>
  )
}

const INDUSTRIES_FIELD = PROFILE_FIELDS.find((f) => f.key === 'industries')!

/** A lead's industries: the first two as pills, the rest and the editing in
 *  the popover. Only active industries of the lead's category are offered;
 *  an older one with no category stays shown and can still be taken off. */
function IndustriesControl({
  ids,
  categoryId,
  readOnly,
  onChange,
  onDone,
}: {
  ids: string[]
  categoryId: string
  readOnly: boolean
  onChange: (ids: string[]) => void
  onDone: () => void
}) {
  const { data } = useQuery(leadIndustryOptionsQuery)
  const [query, setQuery] = useState('')
  const items = ids.map((id) => ({ id, label: configName(data, id) }))
  const group = categoryId === '' ? undefined : configName(data, categoryId)
  const full = ids.length >= LEAD_NUM.industriesMax
  const needle = query.trim().toLowerCase()
  const left = industryChoices(data, categoryId, ids)
  const choices = left.filter((i) => i.name.toLowerCase().includes(needle))
  const note = !group
    ? 'Chọn nhóm ngành trước.'
    : full
      ? `Đã đủ ${LEAD_NUM.industriesMax} ngành. Bỏ bớt để thêm ngành khác.`
      : undefined

  if (readOnly && items.length === 0) {
    return <span className="text-muted-foreground flex h-11 items-center text-[13px]">—</span>
  }
  return (
    <PillOverflow
      items={items}
      max={2}
      label="Các ngành của lead"
      moreLabel={(n) => `Xem cả ${n} ngành`}
      className="min-h-11"
      heading={group ? `${ids.length} ngành · nhóm ${group}` : `${ids.length} ngành`}
      editLabel={readOnly ? undefined : ids.length === 0 ? 'Thêm ngành' : 'Sửa ngành'}
      onRemove={readOnly ? undefined : (id) => onChange(ids.filter((x) => x !== id))}
      /* Also fires when the box unmounts with the popover open, so an edit is not lost. */
      onClose={onDone}
      addSlot={
        !readOnly && (
          <div className="flex flex-col gap-2">
            <Combobox
              label="Thêm ngành"
              hideLabel
              value=""
              query={query}
              onQueryChange={setQuery}
              options={choices.map((i) => ({ value: i.id, label: i.name }))}
              onSelect={(o) => {
                onChange([...ids, o.value])
                setQuery('')
              }}
              placeholder={group ? `Tìm ngành trong nhóm ${group}` : 'Tìm ngành'}
              emptyText={left.length > 0 ? 'Không có ngành khớp' : 'Không còn ngành nào để thêm'}
              disabled={!group || full}
              className="[&_input]:pointer-coarse:h-12"
            />
            {note && <span className="text-muted-foreground text-[11px]">{note}</span>}
          </div>
        )
      }
    />
  )
}

/** The system group's one read-only box that is a catalogue key, not a plain
 *  string — split out so the query it needs is not paid by every other field
 *  on this thirty-box form. */
function StopReasonRead({ value, mono }: { value: string; mono?: boolean }) {
  const { data } = useQuery(leadStopReasonsQuery)
  const shown = value === '' ? undefined : stopReasonLabel(data?.rows, value)

  return (
    <span
      className={cn(
        'flex h-11 items-center text-[13px]',
        mono && 'font-mono',
        !shown && 'text-muted-foreground',
      )}
    >
      {shown ?? '—'}
    </span>
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
