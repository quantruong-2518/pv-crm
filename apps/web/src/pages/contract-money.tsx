import { useMemo } from 'react'
import {
  ChevronRight,
  GlassCard,
  Icon,
  SectionTitle,
  StatCard,
  StatusDot,
  billions,
  cn,
  vnd,
  millions,
} from '@pv/ui'
import { daysUntil, needsAttention } from '@pv/engines'
import { dm, dmy } from '@/lib/date'
import {
  daysPhrase,
  today,
  type Contract,
  type Installment,
  type InstallmentView,
} from '@/data/contracts'
import { ConditionBar, DueBadge, MoneySplit } from '@/components/contract-bits'
import { RecordCard } from '@/components/record/record-card'

/** The working content of the contract profile: the headline numbers and the
 *  shape of the money, then the installments as doors into level 2.
 *
 *  What this screen deliberately does NOT draw is a two-rail timeline of money
 *  against obligations. That drawing was built and thrown away: it encoded the
 *  same facts this list carries, but it made the reader decode a graph first.
 *  The obligations did not disappear — they live inside each installment as its
 *  unlock checklist, which is also how the contract itself words them. */

function moneyOf(contract: Contract, now: string) {
  const collected = contract.installments.filter((d) => d.paidAt).reduce((n, d) => n + d.amount, 0)
  const overdue = contract.installments
    .filter((d) => !d.paidAt && daysUntil(d.due, now) <= 0)
    .reduce((n, d) => n + d.amount, 0)
  /* `amount` is nullable on the wire — a contract can be signed before anyone
     has typed the number. Zero keeps the bar drawable; the tile above prints
     the null as it is. */
  return { collected, overdue, remaining: (contract.amount ?? 0) - collected }
}

/** Bars in installment order, not on a time axis.
 *
 *  A real time axis would squeeze the first three installments into two months
 *  and stretch the retention one across half the width — a shape that says
 *  something true about the calendar and nothing about the money. The caption
 *  under the chart says so, so nobody reads spacing as duration. */
export function InstallmentChart({ views }: { views: InstallmentView<Installment>[] }) {
  const tallest = Math.max(...views.map((v) => v.installment.amount))
  const fill: Record<string, string> = {
    done: 'bg-success',
    'due-soon': 'bg-warning',
    due: 'bg-warning',
    overdue: 'bg-destructive',
    'long-overdue': 'bg-destructive',
    upcoming: 'bg-surface-ink/14',
  }

  return (
    <RecordCard
      title="Hình của dòng tiền"
      hint="Cột xếp theo thứ tự đợt, không theo tỉ lệ thời gian — đợt cuối cách đợt trước nó nhiều tháng."
    >
      <div className="flex h-[180px] items-end gap-6">
        {views.map((v) => (
          <div key={v.installment.no} className="flex h-full flex-1 flex-col justify-end gap-2">
            <span className="tnum font-num text-center text-[12.5px] font-semibold">
              {millions(v.installment.amount, 0)}
            </span>
            <span
              className={cn('w-full rounded-t-md', fill[v.level])}
              style={{ height: `${Math.round((v.installment.amount / tallest) * 150)}px` }}
              title={`Đợt ${v.installment.no} · ${vnd(v.installment.amount)} · hạn ${dmy(v.installment.due)}`}
            />
          </div>
        ))}
      </div>

      <div className="bg-surface-ink/8 h-px" />

      <div className="flex gap-6">
        {views.map((v) => (
          <span key={v.installment.no} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[11.5px]">
              Đợt {v.installment.no} · {v.installment.share}%
            </span>
            <span className="text-muted-foreground tnum font-mono text-[10.5px]">
              {dm(v.installment.due)}
            </span>
          </span>
        ))}
      </div>
    </RecordCard>
  )
}

/** The headline numbers and the split of the money, above the installment list. */
export function MoneySummary({
  contract,
  now,
  next,
}: {
  contract: Contract
  now: string
  next: InstallmentView<Installment> | undefined
}) {
  const money = moneyOf(contract, now)
  return (
    <RecordCard>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          size="compact"
          label="Giá trị hợp đồng"
          value={contract.amount === null ? '—' : billions(contract.amount)}
          source={contract.amount === null ? 'chưa có số tiền' : vnd(contract.amount)}
        />
        <StatCard
          size="compact"
          label="Đã thu"
          value={millions(money.collected, 0)}
          source={
            contract.amount
              ? `${Math.round((money.collected / contract.amount) * 100)}% giá trị`
              : 'chưa có số tiền để so'
          }
        />
        <StatCard
          size="compact"
          label="Còn phải thu"
          value={millions(money.remaining, 0)}
          source={`${contract.installments.filter((d) => !d.paidAt).length} đợt còn lại`}
        />
        <StatCard
          size="compact"
          label="Quá hạn thu"
          value={money.overdue > 0 ? millions(money.overdue, 0) : '0 ₫'}
          source={money.overdue > 0 ? 'phải gọi hôm nay' : 'chưa đợt nào trễ hạn tiền'}
        />
      </div>

      <MoneySplit
        collected={money.collected}
        atRisk={next && needsAttention(next.level) ? next.installment.amount : 0}
        ahead={money.remaining - (next && needsAttention(next.level) ? next.installment.amount : 0)}
      />

      <div className="flex flex-wrap gap-6">
        <span className="text-muted-foreground flex items-center gap-2 text-[10.5px]">
          <StatusDot state="ok" /> Đã thu
        </span>
        <span className="text-muted-foreground flex items-center gap-2 text-[10.5px]">
          <StatusDot state="warning" /> Đang cần chú ý
        </span>
        <span className="text-muted-foreground flex items-center gap-2 text-[10.5px]">
          <StatusDot state="next" /> Chưa tới hạn
        </span>
      </div>
    </RecordCard>
  )
}

const ROW_GRID = 'grid-cols-[132px_180px_140px_minmax(0,1fr)_150px_24px]'

/** A long list, so `.glass-b` (law 8). Beside the rail the column is narrower
 *  than the six cells, so the list scrolls sideways rather than crushing them. */
export function InstallmentList({
  views,
  onOpen,
}: {
  views: InstallmentView<Installment>[]
  onOpen: (no: number) => void
}) {
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      <SectionTitle
        size="detail"
        hint="Mở một đợt để thấy điều kiện mở khoá, giấy tờ, bản ghi và ghi chú của riêng nó."
      >
        {views.length} đợt thanh toán
      </SectionTitle>

      <div className="overflow-x-auto">
        <div className="flex min-w-[880px] flex-col gap-1">
          <div
            className={cn(
              'text-muted-foreground grid items-center gap-4 px-4 pb-2 text-[11.5px] font-medium shadow-[inset_0_-1px_0_var(--sheen-b)]',
              ROW_GRID,
            )}
          >
            <span>Đợt</span>
            <span>Số tiền</span>
            <span>Hạn</span>
            <span>Điều kiện mở khoá</span>
            <span>Hồ sơ bên trong</span>
            <span />
          </div>
          {views.map((v) => (
            <InstallmentRow
              key={v.installment.no}
              view={v}
              onOpen={() => onOpen(v.installment.no)}
            />
          ))}
        </div>
      </div>
    </GlassCard>
  )
}

function InstallmentRow({
  view,
  onOpen,
}: {
  view: InstallmentView<Installment>
  onOpen: () => void
}) {
  const { installment: d } = view
  const lateIds = useMemo(
    () =>
      new Set(
        d.conditions.filter((c) => !c.doneAt && daysUntil(c.due, today()) <= 0).map((c) => c.id),
      ),
    [d.conditions],
  )

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'motion-std grid min-h-[76px] w-full items-center gap-4 rounded-md px-4 py-3 text-left',
        ROW_GRID,
        'hover:bg-surface-ink/6',
        /* No tint: a tinted ground took the badge under 4.5:1 in the light theme. The
           badge and the blocking line already say why the row wants a look. */
        (needsAttention(view.level) || view.blocking) && 'shadow-[inset_0_1px_0_var(--sheen-b)]',
      )}
    >
      <span className="flex flex-col items-start gap-1">
        <span className="text-[12.5px] font-semibold">
          Đợt {d.no} · {d.share}%
        </span>
        <DueBadge level={view.level} />
      </span>

      <span className="tnum font-num text-[14px] font-semibold">{vnd(d.amount)}</span>

      <span className="flex flex-col gap-1">
        <span className="tnum font-mono text-[11.5px]">{dmy(d.due)}</span>
        <span className="text-muted-foreground tnum font-mono text-[10.5px]">
          {d.paidAt ? `về ${dm(d.paidAt)}` : daysPhrase(view.daysLeft)}
        </span>
      </span>

      <span className="flex min-w-0 items-center gap-3">
        <ConditionBar installment={d} lateIds={lateIds} />
        <span className="min-w-0 truncate text-[11.5px]">
          {view.doneConditions}/{view.totalConditions}
          {view.blocking ? (
            <span className="text-on-tint-destructive">
              {' '}
              · còn {view.blocking.what.toLowerCase()}
            </span>
          ) : view.doneConditions === view.totalConditions ? (
            <span className="text-on-tint-success"> · xong cả hai bên</span>
          ) : (
            <span className="text-muted-foreground"> điều kiện</span>
          )}
        </span>
      </span>

      <span className="text-muted-foreground tnum font-mono text-[10.5px]">
        {d.docs.length} giấy tờ · {d.records.length} bản ghi
      </span>

      <span className="text-muted-foreground flex justify-end">
        <Icon icon={ChevronRight} size={16} />
      </span>
    </button>
  )
}
