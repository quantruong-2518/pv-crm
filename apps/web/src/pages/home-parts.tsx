import { useNavigate } from 'react-router-dom'
import type { LeaderboardRow } from '@pv/contracts'
import {
  Avatar,
  Badge,
  DataTable,
  EmptyState,
  GlassCard,
  Inbox,
  Kicker,
  SectionTitle,
  Skeleton,
  Users,
  type TableColumn,
} from '@pv/ui'
import { DUE_LONG_OVERDUE_DAYS } from '@pv/engines'
import { money, ratio, type WorkItem, type WorkKind } from '@/data/home'

/** The two tables of the home screen — the only blocks here that are rows
 *  rather than figures, which is why they sit outside the bento of
 *  `components/home-bento.tsx`: a six-column table in a bento cell is a
 *  horizontal scrollbar. Both sit on `.glass-b` (law 8). */

// ---------------------------------------------------------------------------
// THE DESK — one row per salesperson
// ---------------------------------------------------------------------------

const PEOPLE_COLUMNS: TableColumn[] = [
  { header: 'Nhân sự', width: '1.6fr' },
  { header: 'Lead đang giữ', width: '132px', align: 'right' },
  { header: 'Cơ hội mở', width: '116px', align: 'right' },
  { header: 'Giá trị pipeline', width: '156px', align: 'right' },
  { header: 'Đã ký', width: '148px', align: 'right' },
  { header: 'Tỷ lệ thắng', width: '124px', align: 'right' },
]

export function PeopleBoard({ rows }: { rows: LeaderboardRow[] | undefined }) {
  const navigate = useNavigate()
  const people = rows ?? []

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle
        kicker="Cả phòng · không theo phạm vi của bạn"
        hint="đếm cái đang giữ · mục tiêu và nhịp ở màn Hiệu suất"
        actions={<Kicker>{people.length} người</Kicker>}
      >
        Nhân sự kinh doanh
      </SectionTitle>

      <GlassCard variant="b" className="overflow-x-auto p-4">
        {people.length === 0 ? (
          <EmptyState
            icon={Users}
            message="Chưa ai đứng tên lead, cơ hội hay hợp đồng nào."
            action={{ label: 'Mở sổ lead', onClick: () => navigate('/sales/leads') }}
          />
        ) : (
          <DataTable
            className="min-w-[880px]"
            columns={PEOPLE_COLUMNS}
            rows={people.map((p) => ({
              id: p.actorId,
              cells: [
                <span key="who" className="flex items-center gap-3">
                  <Avatar name={p.name} />
                  <span className="text-foreground truncate text-[12.5px]">{p.name}</span>
                </span>,
                <span key="leads" className="tabular-nums">
                  {p.leadsOwned}
                </span>,
                <span key="ops" className="tabular-nums">
                  {p.opsOpen}
                </span>,
                <span key="pipe" className="tabular-nums">
                  {p.opsOpenAmountVnd === 0 ? '—' : money(p.opsOpenAmountVnd)}
                </span>,
                <span key="signed" className="tabular-nums">
                  {p.signedCount === 0 ? '—' : `${money(p.signedAmountVnd)} · ${p.signedCount}`}
                </span>,
                <span key="win" className="tabular-nums">
                  {ratio(p.won, p.won + p.lost)}
                </span>,
              ],
            }))}
          />
        )}
      </GlassCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// THE WORK QUEUE — the second tier, this person's own late rows
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<WorkKind, string> = {
  payment: 'Thu tiền',
  opportunity: 'Cơ hội',
}

/** A row's badge tone. Money that has not landed is `danger` whatever its age —
 *  a late installment is somebody else holding your cash. A stalled deal
 *  turns `danger` once it is as late as a long-overdue payment
 *  (`DUE_LONG_OVERDUE_DAYS`); shorter than that it stays `warning`. */
const toneOf = (item: WorkItem): 'danger' | 'warning' =>
  item.kind === 'payment' || item.daysLate >= DUE_LONG_OVERDUE_DAYS ? 'danger' : 'warning'

const WORK_COLUMNS: TableColumn[] = [
  { header: 'Loại', width: '108px' },
  { header: 'Việc', width: '1.6fr' },
  { header: 'Mã', width: '132px' },
  { header: 'Trễ', width: '112px', align: 'right' },
  { header: 'Tiền', width: '136px', align: 'right' },
]

/** The queue alone — its heading and the assistant above it are laid out by
 *  `home.tsx`, because the AI block has to sit between the two. */
export function WorkQueue({ items, isPending }: { items: WorkItem[]; isPending: boolean }) {
  const navigate = useNavigate()

  return (
    <GlassCard variant="b" className="overflow-x-auto p-4">
      {isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message="Không có việc nào quá hạn trên bàn của bạn."
          action={{ label: 'Mở sổ lead', onClick: () => navigate('/sales/leads') }}
        />
      ) : (
        <DataTable
          className="min-w-[820px]"
          columns={WORK_COLUMNS}
          rows={items.map((item) => ({
            id: item.id,
            onOpen: () => navigate(item.href),
            cells: [
              <Badge key="kind" tone={toneOf(item)}>
                {KIND_LABEL[item.kind]}
              </Badge>,
              <span key="title" className="text-foreground truncate text-[12.5px]">
                {item.title}
                <span className="text-muted-foreground block truncate text-[11px]">
                  {item.meta}
                </span>
              </span>,
              <span key="code" className="font-mono text-[11.5px]">
                {item.code}
              </span>,
              <span key="late" className="tabular-nums">
                trễ {item.daysLate} ngày
              </span>,
              <span key="amount" className="tabular-nums">
                {item.amountVnd === null ? '—' : money(item.amountVnd)}
              </span>,
            ],
          }))}
        />
      )}
    </GlassCard>
  )
}
