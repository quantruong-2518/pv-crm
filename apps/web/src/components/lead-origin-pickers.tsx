import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Combobox, Select, type ComboboxOption } from '@pv/ui'
import type { LeadMotion, LeadOrigin } from '@pv/contracts'
import { leadOriginsQuery, pickableCampaignsQuery, useOriginNames } from '@/data/lead-origins'
import { partnerLabel, partnersQuery } from '@/data/partners'
import { dm } from '@/lib/date'

/** The search-as-you-type pickers of a lead's origin — origin, campaign and
 *  partner — plus `OriginSelect`, the short catalog list admin screens pin to.
 *
 *  Both own their search text and debounce it into the list endpoint; the
 *  caller owns only the pick. `Combobox` itself never fetches (`@pv/ui` knows
 *  no server), which is why this wrapper exists in `components/`.
 *
 *  A typed name that matches nothing is NOT created here: it comes back as
 *  `{ name }` and the write door it is sent through creates-or-reuses it, so a
 *  lead abandoned half-typed never leaves an orphan origin behind. */

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

/** Partners only; none is created from here — the partner book is admin's. */
export function PartnerPicker({
  label,
  value,
  onChange,
  invalid,
  hideLabel,
}: {
  label: string
  value: PartnerChoice | null
  onChange: (choice: PartnerChoice) => void
  invalid?: boolean
  hideLabel?: boolean
}) {
  const [query, setQuery] = useState('')
  const q = useSettled(query.trim())
  const { data, isFetching } = useQuery(partnersQuery({ q: q === '' ? undefined : q }))
  const originNames = useOriginNames()
  const rows = data?.rows ?? []

  return (
    <Combobox
      label={label}
      hideLabel={hideLabel}
      size="lg"
      className="min-w-0"
      value={value?.code ?? ''}
      valueLabel={value ? partnerLabel(value.code, value.name) : undefined}
      query={query}
      onQueryChange={setQuery}
      options={rows.map((p) => ({
        value: p.code,
        label: partnerLabel(p.code, p.name),
        hint: originNames.get(p.originId),
      }))}
      onSelect={(option) => {
        const partner = rows.find((p) => p.code === option.value)
        if (partner) {
          onChange({
            code: partner.code,
            name: partner.name,
            originName: originNames.get(partner.originId),
          })
        }
      }}
      placeholder="Gõ mã REF hoặc tên đối tác"
      emptyText="Không có mã giới thiệu nào khớp — thêm ở trang Đối tác"
      loading={isFetching}
      invalid={invalid}
    />
  )
}

/** A plain list of catalog origins, optionally only those filed under any of
 *  `motions` — short enough that a Select beats a search box. The stored value
 *  stays listed even once hidden, so an old pick never reads as blank. */
export function OriginSelect({
  label,
  value,
  onChange,
  motions,
  emptyLabel,
  hideLabel,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  /** Absent = every origin; empty = none (nothing asks for them yet). */
  motions?: readonly LeadMotion[]
  /** The row standing for "nothing picked" (value `''`). */
  emptyLabel: string
  hideLabel?: boolean
}) {
  const { data } = useQuery(leadOriginsQuery({ includeInactive: true }))
  const rows = (data?.rows ?? []).filter(
    (o) =>
      (o.active || o.id === value) &&
      !o.mergedInto &&
      (!motions || o.motions.some((m) => motions.includes(m))),
  )
  const options = rows.map((o) => ({ value: o.id, label: o.active ? o.name : `${o.name} · đã ẩn` }))

  return (
    <Select
      label={label}
      hideLabel={hideLabel}
      size="lg"
      value={value}
      onChange={onChange}
      options={[{ value: '', label: emptyLabel }, ...options]}
    />
  )
}
