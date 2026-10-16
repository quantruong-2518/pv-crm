import { useQuery } from '@tanstack/react-query'
import { ColumnFilter, ColumnFilterList, ColumnFilterRange } from '@pv/ui'
import { OWNER_NONE, type ContactBookQuery } from '@pv/contracts'
import type { useBookQuery } from '@/app/book-query'
import { contactFacetsQuery } from '@/data/contacts'
import { useSalesPeople } from '@/data/directory'
import { FilterMenu } from '@/components/table-bits'
import { FilterSection } from '@/components/book-cards'
import { noop } from '@/components/book-view'

/** The contact book's column filters, built once per render from the address.
 *  Company options are the companies that hold a contact this reader can see,
 *  from the book's own facets, not the company book. */

const csvOf = (v?: string) => (v ? v.split(',') : [])

export function useContactFilters(book: ReturnType<typeof useBookQuery<ContactBookQuery>>) {
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
    { value: OWNER_NONE, label: 'Chưa có người phụ trách' },
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
  const presenceBody = (key: 'hasEmail' | 'hasPhone', noun: string) => (close: () => void) => (
    <ColumnFilterList
      searchable={false}
      options={[
        { value: '1', label: `Đã có ${noun}` },
        { value: '0', label: `Chưa có ${noun}` },
      ]}
      selected={query[key] ? [query[key]] : []}
      close={close}
      onApply={(v) => patch({ [key]: v.length === 1 ? v[0] : undefined })}
    />
  )
  const primaryBody = (close: () => void) => (
    <ColumnFilterList
      searchable={false}
      options={[{ value: '1', label: 'Chỉ người liên hệ chính' }]}
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
    { title: 'Người liên hệ chính', on: query.primary !== undefined, body: primaryBody },
    {
      title: 'Công ty',
      on: query.account !== undefined,
      body: listBody('account', accountOptions),
    },
    {
      title: 'Người phụ trách',
      on: query.owner !== undefined,
      body: listBody('owner', ownerOptions),
    },
    { title: 'Email', on: query.hasEmail !== undefined, body: presenceBody('hasEmail', 'email') },
    {
      title: 'Điện thoại',
      on: query.hasPhone !== undefined,
      body: presenceBody('hasPhone', 'số điện thoại'),
    },
    {
      title: 'Ngày tạo',
      on: Boolean(query.createdFrom || query.createdTo),
      body: dateBody,
    },
  ]
  const [primary, account, owner, email, phone, date] = sections
  const column = (f: (typeof sections)[number], iconOnly?: boolean) => (
    <ColumnFilter label={f.title} active={f.on} iconOnly={iconOnly}>
      {f.body}
    </ColumnFilter>
  )
  const menu = (
    <FilterMenu label="Bộ lọc sổ người liên hệ" active={sections.filter((f) => f.on).length}>
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
  }
}
