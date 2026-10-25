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
  billions,
  vnd,
  millions,
} from '@pv/ui'
import {
  ContractBookQuery,
  OPPORTUNITY_STATE_LABEL,
  type ContractStatusFilter,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { useAppChrome } from '@/app/chrome'
import {
  COLLECTED_LABEL,
  COLLECTING_LABEL,
  CONTRACT_FILTER_KEYS,
  bookRowsOf,
  contractBookQuery,
  contractDetailQuery,
  contractSummaryQuery,
  OVERDUE_LABEL,
} from '@/data/contracts'
import { useContractKindLabel } from '@/data/sales-config'
import { BookCount, BookPage, BookSearch } from '@/components/book-page'
import { BOOK_PAGE_SIZE } from '@/components/book-columns'
import { TableFooter } from '@/components/table-bits'
import { useRowIntent } from '@/components/row-intent'
import { contractCells, contractColumns } from './contracts-columns'
import { ContractsPenaltyBand } from './contracts-penalty-band'
import { useContractFilters } from './contracts-filters'

/** Level 0 of the contract drill — the book, then a contract, then one
 *  installment. This screen answers one question and refuses the others: which
 *  of my contracts wants something from me today. Drawn on `BookPage`, like
 *  every other book. */

const STATUS_TABS: { value: ContractStatusFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'open', label: COLLECTING_LABEL },
  { value: 'overdue', label: OVERDUE_LABEL },
  { value: 'collected', label: COLLECTED_LABEL },
  { value: 'terminated', label: OPPORTUNITY_STATE_LABEL.terminated },
]

/** Only what the server's search reads: the contract code and the customer's company. */
const SEARCH_HINT = 'Tìm theo mã hợp đồng hoặc tên khách hàng…'

/** Numbers of the WHOLE book, counted in SQL.
 *
 *  The summary door drops the scope axis on purpose, so these three do not
 *  shrink to what the reader owns: someone who only sees their own contracts
 *  reads a signed count here larger than the table below. */
function ContractScore() {
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

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        size="compact"
        icon={FileCheck}
        label="Tổng giá trị hợp đồng"
        value={billions(signed)}
        /* Contracts carrying no amount are reported beside the sum rather than
             counted as zero: a total that quietly swallows them reads smaller
             than the truth with nothing on screen saying why. */
        source={
          blank === 0
            ? `${signedCount} hợp đồng · ${vnd(signed)}`
            : `${signedCount} hợp đồng · ${blank} chưa nhập giá trị`
        }
      />
      <StatCard
        size="compact"
        icon={Coins}
        label="Đã thu tiền"
        value={millions(collected, 0)}
        /* Denominator is the SCHEDULE, not the signed value: collected money
             is summed from installments, so that is the only apples-to-apples
             ratio. */
        source={
          scheduled === 0
            ? 'Chưa có đợt thanh toán nào'
            : `${Math.round((collected / scheduled) * 100)}% tổng tiền theo lịch thu`
        }
      />
      <StatCard
        size="compact"
        icon={TriangleAlert}
        tone={overdueCount > 0 ? 'danger' : 'default'}
        label="Tiền quá hạn"
        value={millions(overdue, 0)}
        source={
          overdueCount > 0
            ? `${overdueCount} đợt thanh toán cần xử lý`
            : 'Không có khoản thu quá hạn'
        }
      />
      <StatCard
        size="compact"
        icon={ListChecks}
        label="Điều kiện quá hạn"
        value={String(lateOurs + lateTheirs)}
        /* Counts CONDITIONS, not contracts — two late conditions on one
             contract are two phone calls. Kept split by side because one side
             is a call to the customer and the other is a call down the hall. */
        source={
          lateOurs + lateTheirs === 0
            ? 'Không có điều kiện nào quá hạn'
            : `${lateTheirs} từ khách hàng · ${lateOurs} từ nội bộ`
        }
      />
    </div>
  )
}

export function ContractsPage() {
  const chrome = useAppChrome({ searchPlaceholder: SEARCH_HINT })
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
  const tabCounts = useQueries({
    queries: STATUS_TABS.map((tab) =>
      contractBookQuery({ ...book.urlQuery, status: tab.value, page: 1, size: 1 }),
    ),
  })
  const tabs = STATUS_TABS.map((tab, i) => ({ ...tab, count: tabCounts[i]?.data?.total }))

  const intent = useRowIntent(contractDetailQuery, () => import('@/pages/contract-detail'))
  const tableRows = rows.map((row) => ({
    id: row.contract.code,
    cells: contractCells(row, resolveKind),
    onOpen: () => navigate(`/sales/contracts/${row.contract.code}`),
    ...intent(row.contract.code),
  }))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Hợp đồng"
          score={
            <div className="flex flex-col gap-4">
              <ContractScore />
              <ContractsPenaltyBand onOpen={() => onStatus('terminated')} />
            </div>
          }
          tabs={
            <SegmentedControl
              label="Tình trạng thu"
              hideLabel
              tone="quiet"
              value={query.status}
              options={tabs}
              onChange={(status) => onStatus(status as ContractStatusFilter)}
            />
          }
          count={data && <BookCount total={data.total} noun="hợp đồng" hidden={data.hidden} />}
          filters={chips}
          tools={<BookSearch value={book.text} onChange={book.setText} placeholder={SEARCH_HINT} />}
          onClearFilters={book.dirty ? book.clear : undefined}
          pending={isPending}
          failure={
            error
              ? {
                  message: `Không tải được danh sách hợp đồng. ${
                    isApiError(error) ? userMessage(error) : 'Thử lại.'
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            tableRows.length === 0
              ? book.dirty
                ? {
                    message: 'Không có hợp đồng nào khớp bộ lọc.',
                    action: { label: 'Bỏ hết bộ lọc', onClick: book.clear },
                  }
                : {
                    message: 'Chưa có hợp đồng nào.',
                    action: {
                      label: 'Xem sổ cơ hội',
                      onClick: () => navigate('/sales/opportunities'),
                    },
                  }
              : undefined
          }
          table={{
            sort: { key: query.sort, dir: query.dir },
            onSort,
            columns: contractColumns(filters),
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
