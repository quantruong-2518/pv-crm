import { ContractBookQuery, type ContractStatusFilter } from '@pv/contracts'
import type { useBookQuery } from '@/app/book-query'
import { useSalesPeople } from '@/data/directory'
import { NO_CLOSER } from '@/data/contracts'
import { useContractKindFilterOptions, useContractKindLabel } from '@/data/sales-config'
import {
  amountChip,
  dayRangeChip,
  listChip,
  personNameOf,
  type ActiveFilter,
} from '@/components/active-filters'
import { peopleOptions } from '@/components/book-columns'
import { AmountRangeFilter, DayRangeFilter, ListFilter } from '@/components/book-filters'

/** The contract book's header filters, chips and sort rule — kept off the page
 *  body so `ContractsPage` stays under the function-length cap. The tab bar
 *  owns `status`; every other key here is set by a header or a shared link. */

type Book = ReturnType<typeof useBookQuery<ContractBookQuery>>
type SortKey = ContractBookQuery['sort']

/** Dates and money open on the biggest / newest, text on A first. */
const FIRST_DIR: Record<SortKey, ContractBookQuery['dir']> = {
  code: 'asc',
  signedAt: 'desc',
  amount: 'desc',
  nextDue: 'asc',
}

export function useContractFilters(book: Book) {
  const { query } = book
  const people = useSalesPeople()
  const kindOptions = useContractKindFilterOptions()
  const kindName = useContractKindLabel()

  const filters = {
    owner: (
      <ListFilter
        label="Người chốt"
        options={peopleOptions(people, NO_CLOSER)}
        value={query.owner}
        onChange={(owner) => book.patch({ owner })}
      />
    ),
    kind:
      kindOptions.length === 0 ? undefined : (
        <ListFilter
          label="Loại hợp đồng"
          options={kindOptions}
          searchable={false}
          value={query.kind}
          onChange={(kind) => book.patch({ kind })}
        />
      ),
    signed: (
      <DayRangeFilter
        label="Ngày ký"
        from={query.signedFrom}
        to={query.signedTo}
        onChange={({ from, to }) => book.patch({ signedFrom: from, signedTo: to })}
      />
    ),
    amount: (
      <AmountRangeFilter
        label="Giá trị (₫)"
        min={query.amountMin}
        max={query.amountMax}
        onChange={({ min, max }) => book.patch({ amountMin: min, amountMax: max })}
      />
    ),
    /* A terminated contract has no next installment, so a range here could never match. */
    due:
      query.status === 'terminated' ? undefined : (
        <DayRangeFilter
          label="Đợt thu tiếp theo"
          from={query.dueFrom}
          to={query.dueTo}
          onChange={({ from, to }) => book.patch({ dueFrom: from, dueTo: to })}
        />
      ),
  }

  const chips: ActiveFilter[] = [
    ...listChip('owner', 'Người chốt', query.owner, personNameOf(people, NO_CLOSER), () =>
      book.patch({ owner: undefined }),
    ),
    ...listChip('kind', 'Loại hợp đồng', query.kind, kindName, () =>
      book.patch({ kind: undefined }),
    ),
    ...dayRangeChip('signed', 'Ngày ký', query.signedFrom, query.signedTo, () =>
      book.patch({ signedFrom: undefined, signedTo: undefined }),
    ),
    ...amountChip('amount', 'Giá trị', query.amountMin, query.amountMax, () =>
      book.patch({ amountMin: undefined, amountMax: undefined }),
    ),
    ...dayRangeChip('due', 'Đợt thu tiếp theo', query.dueFrom, query.dueTo, () =>
      book.patch({ dueFrom: undefined, dueTo: undefined }),
    ),
  ]

  /* The arrow always lights: the default order (`nextDue asc`) is a column here. */
  const onSort = (key: string) => {
    const parsed = ContractBookQuery.shape.sort.safeParse(key)
    if (!parsed.success) return
    const next = parsed.data
    book.patch(
      query.sort === next
        ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
        : { sort: next, dir: FIRST_DIR[next] },
    )
  }

  /* The tab bar's press: the due range goes with a tab where no row can match it. */
  const onStatus = (status: ContractStatusFilter) =>
    book.patch(
      status === 'terminated' ? { status, dueFrom: undefined, dueTo: undefined } : { status },
    )

  return { filters, chips, onSort, onStatus }
}
