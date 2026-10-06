import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Button, Combobox, Select, type ComboboxOption } from '@pv/ui'
import {
  ContactBookQuery,
  type LeadMotion,
  type LeadOrigin,
  type Partner,
  type PartnerCreate,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { contactBookQuery } from '@/data/contacts'
import { leadOriginsQuery, pickableCampaignsQuery, useOriginNames } from '@/data/lead-origins'
import { partnerLabel, partnersQuery, useCreatePartner } from '@/data/partners'
import { dm } from '@/lib/date'

/** The search-as-you-type pickers of a lead's origin — origin, campaign and
 *  partner — plus `OriginSelect`, the short catalog list admin screens pin to.
 *
 *  Both own their search text and debounce it into the list endpoint; the
 *  caller owns only the pick. `Combobox` itself never fetches (`@pv/ui` knows
 *  no server), which is why this wrapper exists in `components/`.
 *
 *  A typed ORIGIN that matches nothing is NOT created here: it comes back as
 *  `{ name }` and the write door it is sent through creates-or-reuses it, so a
 *  lead abandoned half-typed never leaves an orphan origin behind. A referrer
 *  is the exception — a lead carries its ref code, so the code is minted first. */

const SEARCH_DELAY_MS = 250

/** Mirrors a value after it stops changing — one request per pause, not per key. */
function useSettled(value: string): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [value])
  return settled
}

/** An existing origin carries its id; a name typed past the last suggestion has none. */
export type OriginChoice = { id?: string; name: string }

const NEW_VALUE = '__new'

const optionOf = (origin: LeadOrigin): ComboboxOption => ({
  value: origin.id,
  label: origin.name,
  hint: origin.active ? undefined : 'đã ẩn',
})

export function OriginPicker({
  label,
  value,
  onChange,
  onClear,
  motion,
  exclude,
  allowCreate = true,
  invalid,
  hideLabel,
  placeholder = 'Gõ để tìm, ví dụ LinkedIn',
}: {
  label: string
  value: OriginChoice | null
  onChange: (choice: OriginChoice) => void
  /** Present = the pick is optional, and a clear button follows the box. */
  onClear?: () => void
  /** Only origins filed under this motion — absent means all of them. */
  motion?: LeadMotion
  /** An id never offered — the origin being merged away cannot be its own target. */
  exclude?: string
  allowCreate?: boolean
  invalid?: boolean
  hideLabel?: boolean
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const q = useSettled(query.trim())
  const { data, isFetching } = useQuery(leadOriginsQuery({ motion, q: q === '' ? undefined : q }))

  const rows = (data?.rows ?? []).filter((o) => o.id !== exclude)
  const shown = new Set(rows.map((o) => o.id))
  const similar = data?.exact
    ? []
    : (data?.similar ?? []).filter((o) => o.id !== exclude && !shown.has(o.id))
  const all = [...rows, ...similar]
  const creatable = allowCreate && q !== '' && !data?.exact

  return (
    <div className="flex min-w-0 items-end gap-2">
      <Combobox
        label={label}
        hideLabel={hideLabel}
        size="lg"
        className="flex-1"
        value={value ? (value.id ?? NEW_VALUE) : ''}
        valueLabel={value ? (value.id ? value.name : `${value.name} · nguồn mới`) : undefined}
        query={query}
        onQueryChange={setQuery}
        options={rows.map(optionOf)}
        suggestions={similar.map(optionOf)}
        onSelect={(option) => {
          const origin = all.find((o) => o.id === option.value)
          if (origin) onChange({ id: origin.id, name: origin.name })
        }}
        createLabel={creatable ? (text) => `Tạo nguồn mới “${text}” khi lưu` : undefined}
        onCreate={creatable ? (text) => onChange({ name: text }) : undefined}
        placeholder={placeholder}
        emptyText={q === '' ? 'Chưa có nguồn nào' : 'Không có nguồn nào khớp'}
        loading={isFetching}
        invalid={invalid}
      />
      {value && onClear && (
        <Button size="lg" variant="ghost" onClick={onClear}>
          Bỏ chọn
        </Button>
      )}
    </div>
  )
}

export type CampaignChoice = { code: string; name: string }

export function CampaignPicker({
  label,
  value,
  onChange,
  required,
  invalid,
  hideLabel,
}: {
  label: string
  value: CampaignChoice | null
  onChange: (choice: CampaignChoice | null) => void
  /** Required hides the clear button; the star is the caller's label to draw. */
  required?: boolean
  invalid?: boolean
  hideLabel?: boolean
}) {
  const [query, setQuery] = useState('')
  const q = useSettled(query.trim())
  const { data, isFetching } = useQuery(pickableCampaignsQuery(q === '' ? undefined : q))
  const rows = data?.rows ?? []

  return (
    <div className="flex min-w-0 items-end gap-2">
      <Combobox
        label={label}
        hideLabel={hideLabel}
        size="lg"
        className="flex-1"
        value={value?.code ?? ''}
        valueLabel={value ? `${value.name} · ${value.code}` : undefined}
        query={query}
        onQueryChange={setQuery}
        options={rows.map((c) => ({
          value: c.code,
          label: c.name,
          hint: c.endsOn ? `${c.code} · đến ${dm(c.endsOn)}` : c.code,
        }))}
        onSelect={(option) => onChange({ code: option.value, name: option.label })}
        placeholder="Gõ tên hoặc mã chiến dịch"
        emptyText="Không có chiến dịch nào còn nhận lead"
        loading={isFetching}
        invalid={invalid}
      />
      {value && !required && (
        <Button size="lg" variant="ghost" onClick={() => onChange(null)}>
          Bỏ chọn
        </Button>
      )}
    </div>
  )
}

/** `originName` is the origin the server will DERIVE for a referred lead —
 *  carried so the form can show it without asking again. */
export type PartnerChoice = { code: string; name: string; originName?: string }

/** Someone picked who holds no ref code yet — a contact, or a typed name. */
type PendingReferrer = Omit<PartnerCreate, 'originId'>

const CONTACT_PREFIX = 'contact:'
const CONTACT_ROWS = 8

/** Referrers first, then contacts, then a create row. The last two hold no
 *  ref code here, so they open `ReferrerCodeStep` and the picker reports `null`
 *  until the server has minted one — or handed back the one the contact holds. */
export function PartnerPicker({
  label,
  value,
  onChange,
  motion,
  invalid,
  hideLabel,
}: {
  label: string
  value: PartnerChoice | null
  onChange: (choice: PartnerChoice | null) => void
  /** The lead's motion — a new referrer is filed under one of ITS origins. */
  motion: LeadMotion | undefined
  invalid?: boolean
  hideLabel?: boolean
}) {
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<PendingReferrer | null>(null)
  const q = useSettled(query.trim())
  const { data, isFetching } = useQuery(partnersQuery({ q: q === '' ? undefined : q }))
  const contacts = useQuery({
    ...contactBookQuery(
      ContactBookQuery.parse({ q: q === '' ? undefined : q, size: CONTACT_ROWS }),
    ),
    enabled: q !== '',
    placeholderData: keepPreviousData,
  })
  const originNames = useOriginNames()
  const rows = data?.rows ?? []
  const people = q === '' ? [] : (contacts.data?.rows ?? [])
  const named = (name: string) => name.trim().toLowerCase() === q.toLowerCase()
  const creatable =
    q !== '' && !rows.some((p) => named(p.name)) && !people.some((c) => named(c.name))

  /* Clear the previous ref code: the form must not submit it while a new one is minted. */
  const awaitCode = (referrer: PendingReferrer) => {
    setPending(referrer)
    onChange(null)
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Combobox
        label={label}
        hideLabel={hideLabel}
        size="lg"
        className="min-w-0"
        value={value?.code ?? ''}
        valueLabel={
          value
            ? partnerLabel(value.code, value.name)
            : pending
              ? `${pending.name} · chưa có mã`
              : undefined
        }
        query={query}
        onQueryChange={setQuery}
        options={[
          ...rows.map((p) => ({
            value: p.code,
            label: partnerLabel(p.code, p.name),
            hint: originNames.get(p.originId),
          })),
          ...people.map((c) => ({
            value: `${CONTACT_PREFIX}${c.code}`,
            label: `${c.name} · ${c.accountName ?? c.company}`,
            hint: 'Chưa có mã',
          })),
        ]}
        onSelect={(option) => {
          const partner = rows.find((p) => p.code === option.value)
          const contact = people.find((c) => `${CONTACT_PREFIX}${c.code}` === option.value)
          if (partner) {
            setPending(null)
            onChange({
              code: partner.code,
              name: partner.name,
              originName: originNames.get(partner.originId),
            })
          } else if (contact) awaitCode({ name: contact.name, contactCode: contact.code })
        }}
        createLabel={creatable ? (text) => `Tạo người giới thiệu mới “${text}”` : undefined}
        onCreate={creatable ? (text) => awaitCode({ name: text }) : undefined}
        placeholder="Gõ mã REF hoặc tên người giới thiệu"
        emptyText="Không có người giới thiệu nào khớp"
        loading={isFetching || contacts.isFetching}
        invalid={invalid}
      />
      {pending && (
        <ReferrerCodeStep
          key={pending.contactCode ?? pending.name}
          referrer={pending}
          motion={motion}
          onCancel={() => setPending(null)}
          onDone={(partner) => {
            setPending(null)
            onChange({
              code: partner.code,
              name: partner.name,
              originName: originNames.get(partner.originId),
            })
          }}
        />
      )}
    </div>
  )
}

/** A ref code needs an origin, which neither a contact nor a typed name has —
 *  so the one missing answer is asked here, then the server mints the code. */
function ReferrerCodeStep({
  referrer,
  motion,
  onCancel,
  onDone,
}: {
  referrer: PendingReferrer
  motion: LeadMotion | undefined
  onCancel: () => void
  onDone: (partner: Partner) => void
}) {
  const [picked, setPicked] = useState('')
  const create = useCreatePartner()
  const motions = motion ? [motion] : []
  const { rows: offered, loaded } = useOfferedOrigins(motions)
  /* A lone origin is the answer; a pick the motion no longer offers is not. */
  const originId = offered.some((o) => o.id === picked)
    ? picked
    : offered.length === 1
      ? offered[0]!.id
      : ''

  /* No origin under this motion: the select would open on nothing and the
     button would stay shut with no reason given. */
  if (loaded && offered.length === 0) {
    return (
      <span role="alert" className="text-destructive-foreground text-[11.5px] leading-[1.5]">
        Phương án tiếp cận này chưa có nguồn nào — thêm ở trang Nguồn lead.
      </span>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        {/* The floor is what lets the buttons wrap instead of crushing the select. */}
        <div className="min-w-[200px] flex-1">
          <OriginSelect
            label="Nguồn của người giới thiệu"
            value={originId}
            onChange={setPicked}
            motions={motions}
            emptyLabel="— chọn nguồn —"
            className="w-full"
          />
        </div>
        <Button
          size="lg"
          disabled={originId === '' || create.isPending}
          onClick={() => create.mutate({ ...referrer, originId }, { onSuccess: onDone })}
        >
          {create.isPending ? 'Đang cấp mã…' : 'Cấp mã giới thiệu'}
        </Button>
        <Button size="lg" variant="ghost" onClick={onCancel}>
          Bỏ chọn
        </Button>
      </div>
      {isApiError(create.error) && (
        <span role="alert" className="text-destructive-foreground text-[11.5px] leading-[1.5]">
          {userMessage(create.error)}
        </span>
      )}
    </div>
  )
}

/** Catalog origins a pick may land on: live, not merged away, and — when
 *  `motions` is given — filed under any of them. `keep` stays listed even once
 *  hidden, so an old pick never reads as blank. */
function useOfferedOrigins(
  motions?: readonly LeadMotion[],
  keep?: string,
): { rows: LeadOrigin[]; loaded: boolean } {
  const { data } = useQuery(leadOriginsQuery({ includeInactive: true }))
  const rows = (data?.rows ?? []).filter(
    (o) =>
      (o.active || o.id === keep) &&
      !o.mergedInto &&
      (!motions || o.motions.some((m) => motions.includes(m))),
  )
  return { rows, loaded: data !== undefined }
}

/** A plain list of catalog origins, optionally only those filed under any of
 *  `motions` — short enough that a Select beats a search box. */
export function OriginSelect({
  label,
  value,
  onChange,
  motions,
  emptyLabel,
  hideLabel,
  className,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  className?: string
  /** Absent = every origin; empty = none (nothing asks for them yet). */
  motions?: readonly LeadMotion[]
  /** The row standing for "nothing picked" (value `''`). */
  emptyLabel: string
  hideLabel?: boolean
}) {
  const { rows } = useOfferedOrigins(motions, value)
  const options = rows.map((o) => ({ value: o.id, label: o.active ? o.name : `${o.name} · đã ẩn` }))

  return (
    <Select
      label={label}
      hideLabel={hideLabel}
      size="lg"
      className={className}
      value={value}
      onChange={onChange}
      options={[{ value: '', label: emptyLabel }, ...options]}
    />
  )
}
