import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Coins,
  FileCheck,
  ListChecks,
  ScreenLayout,
  SegmentedControl,
  StatCard,
  TriangleAlert,
} from '@pv/ui'
import { ContractBookQuery, type ContractStatusFilter } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { useAppChrome } from '@/app/chrome'
import { message, useI18n } from '@/app/i18n'
import { CONTRACT_COPY as COPY } from '@/data/contract-copy'
import {
  CONTRACT_FILTER_KEYS,
  bookRowsOf,
  contractBookQuery,
  contractDetailQuery,
  contractSummaryQuery,
} from '@/data/contracts'
import { useContractKindLabel } from '@/data/sales-config'
import { BookCount, BookPage, BookSearch } from '@/components/book-page'
import { BOOK_PAGE_SIZE } from '@/components/book-columns'
import { TableFooter } from '@/components/table-bits'
import { useRowIntent } from '@/components/row-intent'
import { contractCells, contractColumns } from './contracts-columns'
import { useContractFilters } from './contracts-filters'

/** Level 0 of the contract drill — the book, then a contract, then one
 *  installment. This screen answers one question and refuses the others: which
 *  of my contracts wants something from me today. Drawn on `BookPage`, like
 *  every other book. */

/** Only what the server's search reads: the contract code and the customer's company. */

/** Numbers of the WHOLE book, counted in SQL.
 *
 *  The summary door drops the scope axis on purpose, so these three do not
 *  shrink to what the reader owns: someone who only sees their own contracts
 *  reads a signed count here larger than the table below. */
function ContractScore() {
  const { lang, t, number, currency } = useI18n()
  const { data } = useQuery(contractSummaryQuery)

  const signedCount = data?.signedCount ?? 0
  const signed = data?.signedAmountVnd ?? 0
  const blank = data?.blankAmount ?? 0
  const scheduled = data?.scheduledVnd ?? 0
  const collected = data?.collectedVnd ?? 0
  const overdue = data?.overdueVnd ?? 0
  const overdueCount = data?.overdueCount ?? 0
  const lateOurs = data?.lateConditionsOurs ?? 0
  const lateTheirs = data?.lateConditionsTheirs ?? 0
  const shortMoney = (value: number, unit: 'billion' | 'million') => {
    const divisor = unit === 'billion' ? 1_000_000_000 : 1_000_000
    const amount = number(value / divisor, { maximumFractionDigits: 1 })
    const word = unit === 'billion' ? message('tỷ', 'bn', '십억') : message('triệu', 'm', '백만')
    return `${amount} ${t(word)} ₫`
  }
  const contractCount =
    lang === 'ko' ? `계약 ${number(signedCount)}건` : `${number(signedCount)} ${t(COPY.bookCount)}`

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        size="compact"
        icon={FileCheck}
        label={t(COPY.totalValue)}
        value={shortMoney(signed, 'billion')}
        /* Contracts carrying no amount are reported beside the sum rather than
             counted as zero: a total that quietly swallows them reads smaller
             than the truth with nothing on screen saying why. */
        source={
          blank === 0
            ? `${contractCount} · ${currency(signed, 'VND')}`
            : `${contractCount} · ${number(blank)} ${t(COPY.amountMissing)}`
        }
      />
      <StatCard
        size="compact"
        icon={Coins}
        label={t(COPY.collectedAmount)}
        value={shortMoney(collected, 'million')}
        /* Denominator is the SCHEDULE, not the signed value: collected money
             is summed from installments, so that is the only apples-to-apples
             ratio. */
        source={
          scheduled === 0
            ? t(COPY.noInstallments)
            : `${number(Math.round((collected / scheduled) * 100))}% ${t(COPY.scheduledTotal)}`
        }
      />
      <StatCard
        size="compact"
        icon={TriangleAlert}
        tone={overdueCount > 0 ? 'danger' : 'default'}
        label={t(COPY.overdueAmount)}
        value={shortMoney(overdue, 'million')}
        source={
          overdueCount > 0
            ? `${number(overdueCount)} ${t(COPY.overdueInstallments)}`
            : t(COPY.noOverdueAmount)
        }
      />
      <StatCard
        size="compact"
        icon={ListChecks}
        label={t(COPY.overdueConditions)}
        value={number(lateOurs + lateTheirs)}
        /* Counts CONDITIONS, not contracts — two late conditions on one
             contract are two phone calls. Kept split by side because one side
             is a call to the customer and the other is a call down the hall. */
        source={
          lateOurs + lateTheirs === 0
            ? t(COPY.noOverdueConditions)
            : `${number(lateTheirs)} ${t(COPY.fromCustomer)} · ${number(lateOurs)} ${t(COPY.fromTeam)}`
        }
      />
    </div>
  )
}

export function ContractsPage() {
  const { lang, t } = useI18n()
  const searchHint = t(COPY.bookSearch)
  const chrome = useAppChrome({ searchPlaceholder: searchHint })
  const navigate = useNavigate()
  const resolveKind = useContractKindLabel()

  /* The address is the filter state (Back, F5 and shared links keep it). */
  const book = useBookQuery(ContractBookQuery, {
    size: BOOK_PAGE_SIZE,
    filterKeys: CONTRACT_FILTER_KEYS,
  })
  const { query } = book

  /* `error` is read, not dropped. Without it a dead server renders as the empty
     book, and the reader goes off looking for a deal to sign. */
  const { data, isPending, error, refetch } = useQuery(contractBookQuery(query))
  const { pageIndex } = useBookPageClamp(book, data?.total)

  const rows = useMemo(() => (data ? bookRowsOf(data) : []), [data])
  const { filters, chips, onSort, onStatus } = useContractFilters(book)

  /* One `size=1` read per tab: `total` is the count under the OTHER filters in
     force, and no other endpoint answers that. */
  const statusTabs: { value: ContractStatusFilter; label: string }[] = [
    { value: 'all', label: t(COPY.all) },
    { value: 'open', label: t(COPY.collecting) },
    { value: 'overdue', label: t(COPY.overdue) },
    { value: 'collected', label: t(COPY.collected) },
    { value: 'terminated', label: t(COPY.terminated) },
  ]
  const tabCounts = useQueries({
    queries: statusTabs.map((tab) =>
      contractBookQuery({ ...book.urlQuery, status: tab.value, page: 1, size: 1 }),
    ),
  })
  const tabs = statusTabs.map((tab, i) => ({ ...tab, count: tabCounts[i]?.data?.total }))

  const intent = useRowIntent(contractDetailQuery, () => import('@/pages/contract-detail'))
  const tableRows = rows.map((row) => ({
    id: row.contract.code,
    cells: contractCells(row, resolveKind, lang),
    onOpen: () => navigate(`/sales/contracts/${row.contract.code}`),
    ...intent(row.contract.code),
  }))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title={t(COPY.bookTitle)}
          score={<ContractScore />}
          tabs={
            <SegmentedControl
              label={t(COPY.collectionStatus)}
              hideLabel
              tone="quiet"
              value={query.status}
              options={tabs}
              onChange={(status) => onStatus(status as ContractStatusFilter)}
            />
          }
          count={
            data && <BookCount total={data.total} noun={t(COPY.bookCount)} hidden={data.hidden} />
          }
          filters={chips}
          tools={<BookSearch value={book.text} onChange={book.setText} placeholder={searchHint} />}
          onClearFilters={book.dirty ? book.clear : undefined}
          pending={isPending}
          failure={
            error
              ? {
                  message: `${t(COPY.loadFailed)} ${isApiError(error) ? userMessage(error) : t(COPY.retry)}`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            tableRows.length === 0
              ? book.dirty
                ? {
                    message: t(COPY.noMatch),
                    action: { label: t(COPY.clearFilters), onClick: book.clear },
                  }
                : {
                    message: t(COPY.noContracts),
                    action: {
                      label: t(COPY.viewOpportunities),
                      onClick: () => navigate('/sales/opportunities'),
                    },
                  }
              : undefined
          }
          table={{
            sort: { key: query.sort, dir: query.dir },
            onSort,
            columns: contractColumns(filters, lang),
            rows: tableRows,
            pageSize: BOOK_PAGE_SIZE,
          }}
          footer={
            <TableFooter
              page={pageIndex}
              pageSize={BOOK_PAGE_SIZE}
              total={data?.total ?? 0}
              onPage={book.goPage}
            />
          }
        />
      </ScreenLayout>
    </AppShell>
  )
}

export default ContractsPage
