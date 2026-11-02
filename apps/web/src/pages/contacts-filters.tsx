import { useQuery } from '@tanstack/react-query'
import { ColumnFilter, ColumnFilterList, ColumnFilterRange } from '@pv/ui'
import { OWNER_NONE, type ContactBookQuery } from '@pv/contracts'
import type { useBookQuery } from '@/app/book-query'
import { contactFacetsQuery } from '@/data/contacts'
import { useSalesPeople } from '@/data/directory'
import { FilterMenu } from '@/components/table-bits'
import { FilterSection } from '@/components/book-cards'
import { noop } from '@/components/book-view'
import {
  dayRangeChip,
  listChip,
  personNameOf,
  type ActiveFilter,
} from '@/components/active-filters'
import { message, useI18n, type Message } from '@/app/i18n'

/** The contact book's column filters, built once per render from the address.
 *  Company options are the companies that hold a contact this reader can see,
 *  from the book's own facets, not the company book. */

const csvOf = (v?: string) => (v ? v.split(',') : [])

const NO_OWNER = message('Chưa có người phụ trách', 'No owner assigned', '담당자 미지정')
const PRIMARY_ONLY = message('Chỉ người liên hệ chính', 'Primary contacts only', '주 연락처만')
const PRESENCE = {
  hasEmail: {
    '1': message('Đã có email', 'Has email', '이메일 있음'),
    '0': message('Chưa có email', 'No email', '이메일 없음'),
  },
  hasPhone: {
    '1': message('Đã có số điện thoại', 'Has phone number', '전화번호 있음'),
    '0': message('Chưa có số điện thoại', 'No phone number', '전화번호 없음'),
  },
}

type Book = ReturnType<typeof useBookQuery<ContactBookQuery>>

/** One removable chip per narrowed filter, each dropping only its own keys. */
function contactChips(
  book: Book,
  names: { company: string; owner: string; created: string },
  companyName: (code: string) => string,
  ownerName: (id: string) => string,
  t: (copy: Message) => string,
): ActiveFilter[] {
  const { query, patch } = book
  return [
    ...(query.primary
      ? [{ id: 'primary', label: t(PRIMARY_ONLY), onDrop: () => patch({ primary: undefined }) }]
      : []),
    ...listChip('account', names.company, query.account, companyName, () =>
      patch({ account: undefined }),
    ),
    ...listChip('owner', names.owner, query.owner, ownerName, () => patch({ owner: undefined })),
    ...(query.hasEmail
      ? [
          {
            id: 'hasEmail',
            label: t(PRESENCE.hasEmail[query.hasEmail]),
            onDrop: () => patch({ hasEmail: undefined }),
          },
        ]
      : []),
    ...(query.hasPhone
      ? [
          {
            id: 'hasPhone',
            label: t(PRESENCE.hasPhone[query.hasPhone]),
            onDrop: () => patch({ hasPhone: undefined }),
          },
        ]
      : []),
    ...dayRangeChip('created', names.created, query.createdFrom, query.createdTo, () =>
      patch({ createdFrom: undefined, createdTo: undefined }),
    ),
  ]
}

export function useContactFilters(book: Book) {
  const { t } = useI18n()
  const { query, patch } = book
  const { data: facets } = useQuery(contactFacetsQuery(query))
  const accounts = facets?.accounts ?? []
  /* A picked company the facet no longer returns stays listed by its code. */
  const accountOptions = [
    ...accounts.map((a) => ({ value: a.value, label: `${a.label} · ${a.count}` })),
    ...csvOf(query.account)
      .filter((v) => !accounts.some((a) => a.value === v))
      .map((v) => ({ value: v, label: v })),
  ]
  const salesPeople = useSalesPeople()
  const ownerOptions = [
    {
      value: OWNER_NONE,
      label: t(NO_OWNER),
    },
    ...salesPeople.map((a) => ({ value: a.id, label: a.name })),
  ]

  /* Each filter's body is written once: wrapped in a column popover for the
     table, or laid in a section of the grid's filter menu. */
  const listBody =
    (key: 'account' | 'owner', options: { value: string; label: string }[]) =>
    (close: () => void) => (
      <ColumnFilterList
        options={options}
        selected={csvOf(query[key])}
        close={close}
        onApply={(v) => patch({ [key]: v.length ? v.join(',') : undefined })}
      />
    )
  /* Two answers, so picking both (or neither) means "no filter". */
  const presenceBody = (key: 'hasEmail' | 'hasPhone') => (close: () => void) => (
    <ColumnFilterList
      searchable={false}
      options={[
        { value: '1', label: t(PRESENCE[key]['1']) },
        { value: '0', label: t(PRESENCE[key]['0']) },
      ]}
      selected={query[key] ? [query[key]] : []}
      close={close}
      onApply={(v) => patch({ [key]: v.length === 1 ? v[0] : undefined })}
    />
  )
  const primaryBody = (close: () => void) => (
    <ColumnFilterList
      searchable={false}
      options={[{ value: '1', label: t(PRIMARY_ONLY) }]}
      selected={query.primary ? ['1'] : []}
      close={close}
      onApply={(v) => patch({ primary: v.length ? '1' : undefined })}
    />
  )
  const dateBody = (close: () => void) => (
    <ColumnFilterRange
      from={query.createdFrom}
      to={query.createdTo}
      close={close}
      onApply={({ from, to }) => patch({ createdFrom: from, createdTo: to })}
    />
  )

  const sections = [
    {
      title: t(message('Người liên hệ chính', 'Primary contact', '주 연락처')),
      on: query.primary !== undefined,
      body: primaryBody,
    },
    {
      title: t(message('Công ty', 'Company', '회사')),
      on: query.account !== undefined,
      body: listBody('account', accountOptions),
    },
    {
      title: t(message('Người phụ trách', 'Owner', '담당자')),
      on: query.owner !== undefined,
      body: listBody('owner', ownerOptions),
    },
    { title: 'Email', on: query.hasEmail !== undefined, body: presenceBody('hasEmail') },
    {
      title: t(message('Điện thoại', 'Phone', '전화번호')),
      on: query.hasPhone !== undefined,
      body: presenceBody('hasPhone'),
    },
    {
      title: t(message('Ngày tạo', 'Created', '생성일')),
      on: Boolean(query.createdFrom || query.createdTo),
      body: dateBody,
    },
  ]
  const chips = contactChips(
    book,
    { company: sections[1]!.title, owner: sections[2]!.title, created: sections[5]!.title },
    (v) => accounts.find((a) => a.value === v)?.label ?? v,
    personNameOf(salesPeople, t(NO_OWNER)),
    t,
  )
  const [primary, account, owner, email, phone, date] = sections
  const column = (f: (typeof sections)[number], iconOnly?: boolean) => (
    <ColumnFilter label={f.title} active={f.on} iconOnly={iconOnly}>
      {f.body}
    </ColumnFilter>
  )
  const menu = (
    <FilterMenu
      label={t(message('Bộ lọc sổ người liên hệ', 'Contact filters', '연락처 필터'))}
      active={sections.filter((f) => f.on).length}
    >
      {sections.map((f) => (
        <FilterSection key={f.title} title={f.title}>
          {f.body(noop)}
        </FilterSection>
      ))}
    </FilterMenu>
  )

  return {
    primaryFilter: column(primary!, true),
    dateFilter: column(date!, true),
    account: column(account!, true),
    owner: column(owner!),
    email: column(email!),
    phone: column(phone!),
    menu,
    chips,
  }
}
