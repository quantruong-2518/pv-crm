import { useQuery } from '@tanstack/react-query'
import { ColumnFilter, ColumnFilterList, ColumnFilterRange } from '@pv/ui'
import { OWNER_NONE, type ContactBookQuery } from '@pv/contracts'
import type { useBookQuery } from '@/app/book-query'
import { contactFacetsQuery } from '@/data/contacts'
import { useSalesPeople } from '@/data/directory'

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

  const listFilter = (
    label: string,
    key: 'account' | 'owner',
    options: { value: string; label: string }[],
    iconOnly?: boolean,
  ) => (
    <ColumnFilter label={label} active={query[key] !== undefined} iconOnly={iconOnly}>
      {(close) => (
        <ColumnFilterList
          options={options}
          selected={csvOf(query[key])}
          close={close}
          onApply={(v) => patch({ [key]: v.length ? v.join(',') : undefined })}
        />
      )}
    </ColumnFilter>
  )
  /* Two answers, so picking both (or neither) means "no filter". */
  const presenceFilter = (label: string, key: 'hasEmail' | 'hasPhone', noun: string) => (
    <ColumnFilter label={label} active={query[key] !== undefined}>
      {(close) => (
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
      )}
    </ColumnFilter>
  )
  const primaryFilter = (
    <ColumnFilter label="Người liên hệ chính" active={query.primary !== undefined} iconOnly>
      {(close) => (
        <ColumnFilterList
          searchable={false}
          options={[{ value: '1', label: 'Chỉ người liên hệ chính' }]}
          selected={query.primary ? ['1'] : []}
          close={close}
          onApply={(v) => patch({ primary: v.length ? '1' : undefined })}
        />
      )}
    </ColumnFilter>
  )
  const dateFilter = (
    <ColumnFilter label="Ngày tạo" active={Boolean(query.createdFrom || query.createdTo)} iconOnly>
      {(close) => (
        <ColumnFilterRange
          from={query.createdFrom}
          to={query.createdTo}
          close={close}
          onApply={({ from, to }) => patch({ createdFrom: from, createdTo: to })}
        />
      )}
    </ColumnFilter>
  )

  return {
    primaryFilter,
    dateFilter,
    account: listFilter('Công ty', 'account', accountOptions, true),
    owner: listFilter('Người phụ trách', 'owner', ownerOptions),
    email: presenceFilter('Email', 'hasEmail', 'email'),
    phone: presenceFilter('Điện thoại', 'hasPhone', 'số điện thoại'),
  }
}
