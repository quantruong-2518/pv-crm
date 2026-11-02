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
import { message, useI18n } from '@/app/i18n'
import { contactBookQuery } from '@/data/contacts'
import { leadOriginsQuery, pickableCampaignsQuery, useOriginNames } from '@/data/lead-origins'
import { partnerLabel, partnersQuery, useCreatePartner } from '@/data/partners'
import { dm } from '@/lib/date'
import { searchableText } from '@/lib/search-box'

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

const HIDDEN = message('đã ẩn', 'hidden', '숨김')

const optionOf = (origin: LeadOrigin, hidden: string): ComboboxOption => ({
  value: origin.id,
  label: origin.name,
  hint: origin.active ? undefined : hidden,
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
  placeholder,
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
  const { t } = useI18n()
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
        valueLabel={
          value
            ? value.id
              ? value.name
              : t(
                  message(
                    `${value.name} · nguồn mới`,
                    `${value.name} · new source`,
                    `${value.name} · 새 유입 경로`,
                  ),
                )
            : undefined
        }
        query={query}
        onQueryChange={setQuery}
        options={rows.map((o) => optionOf(o, t(HIDDEN)))}
        suggestions={similar.map((o) => optionOf(o, t(HIDDEN)))}
        onSelect={(option) => {
          const origin = all.find((o) => o.id === option.value)
          if (origin) onChange({ id: origin.id, name: origin.name })
        }}
        createLabel={
          creatable
            ? (text) =>
                t(
                  message(
                    `Tạo nguồn mới “${text}” khi lưu`,
                    `Create new source “${text}” on save`,
                    `저장할 때 새 유입 경로 “${text}” 생성`,
                  ),
                )
            : undefined
        }
        onCreate={creatable ? (text) => onChange({ name: text }) : undefined}
        placeholder={
          placeholder ??
          t(
            message(
              'Gõ để tìm, ví dụ LinkedIn',
              'Type to search, e.g. LinkedIn',
              '검색어 입력, 예: LinkedIn',
            ),
          )
        }
        emptyText={
          q === ''
            ? t(message('Chưa có nguồn nào', 'No sources yet', '유입 경로가 없습니다'))
            : t(
                message(
                  'Không có nguồn nào khớp',
                  'No matching source',
                  '일치하는 유입 경로가 없습니다',
                ),
              )
        }
        loading={isFetching}
        invalid={invalid}
      />
      {value && onClear && (
        <Button size="lg" variant="ghost" onClick={onClear}>
          {t(message('Bỏ chọn', 'Clear', '선택 해제'))}
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
  /** Required hides the clear button and prints the star after the label. */
  required?: boolean
  invalid?: boolean
  hideLabel?: boolean
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const q = useSettled(query.trim())
  const { data, isFetching } = useQuery(pickableCampaignsQuery(searchableText(q)))
  const rows = data?.rows ?? []

  return (
    <div className="flex min-w-0 items-end gap-2">
      <Combobox
        label={label}
        hideLabel={hideLabel}
        required={required}
        size="lg"
        className="flex-1"
        value={value?.code ?? ''}
        valueLabel={value ? `${value.name} · ${value.code}` : undefined}
        query={query}
        onQueryChange={setQuery}
        options={rows.map((c) => ({
          value: c.code,
          label: c.name,
          hint: c.endsOn
            ? t(
                message(
                  `${c.code} · đến ${dm(c.endsOn)}`,
                  `${c.code} · until ${dm(c.endsOn)}`,
                  `${c.code} · ${dm(c.endsOn)}까지`,
                ),
              )
            : c.code,
        }))}
        onSelect={(option) => onChange({ code: option.value, name: option.label })}
        placeholder={t(
          message(
            'Gõ tên hoặc mã chiến dịch',
            'Type a campaign name or code',
            '캠페인 이름 또는 코드 입력',
          ),
        )}
        emptyText={t(
          message(
            'Không có chiến dịch nào còn nhận lead',
            'No campaign is accepting leads',
            '리드를 받는 캠페인이 없습니다',
          ),
        )}
        loading={isFetching}
        invalid={invalid}
      />
      {value && !required && (
        <Button size="lg" variant="ghost" onClick={() => onChange(null)}>
          {t(message('Bỏ chọn', 'Clear', '선택 해제'))}
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
  required,
  invalid,
  hideLabel,
}: {
  label: string
  value: PartnerChoice | null
  onChange: (choice: PartnerChoice | null) => void
  /** The lead's motion — a new referrer is filed under one of ITS origins. */
  motion: LeadMotion | undefined
  required?: boolean
  invalid?: boolean
  hideLabel?: boolean
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<PendingReferrer | null>(null)
  const q = useSettled(query.trim())
  /* `q` still drives the create row and the name match; `search` is what the server may filter by. */
  const search = searchableText(q)
  const { data, isFetching } = useQuery(partnersQuery({ q: search }))
  const contacts = useQuery({
    ...contactBookQuery(ContactBookQuery.parse({ q: search, size: CONTACT_ROWS })),
    enabled: search !== undefined,
    placeholderData: keepPreviousData,
  })
  const originNames = useOriginNames()
  const rows = data?.rows ?? []
  const people = search === undefined ? [] : (contacts.data?.rows ?? [])
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
        required={required}
        size="lg"
        className="min-w-0"
        value={value?.code ?? ''}
        valueLabel={
          value
            ? partnerLabel(value.code, value.name)
            : pending
              ? t(
                  message(
                    `${pending.name} · chưa có mã`,
                    `${pending.name} · no code yet`,
                    `${pending.name} · 코드 없음`,
                  ),
                )
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
            hint: t(message('Chưa có mã', 'No code yet', '코드 없음')),
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
        createLabel={
          creatable
            ? (text) =>
                t(
                  message(
                    `Tạo người giới thiệu mới “${text}”`,
                    `Create new referrer “${text}”`,
                    `새 소개자 “${text}” 생성`,
                  ),
                )
            : undefined
        }
        onCreate={creatable ? (text) => awaitCode({ name: text }) : undefined}
        placeholder={t(
          message(
            'Gõ mã REF hoặc tên người giới thiệu',
            'Type a REF code or referrer name',
            'REF 코드 또는 소개자 이름 입력',
          ),
        )}
        emptyText={t(
          message(
            'Không có người giới thiệu nào khớp',
            'No matching referrer',
            '일치하는 소개자가 없습니다',
          ),
        )}
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
  const { t } = useI18n()
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
        {t(
          message(
            'Phương án tiếp cận này chưa có nguồn. Thêm ở trang Nguồn lead.',
            'This approach has no source yet. Add one on the Lead sources page.',
            '이 접근 방식에는 아직 유입 경로가 없습니다. 리드 유입 경로 페이지에서 추가하세요.',
          ),
        )}
      </span>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        {/* The floor is what lets the buttons wrap instead of crushing the select. */}
        <div className="min-w-[200px] flex-1">
          <OriginSelect
            label={t(message('Nguồn của người giới thiệu', 'Referrer source', '소개자 유입 경로'))}
            value={originId}
            onChange={setPicked}
            motions={motions}
            emptyLabel={t(message('— chọn nguồn —', '— pick a source —', '— 유입 경로 선택 —'))}
            className="w-full"
          />
        </div>
        <Button
          size="lg"
          disabled={originId === '' || create.isPending}
          onClick={() => create.mutate({ ...referrer, originId }, { onSuccess: onDone })}
        >
          {create.isPending
            ? t(message('Đang cấp mã…', 'Issuing code…', '코드 발급 중…'))
            : t(message('Cấp mã giới thiệu', 'Issue referral code', '소개 코드 발급'))}
        </Button>
        <Button size="lg" variant="ghost" onClick={onCancel}>
          {t(message('Bỏ chọn', 'Clear', '선택 해제'))}
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
  const { t } = useI18n()
  const { rows } = useOfferedOrigins(motions, value)
  const options = rows.map((o) => ({
    value: o.id,
    label: o.active
      ? o.name
      : t(message(`${o.name} · đã ẩn`, `${o.name} · hidden`, `${o.name} · 숨김`)),
  }))

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
