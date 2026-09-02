import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppShell,
  DataTable,
  EmptyState,
  FileCheck,
  GlassCard,
  Icon,
  Lock,
  ScreenHeader,
  ScreenLayout,
  StatCard,
  billions,
  dong,
  millions,
} from '@pv/ui'
import { daysUntil } from '@pv/engines'
import { useAppChrome } from '@/app/chrome'
import { useSession } from '@/app/auth'
import { dm } from '@/lib/date'
import {
  TODAY,
  contractBook,
  daysPhrase,
  type ContractRow,
  type InstallmentView,
} from '@/data/contracts'
import { MoneySplit, SideTag } from '@/components/contract-bits'

/** Level 0 of the contract drill — the book, then a contract, then one
 *  installment. This screen answers one question and refuses the others: which
 *  of my contracts wants something from me today.
 *
 *  Sorted by urgency, not by signing date. A book sorted by date makes the
 *  reader scan for red; a book sorted by urgency has already scanned for them. */

const COLUMNS = [
  { header: 'Mã', width: '104px' },
  { header: 'Khách hàng', width: 'minmax(0, 1fr)' },
  { header: 'Giá trị', width: '148px', align: 'right' as const },
  { header: 'Đã thu', width: '184px' },
  { header: 'Đợt kế tiếp', width: '176px' },
  { header: 'Đang chặn', width: '236px' },
]

function NextCell({ next }: { next: InstallmentView | null }) {
  if (!next) {
    return <span className="text-success text-[11.5px]">Đã thu đủ</span>
  }
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="tnum font-num text-[12.5px] font-semibold">
        {dong(next.installment.amount)}
      </span>
      <span className="text-muted-foreground tnum font-mono text-[10.5px]">
        đợt {next.installment.no} · {dm(next.installment.due)} · {daysPhrase(next.daysLeft)}
      </span>
    </span>
  )
}

/** The blocking cell is the only column the opportunity book does not have. It
 *  answers "who do I call today" with a side plus a sentence — not with a status
 *  word that still needs decoding. */
function BlockingCell({ next }: { next: InstallmentView | null }) {
  if (!next?.blocking) {
    return <span className="text-muted-foreground text-[11.5px]">Không tắc việc nào</span>
  }
  const late = -daysUntil(next.blocking.due, TODAY)
  return (
    <span className="flex min-w-0 items-center gap-2">
      <SideTag side={next.blocking.side} />
      <span className="min-w-0">
        <span className="text-on-tint-destructive block truncate text-[11.5px]">
          {next.blocking.what}
        </span>
        <span className="text-destructive-foreground font-mono text-[10.5px]">trễ {late} ngày</span>
      </span>
    </span>
  )
}

function rowCells(row: ContractRow) {
  const atRisk = row.next && !row.next.blocking ? 0 : (row.next?.installment.amount ?? 0)
  return [
    <span key="ma" className="text-accent-foreground font-mono text-[11.5px]">
      {row.contract.code}
    </span>,
    <span key="khach" className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[12.5px]">{row.contract.customer}</span>
      <span className="text-muted-foreground text-[10.5px]">
        {row.contract.ownerName} · ký {dm(row.contract.signedAt)}
      </span>
    </span>,
    <span key="gia-tri" className="tnum font-num text-right text-[13px] font-semibold">
      {dong(row.contract.amount)}
    </span>,
    <span key="da-thu" className="flex min-w-0 flex-col gap-1">
      <MoneySplit
        collected={row.collected}
        atRisk={atRisk}
        ahead={row.remaining - atRisk}
        className="h-1.5"
      />
      <span className="text-muted-foreground tnum font-mono text-[10.5px]">
        {millions(row.collected, 0)} · {Math.round((row.collected / row.contract.amount) * 100)}%
      </span>
    </span>,
    <NextCell key="ke-tiep" next={row.next} />,
    <BlockingCell key="chan" next={row.next} />,
  ]
}

export function ContractsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm hợp đồng, khách hàng, số hoá đơn…' })
  const navigate = useNavigate()
  const actor = useSession((s) => s.actor)
  const book = useMemo(() => contractBook(actor), [actor])

  const rows = book.rows.map((row) => ({
    id: row.contract.code,
    cells: rowCells(row),
    onOpen: () => navigate(`/sales/contracts/${row.contract.code}`),
  }))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker="Sales · Module 4"
          title="Hợp đồng"
          description="Hợp đồng đã ký · tiền còn phải thu · việc còn thiếu của cả hai bên."
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            size="compact"
            icon={FileCheck}
            label="Giá trị đang chạy"
            value={billions(book.totals.value)}
            source={`${book.rows.length} hợp đồng · ${dong(book.totals.value)}`}
          />
          <StatCard
            size="compact"
            label="Đã thu"
            value={millions(book.totals.collected, 0)}
            source={`${Math.round((book.totals.collected / (book.totals.value || 1)) * 100)}% sổ của bạn`}
          />
          <StatCard
            size="compact"
            label="Quá hạn thu"
            value={millions(book.totals.overdue, 0)}
            source={book.totals.overdue > 0 ? 'phải gọi hôm nay' : 'không có đồng nào trễ'}
            delta={
              book.totals.overdue > 0
                ? { direction: 'down', text: 'đang trễ', tone: 'danger' }
                : undefined
            }
          />
          <StatCard
            size="compact"
            label="Việc đang trễ"
            value={String(book.totals.lateOurs + book.totals.lateTheirs)}
            source={`${book.totals.lateTheirs} bên khách · ${book.totals.lateOurs} bên ta`}
          />
        </div>

        {/* Rule 8 — a long table always sits on `.glass-b`, and `DataTable` draws no glass of its own. */}
        <GlassCard variant="b" className="p-5">
          {rows.length === 0 ? (
            <EmptyState
              icon={FileCheck}
              message="Chưa có hợp đồng nào đứng tên bạn — một cơ hội chốt thắng sẽ sinh ra hợp đồng và nó xuất hiện ở đây."
              action={{ label: 'Mở sổ cơ hội', onClick: () => navigate('/sales/opportunities') }}
            />
          ) : (
            <DataTable columns={COLUMNS} rows={rows} />
          )}
        </GlassCard>

        {/* E2 returns a REASON rather than `false`, so the screen names the axis
            that stopped them: a wider role will not open this row, only a change
            of owner will. */}
        {book.hiddenByScope > 0 && (
          <div className="text-muted-foreground flex items-center gap-3 text-[11.5px]">
            <Icon icon={Lock} size={16} />
            <span>
              {book.hiddenByScope} hợp đồng của phòng không hiện ở đây —{' '}
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
