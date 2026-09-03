import { useNavigate } from 'react-router-dom'
import { Coins, Handshake, Inbox, Target, Users, Wallet } from '@pv/ui'
import type {
  ContractSummary,
  LeadScorecard,
  OpportunityHistogram,
  OpportunityScorecard,
  LeaderboardRow,
} from '@pv/contracts'
import {
  Avatar,
  Badge,
  BarChart,
  BriefCard,
  DataTable,
  EmptyState,
  GlassCard,
  Kicker,
  ScreenScoreGrid,
  SectionTitle,
  Skeleton,
  StatCard,
  billions,
  millions,
  percent,
  type BarDatum,
  type TableColumn,
} from '@pv/ui'
import type { WorkItem, WorkKind } from '@/data/home'

/** The blocks of the home screen. Split out of `home.tsx` for the same reason
 *  `lead-parts.tsx` is split out of `leads.tsx`: the screen file should read as
 *  the shape of the page, not as six hundred lines of table cells. */

/** One money format for the whole screen.
 *
 *  A dashboard printing billions beside millions makes the eye do a unit
 *  conversion to compare two bars that sit next to each other. Billions above a
 *  billion, millions below, one rule, applied everywhere on this screen. */
const money = (dong: number) => (dong >= 1_000_000_000 ? billions(dong, 1) : millions(dong, 0))

/** Ratio, or an em dash when the denominator is 0 — never "0%", which claims a
 *  measurement was taken and came out zero. */
const ratio = (top: number, bottom: number) => (bottom === 0 ? '—' : percent(top / bottom))

// ---------------------------------------------------------------------------
// THE HERO — where the desk's money is standing
// ---------------------------------------------------------------------------

/** Four amounts along one line: what is still being chased, what got signed,
 *  what has landed, and what should have landed and has not.
 *
 *  NOT a funnel and the label must never call it one — the four bars are not
 *  four stages of one cohort. Open pipeline is a forecast, signed is the whole
 *  book, collected is cash. They share a unit and a screen, not a denominator,
 *  which is exactly why they are worth seeing together. */
export function MoneyLine({
  scorecard,
  contracts,
}: {
  scorecard: OpportunityScorecard | undefined
  contracts: ContractSummary | undefined
}) {
  const open = scorecard?.openAmountVnd ?? 0
  const signed = contracts?.signedAmountVnd ?? 0
  const collected = contracts?.collectedVnd ?? 0
  const overdue = contracts?.overdueVnd ?? 0

  const data: BarDatum[] = [
    {
      key: 'dang-mo',
      label: 'Đang mở',
      value: open,
      display: money(open),
      note: `${scorecard?.open ?? 0} cơ hội chưa đóng`,
      tone: 'primary',
    },
    {
      key: 'da-ky',
      label: 'Đã ký',
      value: signed,
      display: money(signed),
      note: `${contracts?.signedCount ?? 0} hợp đồng trong sổ`,
      tone: 'success',
    },
    {
      key: 'da-thu',
      label: 'Đã thu',
      value: collected,
      display: money(collected),
      note: `${ratio(collected, contracts?.scheduledVnd ?? 0)} của lịch thu`,
      tone: 'success',
    },
    {
      key: 'qua-han',
      label: 'Quá hạn thu',
      value: overdue,
      display: money(overdue),
      note: overdue === 0 ? 'không đồng nào trễ' : `${contracts?.overdueCount ?? 0} đợt đang trễ`,
      tone: overdue === 0 ? 'muted' : 'danger',
    },
  ]

  return (
    <GlassCard className="col-span-2 flex flex-col gap-4 p-5 lg:row-span-2">
      <SectionTitle kicker="Đường tiền" size="detail" hint="bốn câu hỏi khác nhau, cùng một đơn vị">
        Tiền đang ở đâu
      </SectionTitle>
      <BarChart
        data={data}
        orientation="bar"
        source="Sổ cơ hội · sổ hợp đồng · cả sổ, không theo phạm vi của bạn"
      />
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------
// THE FOUR TILES
// ---------------------------------------------------------------------------

/** Sparkline geometry, from `Sparkline`'s own viewBox. Eight points because the
 *  component steps x by 12 across a fixed 86px box; a ninth would fall off. */
const SPARK_HEIGHT = 26
const SPARK_POINTS = 8

/** Amounts → the y coordinates `Sparkline` wants, which are INVERTED (0 is the
 *  top of the box). Scaled to the window's own maximum, so the line shows the
 *  shape of these twelve months rather than their size against some absolute. */
function spark(values: number[]): number[] {
  const tail = values.slice(-SPARK_POINTS)
  const top = Math.max(...tail, 0)
  if (top === 0) return tail.map(() => SPARK_HEIGHT)
  return tail.map((v) => SPARK_HEIGHT - (v / top) * SPARK_HEIGHT)
}

export function DeskTiles({
  scorecard,
  contracts,
}: {
  scorecard: OpportunityScorecard | undefined
  contracts: ContractSummary | undefined
}) {
  const open = scorecard?.openAmountVnd ?? 0
  const openBlank = scorecard?.openBlank ?? 0
  const won = scorecard?.won ?? 0
  const lost = scorecard?.lost ?? 0
  const decided = won + lost

  const months = contracts?.byMonth ?? []
  const signed = contracts?.signedAmountVnd ?? 0
  const collected = contracts?.collectedVnd ?? 0
  const overdue = contracts?.overdueVnd ?? 0
  const dueSoon = contracts?.dueSoonVnd ?? 0

  return (
    <>
      <StatCard
        icon={Wallet}
        value={money(open)}
        label="Pipeline đang mở"
        hint={
          openBlank === 0
            ? `${scorecard?.open ?? 0} đơn còn trên bàn`
            : `${scorecard?.open ?? 0} đơn · ${openBlank} đơn chưa có tiền, không cộng vào`
        }
        source="Sổ cơ hội"
      />
      <StatCard
        icon={Handshake}
        value={money(signed)}
        label="Đã ký"
        /* The only real time series the server can produce today. Everything
           else on this screen is a snapshot, and a snapshot must not be given a
           sparkline just because the tile looks bare without one. */
        sparkline={
          months.length === 0
            ? undefined
            : {
                points: spark(months.map((m) => m.signedAmountVnd)),
                source: `${months.length} tháng · sổ hợp đồng`,
                tone: 'success',
              }
        }
      />
      <StatCard
        icon={Coins}
        value={money(collected)}
        label="Đã thu"
        hint={`${ratio(collected, contracts?.scheduledVnd ?? 0)} của lịch thu`}
        delta={
          overdue === 0
            ? undefined
            : {
                direction: 'down',
                text: `${money(overdue)} quá hạn`,
                tone: 'danger',
              }
        }
        source={dueSoon === 0 ? 'Sổ hợp đồng' : `Sắp tới hạn ${money(dueSoon)}`}
      />
      <StatCard
        icon={Target}
        value={ratio(won, decided)}
        label="Tỷ lệ thắng"
        hint={decided === 0 ? 'chưa đơn nào đóng sổ' : `${won} thắng · ${lost} thua`}
        source="Sổ cơ hội · cả sổ"
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// THE BOARD AND THE FUNNEL
// ---------------------------------------------------------------------------

/** Open pipeline split across the columns it is standing in. */
export function PipelineBoard({ histogram }: { histogram: OpportunityHistogram | undefined }) {
  const buckets = histogram?.buckets ?? []

  const data: BarDatum[] = buckets.map((b) => ({
    key: b.stage,
    label: b.label,
    value: b.amountVnd,
    display: money(b.amountVnd),
    note:
      b.rotting === 0
        ? `${b.count} đơn`
        : `${b.count} đơn · ${b.rotting} quá hạn cột (${money(b.rottingAmountVnd)})`,
    tone: b.rotting === 0 ? 'primary' : 'warning',
  }))

  return (
    <GlassCard className="flex flex-col gap-4 p-5">
      <SectionTitle
        kicker="Sổ cơ hội"
        size="detail"
        hint="hạn mỗi cột lấy từ Thiết lập, không phải một con số của màn này"
      >
        Pipeline theo chặng
      </SectionTitle>
      {data.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message="Không có đơn nào đang mở."
          action={{ label: 'Mở sổ cơ hội' }}
        />
      ) : (
        <BarChart data={data} orientation="column" source="Đơn đang mở · cả sổ" />
      )}
    </GlassCard>
  )
}

/** Lead, first meeting, deal, contract — the four counts the lead scorecard
 *  already returns.
 *
 *  Deliberately NOT the funnel on the Performance screen: that one measures
 *  tier conversion over a chosen period. This one
 *  counts the whole book against the events that actually happened. Two
 *  questions, and the hint says which is which so nobody reads them as a
 *  contradiction. */
export function Funnel({ funnel }: { funnel: LeadScorecard | undefined }) {
  const leads = funnel?.leads ?? 0
  const steps: { key: string; label: string; value: number }[] = [
    { key: 'lead', label: 'Lead vào sổ', value: leads },
    { key: 'gap', label: 'Đã gặp mặt', value: funnel?.firstMeetings ?? 0 },
    { key: 'co-hoi', label: 'Thành cơ hội', value: funnel?.opportunities ?? 0 },
    { key: 'hop-dong', label: 'Thành hợp đồng', value: funnel?.contracts ?? 0 },
  ]

  const data: BarDatum[] = steps.map((s, i) => {
    const prev = steps[i - 1]?.value ?? 0
    return {
      key: s.key,
      label: s.label,
      value: s.value,
      display: String(s.value),
      note: i === 0 ? 'toàn bộ sổ' : `${ratio(s.value, prev)} của bậc trên`,
      tone: 'primary',
    }
  })

  return (
    <GlassCard className="flex flex-col gap-4 p-5">
      <SectionTitle
        kicker="Sổ lead"
        size="detail"
        hint="đếm theo sự kiện đã xảy ra · chuyển bậc nằm ở màn Hiệu suất"
      >
        Phễu cả sổ
      </SectionTitle>
      <BarChart data={data} orientation="bar" max={leads} source="Thẻ điểm lead · cả sổ" />
    </GlassCard>
  )
}

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
  const people = rows ?? []

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle
        kicker="Cả phòng · không theo phạm vi của bạn"
        hint="đếm cái đang giữ, không chấm theo mục tiêu — mục tiêu và nhịp nằm ở màn Hiệu suất"
        actions={<Kicker>{people.length} người</Kicker>}
      >
        Nhân sự kinh doanh
      </SectionTitle>

      <GlassCard variant="b" className="overflow-x-auto p-4">
        {people.length === 0 ? (
          <EmptyState
            icon={Users}
            message="Chưa ai đứng tên lead, cơ hội hay hợp đồng nào."
            action={{ label: 'Mở sổ lead' }}
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
  'thu-tien': 'Thu tiền',
  'co-hoi': 'Cơ hội',
  lead: 'Lead',
}

/** A row's badge tone. Money that has not landed is `danger` whatever its age —
 *  a late installment is somebody else holding your cash. A stalled deal or
 *  lead is `warning` until it doubles its limit. */
const toneOf = (item: WorkItem): 'danger' | 'warning' =>
  item.kind === 'thu-tien' || item.daysLate >= 15 ? 'danger' : 'warning'

const WORK_COLUMNS: TableColumn[] = [
  { header: 'Loại', width: '108px' },
  { header: 'Việc', width: '1.6fr' },
  { header: 'Mã', width: '132px' },
  { header: 'Trễ', width: '112px', align: 'right' },
  { header: 'Tiền', width: '136px', align: 'right' },
]

export function WorkQueue({
  items,
  isPending,
  name,
}: {
  items: WorkItem[]
  isPending: boolean
  name: string
}) {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle
        kicker="Chỉ của bạn · đã cắt theo người đang đăng nhập"
        hint="hợp đồng, cơ hội và lead đứng chung một hàng, xếp theo mức trễ"
        actions={items.length === 0 ? undefined : <Kicker>{items.length} việc</Kicker>}
      >
        Việc của {name}
      </SectionTitle>

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
    </div>
  )
}

// ---------------------------------------------------------------------------
// THE TWO ALERT CARDS — computed, never written by hand
// ---------------------------------------------------------------------------

/** The two things most likely to cost money this week.
 *
 *  Both sentences are assembled from figures the server sent. The old screen
 *  hand-wrote its two alert cards as prose, which meant the count in the
 *  headline and the state of the desk had no way of staying equal. */
export function Alerts({
  histogram,
  contracts,
}: {
  histogram: OpportunityHistogram | undefined
  contracts: ContractSummary | undefined
}) {
  const buckets = histogram?.buckets ?? []
  const rotting = buckets.reduce((n, b) => n + b.rotting, 0)
  const rottingAmount = buckets.reduce((n, b) => n + b.rottingAmountVnd, 0)
  const worst = [...buckets].sort((a, b) => b.rotting - a.rotting)[0]

  const overdueCount = contracts?.overdueCount ?? 0
  const overdue = contracts?.overdueVnd ?? 0
  const dueSoonCount = contracts?.dueSoonCount ?? 0

  return (
    <>
      <BriefCard
        className="col-span-2"
        state={rotting === 0 ? 'ok' : 'warning'}
        title={rotting === 0 ? 'Không đơn nào quá hạn cột' : `${rotting} đơn quá hạn cột`}
        badge={{ label: 'Cơ hội', tone: rotting === 0 ? 'success' : 'warning' }}
        description={
          rotting === 0
            ? 'Mọi đơn đang mở còn nằm trong hạn của cột nó đứng.'
            : `${money(rottingAmount)} đang treo quá hạn${worst === undefined ? '' : `, đọng nhiều nhất ở cột ${worst.label}`}. Hạn mỗi cột lấy từ Thiết lập.`
        }
        /* No objects: a stage key is not an object code, and `RailObject`
           renders it in the same mono chip ContextRail uses for real lead, deal
           and contract codes. The histogram carries no deal codes to put here,
           and the sentence above already names the column. */
        objects={[]}
      />
      <BriefCard
        className="col-span-2"
        state={overdueCount === 0 ? 'ok' : 'bad'}
        title={
          overdueCount === 0 ? 'Không đợt thu nào trễ' : `${overdueCount} đợt thanh toán quá hạn`
        }
        badge={{ label: 'Hợp đồng', tone: overdueCount === 0 ? 'success' : 'danger' }}
        description={
          overdueCount === 0
            ? dueSoonCount === 0
              ? 'Không có đợt nào tới hạn trong hai tuần tới.'
              : `${dueSoonCount} đợt tới hạn trong hai tuần tới, chưa đợt nào trễ.`
            : `${money(overdue)} đã tới hạn mà chưa về${dueSoonCount === 0 ? '' : `, thêm ${dueSoonCount} đợt tới hạn trong hai tuần`}.`
        }
        objects={[]}
      />
    </>
  )
}

/** The tiles while the desk is still loading. Four boxes the same height as the
 *  four that replace them, so the page does not jump when the numbers land. */
export function DeskSkeleton() {
  return (
    <ScreenScoreGrid>
      <Skeleton className="h-[150px] w-full" />
      <Skeleton className="h-[150px] w-full" />
      <Skeleton className="h-[150px] w-full" />
      <Skeleton className="h-[150px] w-full" />
    </ScreenScoreGrid>
  )
}
