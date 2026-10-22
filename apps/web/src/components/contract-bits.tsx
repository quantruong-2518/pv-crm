import { ArrowLeft, ArrowRight, Badge, Icon, cn } from '@pv/ui'
import { OPPORTUNITY_STATE_LABEL } from '@pv/contracts'
import type { DueLevel } from '@pv/engines'
import type { ConditionSide, InstallmentView } from '@/data/contracts'
import { COLLECTED_LABEL, DUE_LABEL, daysPhrase, standingOf } from '@/data/contracts'
import { dmy } from '@/lib/date'
import { MoneyCell } from '@/components/money-cell'
import { BADGE_INK } from '@/data/opportunities'

/** The pieces every contract screen repeats. They live here rather than in
 *  `@pv/ui` because none of them is a general control — each one only means
 *  something next to an installment, and a library component that only fits one
 *  screen is a component that will be bent out of shape by the second. */

const TONE: Record<DueLevel, 'draft' | 'warning' | 'success' | 'danger'> = {
  done: 'success',
  upcoming: 'draft',
  'due-soon': 'warning',
  due: 'warning',
  overdue: 'danger',
  'long-overdue': 'danger',
}

/** The contract's standing badge: the shared rule (`standingOf`) over due levels. */
export function ContractStanding({
  views,
  className,
}: {
  views: InstallmentView[]
  className?: string
}) {
  const { tone, label } = standingOf(
    views.map((v) => ({
      overdue: v.level === 'overdue' || v.level === 'long-overdue',
      paid: Boolean(v.installment.paidAt),
    })),
  )
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  )
}

/** The level badge. Colour alone never carries it — the word is always there,
 *  which is also what keeps the two overdue levels apart at a glance. Ink is
 *  `BADGE_INK` at every level: the tone inks fell under 4.5:1 on a selected
 *  light row (danger 4.05, warning 4.35); the tint still carries the colour. */
export function DueBadge({ level, className }: { level: DueLevel; className?: string }) {
  return (
    <Badge tone={TONE[level]} className={cn(BADGE_INK, className)}>
      {DUE_LABEL[level]}
    </Badge>
  )
}

/** In place of a standing or level badge once the contract was terminated
 *  (ADR 0107): muted, since nothing is owed any more. Same ink rescue as above. */
export function TerminatedBadge({ className }: { className?: string }) {
  return (
    <Badge tone="draft" className={cn(BADGE_INK, className)}>
      {OPPORTUNITY_STATE_LABEL.terminated}
    </Badge>
  )
}

/** Which side owes the work. Told by an arrow plus a word, never by colour: the
 *  colours on these screens already mean "how late", and a second meaning laid
 *  over the same hue would make both unreadable. */
export function SideTag({ side, long = false }: { side: ConditionSide; long?: boolean }) {
  const ours = side === 'ours'
  return (
    <span className="text-muted-foreground bg-surface-ink/9 inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[12px]">
      <Icon icon={ours ? ArrowRight : ArrowLeft} size={14} />
      {ours ? 'Ta' : 'Khách'}
      {long && ' phải làm'}
    </span>
  )
}

/** Money split into what landed, what is at risk and what is still ahead.
 *  Segments carry a 2px gap so two neighbouring fills never read as one block. */
export function MoneySplit({
  collected,
  atRisk,
  ahead,
  className,
}: {
  collected: number
  atRisk: number
  ahead: number
  className?: string
}) {
  return (
    <span className={cn('flex h-2.5 gap-1 overflow-hidden rounded-sm', className)} aria-hidden>
      {collected > 0 && <span className="bg-success" style={{ flex: collected }} />}
      {atRisk > 0 && <span className="bg-warning" style={{ flex: atRisk }} />}
      {ahead > 0 && <span className="bg-surface-ink/12" style={{ flex: ahead }} />}
    </span>
  )
}

/** The book's last column: the next unpaid installment's amount, then which
 *  installment, its full date and the days left. Money is in the contract's
 *  own currency. A terminated contract shows its badge, a paid-up one the phrase. */
export function NextDueCell({
  next,
  ended,
  currency,
}: {
  next: InstallmentView | null
  ended: boolean
  currency: string | null
}) {
  if (ended) {
    return (
      <span className="flex justify-end">
        <TerminatedBadge />
      </span>
    )
  }
  if (!next) {
    return <span className="text-success block text-right text-[11.5px]">{COLLECTED_LABEL}</span>
  }
  /* The days lead: a truncated caption then loses the date, never the lateness. */
  const caption = `${daysPhrase(next.daysLeft)} · đợt ${next.installment.no} · ${dmy(next.installment.due)}`
  return (
    <span className="flex min-w-0 flex-col items-end gap-1">
      <MoneyCell
        amount={next.installment.amount}
        currency={currency}
        missing="Đợt chưa nhập số tiền"
      />
      <span
        className="text-muted-foreground tnum font-num max-w-full truncate text-[11.5px]"
        title={caption}
      >
        {caption}
      </span>
    </span>
  )
}
