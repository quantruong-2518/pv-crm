import { ContractBookQuery, type ContractStatusFilter } from '@pv/contracts'
import type { useBookQuery } from '@/app/book-query'
import { useI18n } from '@/app/i18n'
import { CONTRACT_COPY as COPY } from '@/data/contract-copy'
import { useSalesPeople } from '@/data/directory'
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
  const { t } = useI18n()
  const { query } = book
  const people = useSalesPeople()
  const kindOptions = useContractKindFilterOptions()
  const kindName = useContractKindLabel()

  const filters = {
    owner: (
      <ListFilter
        label={t(COPY.closer)}
        options={peopleOptions(people, t(COPY.noCloser))}
        value={query.owner}
        onChange={(owner) => book.patch({ owner })}
      />
    ),
    kind:
      kindOptions.length === 0 ? undefined : (
        <ListFilter
          label={t(COPY.contractKind)}
          options={kindOptions}
          searchable={false}
          value={query.kind}
          onChange={(kind) => book.patch({ kind })}
        />
      ),
    signed: (
      <DayRangeFilter
        label={t(COPY.signedDay)}
        from={query.signedFrom}
        to={query.signedTo}
        onChange={({ from, to }) => book.patch({ signedFrom: from, signedTo: to })}
      />
    ),
    amount: (
      <AmountRangeFilter
        label={t(COPY.valueVnd)}
        min={query.amountMin}
        max={query.amountMax}
        onChange={({ min, max }) => book.patch({ amountMin: min, amountMax: max })}
      />
    ),
    /* A terminated contract has no next installment, so a range here could never match. */
    due:
      query.status === 'terminated' ? undefined : (
        <DayRangeFilter
          label={t(COPY.nextPayment)}
          from={query.dueFrom}
          to={query.dueTo}
          onChange={({ from, to }) => book.patch({ dueFrom: from, dueTo: to })}
        />
      ),
  }

  const chips: ActiveFilter[] = [
    ...listChip('owner', t(COPY.closer), query.owner, personNameOf(people, t(COPY.noCloser)), () =>
      book.patch({ owner: undefined }),
    ),
    ...listChip('kind', t(COPY.contractKind), query.kind, kindName, () =>
      book.patch({ kind: undefined }),
    ),
    ...dayRangeChip('signed', t(COPY.signedDay), query.signedFrom, query.signedTo, () =>
      book.patch({ signedFrom: undefined, signedTo: undefined }),
    ),
    ...amountChip('amount', t(COPY.value), query.amountMin, query.amountMax, () =>
      book.patch({ amountMin: undefined, amountMax: undefined }),
    ),
    ...dayRangeChip('due', t(COPY.nextPayment), query.dueFrom, query.dueTo, () =>
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
