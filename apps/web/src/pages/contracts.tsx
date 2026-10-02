import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  FileCheck,
  Icon,
  Lock,
  ScreenLayout,
  StatCard,
  billions,
  vnd,
  millions,
} from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
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
import { MoneySplit } from '@/components/contract-bits'

/** Level 0 of the contract drill — the book, then a contract, then one
 *  installment. This screen answers one question and refuses the others: which
 *  of my contracts wants something from me today. Drawn on `BookPage`, like
 *  every other book. */

const COLUMNS = [
  { header: 'Mã', width: '104px' },
  { header: 'Khách hàng', width: 'minmax(0, 1fr)' },
  { header: 'Giá trị', width: '148px', align: 'right' as const },
  { header: 'Đã thu', width: '184px' },
  { header: 'Đợt kế tiếp', width: '176px' },
]

function NextCell({ next }: { next: InstallmentView | null }) {
  if (!next) {
    return <span className="text-success text-[11.5px]">Đã thu đủ</span>
  }
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="tnum font-num text-[12.5px] font-semibold">
        {vnd(next.installment.amount)}
      </span>
      <span className="text-muted-foreground tnum font-mono text-[10.5px]">
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
    <span key="customer" className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[12.5px]">{row.contract.customer}</span>
      <span className="text-muted-foreground text-[10.5px]">
        {row.contract.ownerName ?? 'chưa gán người'} · ký {dm(row.contract.signedAt)}
      </span>
    </span>,
    <span key="value" className="tnum font-num text-right text-[13px] font-semibold">
      {vnd(amount)}
    </span>,
    <span key="collected" className="flex min-w-0 flex-col gap-1">
      <MoneySplit
        collected={row.collected}
        atRisk={atRisk}
        ahead={row.remaining - atRisk}
        className="h-1.5"
      />
      <span className="text-muted-foreground tnum font-mono text-[10.5px]">
        {millions(row.collected, 0)} ·{' '}
        {amount === 0 ? '—' : `${Math.round((row.collected / amount) * 100)}%`}
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
        Số của cả sổ · không theo phạm vi của bạn
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          size="compact"
          icon={FileCheck}
          label="Giá trị đang chạy"
          value={billions(signed)}
          /* Contracts carrying no amount are reported beside the sum rather than
             counted as zero: a total that quietly swallows them reads smaller
             than the truth with nothing on screen saying why. */
          source={
            blank === 0
              ? `${signedCount} hợp đồng · ${vnd(signed)}`
              : `${signedCount} hợp đồng · ${blank} chưa có tiền, không cộng vào`
          }
        />
        <StatCard
          size="compact"
          label="Đã thu"
          value={millions(collected, 0)}
          /* Denominator is the SCHEDULE, not the signed value: collected money
             is summed from installments, so that is the only apples-to-apples
             ratio. */
          source={
            scheduled === 0
              ? 'chưa đợt nào lên lịch'
              : `${Math.round((collected / scheduled) * 100)}% tiền đã lên lịch`
          }
        />
        <StatCard
          size="compact"
          label="Quá hạn thu"
          value={millions(overdue, 0)}
          source={
            overdueCount > 0 ? `${overdueCount} đợt · phải gọi hôm nay` : 'không có đồng nào trễ'
          }
          delta={
            overdueCount > 0 ? { direction: 'down', text: 'đang trễ', tone: 'danger' } : undefined
          }
        />
        <StatCard
          size="compact"
          label="Việc đang trễ"
          value={String(lateOurs + lateTheirs)}
          /* Counts CONDITIONS, not contracts — two late conditions on one
             contract are two phone calls. Kept split by side because one side
             is a call to the customer and the other is a call down the hall. */
          source={
            lateOurs + lateTheirs === 0
              ? 'không việc nào tắc'
              : `${lateTheirs} bên khách · ${lateOurs} bên ta`
          }
        />
      </div>
    </div>
  )
}

export function ContractsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm hợp đồng, khách hàng, số hoá đơn…' })
  const navigate = useNavigate()

  /* `error` is read, not dropped. Without it a dead server renders as the empty
     book, and the reader goes off looking for a deal to sign. */
  const { data, isPending, error, refetch } = useQuery(contractBookQuery())

  const rows = useMemo(() => (data ? bookRowsOf(data) : []), [data])
  const hidden = data?.hidden ?? 0

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
          count={data && <BookCount total={data.total} noun="hợp đồng" />}
          pending={isPending}
          failure={
            error
              ? {
                  message: `Không lấy được sổ hợp đồng. ${
                    isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            tableRows.length === 0
              ? {
                  message:
                    'Chưa có hợp đồng nào đứng tên bạn — một cơ hội chốt thắng sẽ sinh ra hợp đồng và nó xuất hiện ở đây.',
                  action: {
                    label: 'Mở sổ cơ hội',
                    onClick: () => navigate('/sales/opportunities'),
                  },
                }
              : undefined
          }
          table={{ minWidth: 'min-w-[880px]', columns: COLUMNS, rows: tableRows }}
        />

        {/* `hidden` is the server's receipt for the scope cut, so the screen can
            name the axis that stopped them: a wider role will not open this row,
            only a change of owner will. */}
        {hidden > 0 && (
          <div className="text-muted-foreground flex items-center gap-3 text-[11.5px]">
            <Icon icon={Lock} size={16} />
            <span>
              {hidden} hợp đồng của phòng không hiện ở đây —{' '}
              <strong className="text-glass-foreground font-semibold">
                chúng không đứng tên bạn
              </strong>
              . Đây là phạm vi, không phải vai: xin quyền rộng hơn cũng không mở, đổi chủ thì mới.
            </span>
          </div>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default ContractsPage
