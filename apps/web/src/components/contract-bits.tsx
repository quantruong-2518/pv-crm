import { ArrowLeft, ArrowRight, Badge, Icon, cn } from '@pv/ui'
import type { DueLevel } from '@pv/engines'
import type { ConditionSide, Installment } from '@/data/contracts'
import { DUE_LABEL } from '@/data/contracts'

/** The three pieces every contract screen repeats. They live here rather than in
 *  `@pv/ui` because none of them is a general control — each one only means
 *  something next to an installment, and a library component that only fits one
 *  screen is a component that will be bent out of shape by the second. */

const TONE: Record<DueLevel, 'draft' | 'warning' | 'success' | 'danger'> = {
  'đã-xong': 'success',
  'chưa-tới': 'draft',
  'gần-hạn': 'warning',
  'đến-hạn': 'warning',
  'quá-hạn': 'danger',
  'quá-hạn-lâu': 'danger',
}

/** The level badge. Colour alone never carries it — the word is always there,
 *  which is also what keeps the two overdue levels apart at a glance. */
export function DueBadge({ level, className }: { level: DueLevel; className?: string }) {
  return (
    <Badge tone={TONE[level]} className={cn('uppercase tracking-[.06em]', className)}>
      {DUE_LABEL[level]}
    </Badge>
  )
}

/** Which side owes the work. Told by an arrow plus a word, never by colour: the
 *  colours on these screens already mean "how late", and a second meaning laid
 *  over the same hue would make both unreadable. */
export function SideTag({ side, long = false }: { side: ConditionSide; long?: boolean }) {
  const ours = side === 'ta'
  return (
    <span className="text-glass-foreground bg-white/9 inline-flex items-center gap-1 rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-[.08em]">
      <Icon icon={ours ? ArrowRight : ArrowLeft} size={14} />
      {ours ? 'Ta' : 'Khách'}
      {long && ' phải làm'}
    </span>
  )
}

/** One dash per unlock condition, in contract order — done, late, or still
 *  ahead. Deliberately not a percentage bar: four conditions are four discrete
 *  promises, and "75%" hides which one is missing. */
export function ConditionBar({
  installment,
  lateIds,
}: {
  installment: Installment
  lateIds: Set<string>
}) {
  return (
    <span className="flex gap-1" aria-hidden>
      {installment.conditions.map((c) => (
        <span
          key={c.id}
          className={cn(
            'h-[5px] w-6 rounded-sm',
            c.doneAt ? 'bg-success' : lateIds.has(c.id) ? 'bg-destructive' : 'bg-white/14',
          )}
        />
      ))}
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
      {ahead > 0 && <span className="bg-white/12" style={{ flex: ahead }} />}
    </span>
  )
}
