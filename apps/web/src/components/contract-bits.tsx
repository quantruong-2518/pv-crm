import { ArrowLeft, ArrowRight, Badge, Icon, cn } from '@pv/ui'
import { type ContractPenalty } from '@pv/contracts'
import type { DueLevel } from '@pv/engines'
import type { ConditionSide, ContractBookRow, InstallmentView } from '@/data/contracts'
import { standingOf } from '@/data/contracts'
import { useI18n } from '@/app/i18n'
import {
  CONTRACT_COPY as COPY,
  dueLevelText,
  installmentCaption,
  penaltyDirectionText,
  penaltyStatusText,
} from '@/data/contract-copy'
import { standingText } from '@/data/installment-copy'
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
  const { lang } = useI18n()
  const { tone } = standingOf(
    views.map((v) => ({
      overdue: v.level === 'overdue' || v.level === 'long-overdue',
      paid: Boolean(v.installment.paidAt),
    })),
  )
  return (
    <Badge tone={tone} className={className}>
      {standingText(tone, lang)}
    </Badge>
  )
}

/** The level badge. Colour alone never carries it — the word is always there,
 *  which is also what keeps the two overdue levels apart at a glance. Ink is
 *  `BADGE_INK` at every level: the tone inks fell under 4.5:1 on a selected
 *  light row (danger 4.05, warning 4.35); the tint still carries the colour. */
export function DueBadge({ level, className }: { level: DueLevel; className?: string }) {
  const { lang } = useI18n()
  return (
    <Badge tone={TONE[level]} className={cn(BADGE_INK, className)}>
      {dueLevelText(level, lang)}
    </Badge>
  )
}

/** In place of a standing or level badge once the contract was terminated
 *  (ADR 0107): muted, since nothing is owed any more. Same ink rescue as above. */
export function TerminatedBadge({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <Badge tone="draft" className={cn(BADGE_INK, className)}>
      {t(COPY.terminated)}
    </Badge>
  )
}

/** Which side owes the work. Told by an arrow plus a word, never by colour: the
 *  colours on these screens already mean "how late", and a second meaning laid
 *  over the same hue would make both unreadable. */
export function SideTag({ side, long = false }: { side: ConditionSide; long?: boolean }) {
  const { t } = useI18n()
  const ours = side === 'ours'
  return (
    <span className="text-muted-foreground bg-surface-ink/9 inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[12px]">
      <Icon icon={ours ? ArrowRight : ArrowLeft} size={14} />
      {ours ? t(long ? COPY.oursAction : COPY.ours) : t(long ? COPY.customerAction : COPY.customer)}
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
  penalty,
}: {
  next: InstallmentView | null
  ended: boolean
  currency: string | null
  /** A terminated contract's penalty, printed under its badge. */
  penalty?: ContractPenalty | null
}) {
  const { lang, t, number } = useI18n()
  if (ended) {
    return (
      <span className="flex min-w-0 flex-col items-end gap-1">
        <TerminatedBadge />
        {penalty && (
          <span className="text-muted-foreground tnum font-num max-w-full truncate text-[11.5px]">
            {penaltyDirectionText(penalty.direction, lang)} {number(penalty.amount)}
            {currency && currency !== 'VND' ? ` ${currency}` : ''} ·{' '}
            {penaltyStatusText(penalty.direction, Boolean(penalty.settledOn), lang)}
          </span>
        )}
      </span>
    )
  }
  if (!next) {
    return <span className="text-success block text-right text-[11.5px]">{t(COPY.collected)}</span>
  }
  /* The days lead: a truncated caption then loses the date, never the lateness. */
  const caption = installmentCaption(next.installment.no, next.installment.due, next.daysLeft, lang)
  return (
    <span className="flex min-w-0 flex-col items-end gap-1">
      <MoneyCell
        amount={next.installment.amount}
        currency={currency}
        missing={t(COPY.missingInstallmentAmount)}
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

/** Progress as words where words are shorter than numbers: nothing collected and
 *  fully collected need no percentage. Between the two, share then amount. */
export function CollectedCell({
  row,
  atRisk,
  ended,
}: {
  row: ContractBookRow
  atRisk: number
  ended: boolean
}) {
  const { t, number } = useI18n()
  const { contract, collected } = row
  const amount = contract.amount ?? 0
  const money = (
    <MoneyCell amount={collected} currency={contract.currency} muted={ended || collected === 0} />
  )
  if (ended || amount === 0) return money
  if (collected === 0) {
    return (
      <span
        className={cn(
          'block text-right text-[12.5px]',
          atRisk > 0 ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        {t(COPY.notCollected)}
      </span>
    )
  }
  if (collected >= amount) {
    return <span className="text-success block text-right text-[12.5px]">{t(COPY.collected)}</span>
  }
  return (
    <span className="flex min-w-0 flex-col items-end">
      {money}
      <span
        className={cn(
          'tnum font-num text-[11.5px]',
          atRisk > 0 ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        {number(Math.round((collected / amount) * 100))}% {t(COPY.percentOfValue)}
      </span>
    </span>
  )
}
