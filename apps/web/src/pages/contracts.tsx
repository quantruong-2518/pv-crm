import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  ColumnFilter,
  ColumnFilterList,
  ColumnFilterRange,
  FileCheck,
  Icon,
  Lock,
  ScreenLayout,
  SearchField,
  SegmentedControl,
  StatCard,
  billions,
  vnd,
  millions,
} from '@pv/ui'
import { ContractBookQuery, OWNER_NONE, type ContractStatusFilter } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { useAppChrome } from '@/app/chrome'
import { useSalesPeople } from '@/data/directory'
import { dm } from '@/lib/date'
import {
  bookRowsOf,
  contractBookQuery,
  contractSummaryQuery,
  daysPhrase,
  type ContractBookRow,
  type InstallmentView,
} from '@/data/contracts'
import { BookCount, BookPage } from '@/components/book-page'
import { AvatarCell, TableFooter } from '@/components/table-bits'
import { MoneySplit } from '@/components/contract-bits'
import { MoneyCell } from '@/components/money-cell'

/** Level 0 of the contract drill — the book, then a contract, then one
 *  installment. This screen answers one question and refuses the others: which
 *  of my contracts wants something from me today. Drawn on `BookPage`, like
 *  every other book. */

/** Rows per page — the screen decides, the server pages. */
const PAGE_SIZE = 10

const STATUS_TABS: { value: ContractStatusFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'open', label: 'Đang thu' },
  { value: 'overdue', label: 'Quá hạn' },
  { value: 'collected', label: 'Đã thu đủ' },
]

function NextCell({ next }: { next: InstallmentView | null }) {
  if (!next) {
    return <span className="text-success block text-right text-[11.5px]">Đã thu đủ</span>
  }
  return (
    <span className="flex min-w-0 flex-col items-end gap-1">
      <MoneyCell amount={next.installment.amount} missing="Đợt chưa nhập số tiền" />
      <span className="text-muted-foreground tnum font-num truncate text-[11.5px]">
        đợt {next.installment.no} · {dm(next.installment.due)} · {daysPhrase(next.daysLeft)}
      </span>
    </span>
  )
}

function rowCells(row: ContractBookRow) {
  const amount = row.contract.amount ?? 0
  /* At risk = the next installment when it wants attention today. It used to be
     "the next installment has a blocker", which a book row can no longer
     answer: `GET /sales/contracts` ships the lean installment, checklist left
     out. The level is derived from the due date, which the row does carry. */
  const atRisk = row.urgent ? (row.next?.installment.amount ?? 0) : 0

  return [
    <span key="code" className="text-accent-foreground font-mono text-[11.5px]">
      {row.contract.code}
    </span>,
    <span key="customer" className="block truncate text-[12.5px]">
      {row.contract.customer}
    </span>,
    <span key="signed" className="tnum font-num text-[11.5px]">
      {dm(row.contract.signedAt)}
    </span>,
    <AvatarCell key="owner" name={row.contract.ownerName} empty="Chưa có người phụ trách" />,
    <MoneyCell key="value" amount={row.contract.amount} missing="Hợp đồng chưa nhập giá trị" />,
    <span key="collected" className="flex min-w-0 flex-col gap-1">
      <MoneySplit
        collected={row.collected}
        atRisk={atRisk}
        ahead={row.remaining - atRisk}
        className="h-1.5"
      />
      <span className="flex min-w-0 items-baseline justify-end gap-2">
        <span className="text-muted-foreground tnum font-num shrink-0 text-[11.5px]">
          {amount === 0 ? '—' : `${Math.round((row.collected / amount) * 100)}%`}
        </span>
        <MoneyCell amount={row.collected} muted={row.collected === 0} />
      </span>
    </span>,
    <NextCell key="next" next={row.next} />,
  ]
}

/** Numbers of the WHOLE book, counted in SQL.
 *
 *  The summary door drops the scope axis on purpose, so these three do not
 *  shrink to what the reader owns — which is exactly why the line above says so.
 *  Someone who only sees their own contracts reads a signed count here larger
 *  than the table below, and they only know that if something tells them. */
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
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground m-0 text-[12px] leading-[1.5]">
        Số liệu của toàn bộ hợp đồng, không giới hạn theo phạm vi dữ liệu của bạn
      </p>

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
          label="Đã thu tiền"
          value={millions(collected, 0)}
          /* Denominator is the SCHEDULE, not the signed value: collected money
             is summed from installments, so that is the only apples-to-apples
             ratio. */
          source={
            scheduled === 0
              ? 'Chưa có đợt thanh toán nào'
              : `${Math.round((collected / scheduled) * 100)}% số tiền đã lên lịch thu`
          }
        />
        <StatCard
          size="compact"
          label="Tiền quá hạn"
          value={millions(overdue, 0)}
          source={
            overdueCount > 0
              ? `${overdueCount} đợt thanh toán cần xử lý`
              : 'Không có khoản thu quá hạn'
          }
          delta={
            overdueCount > 0 ? { direction: 'down', text: 'đang trễ', tone: 'danger' } : undefined
          }
        />
        <StatCard
          size="compact"
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
    </div>
  )
}

type Book = ReturnType<typeof useBookQuery<ContractBookQuery>>

/** The header filters and the sort handler — kept off the page body so it stays
 *  under the function-length cap. */
function useColumnTools(book: Book) {
  const { query } = book
  const salesPeople = useSalesPeople()
  const ownerOptions = [
    { value: OWNER_NONE, label: 'Chưa có người phụ trách' },
    ...salesPeople.map((a) => ({ value: a.id, label: a.name })),
  ]
  const ownerFilter = (
    <ColumnFilter label="Người phụ trách" active={Boolean(query.owner)}>
      {(close) => (
        <ColumnFilterList
          options={ownerOptions}
          selected={query.owner ? query.owner.split(',') : []}
          close={close}
          onApply={(v) => book.patch({ owner: v.length ? v.join(',') : undefined })}
        />
      )}
    </ColumnFilter>
  )
  const signedFilter = (
    <ColumnFilter label="Ngày ký" active={Boolean(query.signedFrom || query.signedTo)}>
      {(close) => (
        <ColumnFilterRange
          from={query.signedFrom}
          to={query.signedTo}
          close={close}
          onApply={({ from, to }) => book.patch({ signedFrom: from, signedTo: to })}
        />
      )}
    </ColumnFilter>
  )

  /* The arrow always lights: the default order (`nextDue asc`) is a column here. */
  const onSort = (key: string) => {
    if (key !== 'amount' && key !== 'nextDue') return
    book.patch(
      query.sort === key
        ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
        : { sort: key, dir: key === 'amount' ? 'desc' : 'asc' },
    )
  }

  return { ownerFilter, signedFilter, onSort }
}

export function ContractsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm hợp đồng, khách hàng, số hoá đơn…' })
  const navigate = useNavigate()

  /* The address is the filter state (Back, F5 and shared links keep it). */
  const book = useBookQuery(ContractBookQuery, {
    size: PAGE_SIZE,
    filterKeys: ['status', 'owner', 'signedFrom', 'signedTo'],
  })
  const { query } = book

  /* `error` is read, not dropped. Without it a dead server renders as the empty
     book, and the reader goes off looking for a deal to sign. */
  const { data, isPending, error, refetch } = useQuery(contractBookQuery(query))
  const { pageIndex } = useBookPageClamp(book, data?.total)

  const rows = useMemo(() => (data ? bookRowsOf(data) : []), [data])
  const hidden = data?.hidden ?? 0

  const { ownerFilter, signedFilter, onSort } = useColumnTools(book)

  /* One `size=1` read per tab: `total` is the count under the OTHER filters in
     force, and no other endpoint answers that. */
  const tabCounts = useQueries({
    queries: STATUS_TABS.map((tab) =>
      contractBookQuery({ ...book.urlQuery, status: tab.value, page: 1, size: 1 }),
    ),
  })
  const tabs = STATUS_TABS.map((tab, i) => ({ ...tab, count: tabCounts[i]?.data?.total }))

  const tableRows = rows.map((row) => ({
    id: row.contract.code,
    cells: rowCells(row),
    onOpen: () => navigate(`/sales/contracts/${row.contract.code}`),
  }))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Hợp đồng"
          score={<ContractScore />}
          tabs={
            <SegmentedControl
              label="Tình trạng thu"
              hideLabel
              tone="quiet"
              value={query.status}
              options={tabs}
              onChange={(status) => book.patch({ status: status as ContractStatusFilter })}
            />
          }
          count={data && <BookCount total={data.total} noun="hợp đồng" />}
          tools={
            <>
              <SearchField
                placeholder="Tìm theo mã hợp đồng hoặc tên khách hàng…"
                value={book.text}
                onChange={book.setText}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              {book.dirty && (
                <Button
                  size="md"
                  variant="ghost"
                  className="pointer-coarse:h-12"
                  onClick={book.clear}
                >
                  Bỏ hết bộ lọc
                </Button>
              )}
            </>
          }
          pending={isPending}
          failure={
            error
              ? {
                  message: `Không tải được danh sách hợp đồng. ${
                    isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            tableRows.length === 0
              ? book.dirty
                ? {
                    message: 'Không có hợp đồng nào phù hợp với bộ lọc hiện tại.',
                    action: { label: 'Bỏ hết bộ lọc', onClick: book.clear },
                  }
                : {
                    message:
                      'Chưa có hợp đồng nào trong phạm vi của bạn. Hợp đồng sẽ được tạo khi một cơ hội ký thành công.',
                    action: {
                      label: 'Xem sổ cơ hội',
                      onClick: () => navigate('/sales/opportunities'),
                    },
                  }
              : undefined
          }
          table={{
            minWidth: 'min-w-[1080px]',
            sort: { key: query.sort, dir: query.dir },
            onSort,
            columns: [
              { header: 'Mã', width: '104px' },
              { header: 'Khách hàng', width: 'minmax(0, 1fr)' },
              { header: signedFilter, width: '104px' },
              { header: ownerFilter, width: '140px', align: 'center' },
              {
                header: 'Giá trị hợp đồng (₫)',
                width: '176px',
                align: 'right',
                sortKey: 'amount',
              },
              { header: 'Tiến độ thu (₫)', width: '184px', align: 'right' },
              {
                header: 'Đợt thu tiếp theo (₫)',
                width: '184px',
                align: 'right',
                sortKey: 'nextDue',
              },
            ],
            rows: tableRows,
          }}
          footer={
            <TableFooter
              page={pageIndex}
              pageSize={PAGE_SIZE}
              total={data?.total ?? 0}
              onPage={book.goPage}
            />
          }
        />

        {/* `hidden` is the server's receipt for the scope cut, so the screen can
            name the axis that stopped them: a wider role will not open this row,
            only a change of owner will. */}
        {hidden > 0 && (
          <div className="text-muted-foreground flex items-center gap-3 text-[11.5px]">
            <Icon icon={Lock} size={16} />
            <span>
              {hidden} hợp đồng không hiển thị vì nằm ngoài phạm vi dữ liệu của bạn. Muốn xem các
              hợp đồng này, cần thay đổi người phụ trách.
            </span>
          </div>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default ContractsPage
