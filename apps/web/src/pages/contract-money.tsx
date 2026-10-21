import { Badge, Chip, ClipboardList, GlassCard, Icon, cn } from '@pv/ui'
import { daysUntil, type DueLevel } from '@pv/engines'
import { dm, dmy } from '@/lib/date'
import {
  DUE_LABEL,
  daysPhrase,
  standingOf,
  today,
  type Contract,
  type Installment,
  type InstallmentCondition,
  type InstallmentView,
} from '@/data/contracts'
import { BADGE_INK } from '@/data/opportunities'
import { useContractKindLabel } from '@/data/sales-config'
import { TintBadge } from '@/components/deal-money/tint-badge'
import { NO_AMOUNT, compactMoney, kindLabel } from '@/components/deal-money/money'

/** The contract's money block, drawn like the deal's (`PaperDetail`): one well
 *  with the paper's heading, then the installments as tiles that open level 2.
 *  Same tile, same badge, same acceptance line — the two screens read as one.
 * */

const LABEL = 'text-muted-foreground text-[12px] font-medium'

const LEVEL_TONE: Record<DueLevel, 'success' | 'draft' | 'warning' | 'danger'> = {
  done: 'success',
  upcoming: 'draft',
  'due-soon': 'warning',
  due: 'warning',
  overdue: 'danger',
  'long-overdue': 'danger',
}

const late = (level: DueLevel) => level === 'overdue' || level === 'long-overdue'

/** The condition that holds the tile up, else the first open one, else the first. */
function acceptanceOf(view: InstallmentView<Installment>): InstallmentCondition | undefined {
  const { conditions } = view.installment
  return view.blocking ?? conditions.find((c) => !c.doneAt) ?? conditions[0]
}

export function ContractMoney({
  contract: c,
  views,
  onOpen,
}: {
  contract: Contract
  views: InstallmentView<Installment>[]
  onOpen: (no: number) => void
}) {
  const resolveKind = useContractKindLabel()
  const collected = c.installments.filter((d) => d.paidAt).reduce((n, d) => n + d.amount, 0)
  const standing = standingOf(
    views.map((v) => ({ overdue: late(v.level), paid: Boolean(v.installment.paidAt) })),
  )

  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col p-5 sm:p-6" aria-label="Hợp đồng">
      <div className="bg-surface-ink/5 flex min-w-0 flex-col gap-6 rounded-lg p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="font-display m-0 text-[20px] font-semibold">
            {kindLabel(c.kind, resolveKind)}
          </h2>
          <Chip>{c.code}</Chip>
          <Badge tone={standing.tone}>{standing.label}</Badge>
          <span className="text-muted-foreground tnum text-[12px]">Ký {dmy(c.signedAt)}</span>
          <span className="tnum font-num ml-auto text-[20px] font-semibold">
            {c.amount === null ? NO_AMOUNT : compactMoney(c.amount, c.currency)}
          </span>
        </div>

        <section className="flex min-w-0 flex-col gap-3" aria-label="Lịch thanh toán">
          <span className={LABEL}>
            Lịch thanh toán · đã thu {compactMoney(collected, c.currency)}
            {c.amount !== null && ` / ${compactMoney(c.amount, c.currency)}`}
          </span>
          {views.length === 0 ? (
            <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
              Chưa có lịch thanh toán
            </p>
          ) : (
            <div
              role="group"
              aria-label="Các đợt thanh toán"
              className="-m-1 grid snap-x auto-cols-[max(176px,calc((100%-24px)/3))] grid-flow-col gap-3 overflow-x-auto p-1"
            >
              {views.map((v) => (
                <InstallmentTile
                  key={v.installment.no}
                  view={v}
                  currency={c.currency}
                  onOpen={() => onOpen(v.installment.no)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </GlassCard>
  )
}

function InstallmentTile({
  view,
  currency,
  onOpen,
}: {
  view: InstallmentView<Installment>
  currency: Contract['currency']
  onOpen: () => void
}) {
  const { installment: d, level } = view
  const line = acceptanceOf(view)
  const lineLate = Boolean(line && !line.doneAt && daysUntil(line.due, today()) < 0)
  const overdue = late(level)

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'motion-std focus-visible:outline-ring shadow-control flex min-h-[148px] snap-start flex-col items-start gap-2 rounded-lg p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2',
        overdue
          ? 'bg-destructive/14 hover:bg-destructive/22 stone:hover:bg-destructive/14'
          : 'bg-surface-ink/9 hover:bg-surface-ink/14 stone:hover:bg-surface-ink/9',
      )}
    >
      <span className="flex w-full items-baseline gap-2">
        <span className="text-[13px] font-semibold">{d.label}</span>
        <span className="text-muted-foreground tnum ml-auto text-[12px]">{d.share}%</span>
      </span>
      <span className="tnum font-num text-[20px] font-semibold leading-[1.3]">
        {compactMoney(d.amount, currency)}
      </span>
      <span className="text-muted-foreground tnum text-[12px]">hạn {dm(d.due)}</span>
      <TintBadge tone={LEVEL_TONE[level]} className={cn(level === 'upcoming' && BADGE_INK)}>
        {d.paidAt
          ? `${DUE_LABEL.done} ${dmy(d.paidAt)}`
          : `${DUE_LABEL[level]} · ${daysPhrase(view.daysLeft)}`}
      </TintBadge>
      {line && (
        <span
          className={cn(
            'mt-auto flex items-center gap-2 text-[12px] leading-[1.5]',
            line.doneAt
              ? 'text-on-tint-success'
              : lineLate
                ? 'text-on-tint-destructive'
                : 'text-on-tint-warning',
          )}
        >
          <Icon icon={ClipboardList} size={14} className="shrink-0" />
          {line.what}
        </span>
      )}
    </button>
  )
}
