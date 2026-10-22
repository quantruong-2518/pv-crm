import { Badge, Check, GlassCard, Icon, Stepper, cn } from '@pv/ui'
import type { KpiAllocation, KpiAllocationLine } from '@pv/contracts'
import type { ApiError } from '@/app/api'
import { num } from './home-model'
import { NOTE } from './home-tiles'
import { ACK_LABEL, PACKAGE_LABEL, ackCounts, actedAt, failText } from './kpi-allocate-model'

/** Small blocks the KPI screens share: a package's status pill, its lines'
 *  answers, its four-step bar, and a refused write said in place. */

export function PackageBadge({ pkg }: { pkg: KpiAllocation | undefined }) {
  if (!pkg) return <Badge tone="draft">Chưa phân bổ</Badge>
  const label = PACKAGE_LABEL[pkg.status]
  return <Badge tone={label.tone}>{label.text}</Badge>
}

/** One badge per answer; counts only when the lines differ. */
export function AckCounts({ lines }: { lines: readonly Pick<KpiAllocationLine, 'ackState'>[] }) {
  const counts = ackCounts(lines)
  return (
    <span className="flex flex-wrap gap-2">
      {counts.map(({ state, count }) => (
        <Badge key={state} tone={ACK_LABEL[state].tone}>
          {counts.length === 1 ? ACK_LABEL[state].text : `${ACK_LABEL[state].text} · ${num(count)}`}
        </Badge>
      ))}
    </span>
  )
}

export function FailLine({
  error,
  conflict,
}: {
  error: ApiError | null
  /** Added after a 409's own sentence, where a 409 means the figures moved. */
  conflict?: string
}) {
  if (!error) return null
  const after = conflict && error.kind === 'conflict' ? ` ${conflict}` : ''
  return (
    <p role="alert" className="text-destructive-foreground text-[12px] leading-5">
      {failText(error)}
      {after}
    </p>
  )
}

const STEPS = [
  { key: 'total', label: 'Chỉ tiêu vai trò' },
  { key: 'split', label: 'Phân bổ' },
  { key: 'ack', label: 'Người nhận xác nhận' },
  { key: 'lock', label: 'Duyệt và khoá' },
]

/** Where a role stands: no agreed role target, being split, handed down and
 *  waiting on its holders, or every holder answered and only approval is left. */
function stepOf(pkg: KpiAllocation | undefined, hasTotal: boolean): number {
  if (!pkg) return hasTotal ? 1 : 0
  if (pkg.status === 'draft' || pkg.status === 'returned') return 1
  return pkg.lines.every((l) => l.ackState === 'acknowledged' || l.ackState === 'lapsed') ? 3 : 2
}

/** Who moved the package last and when. */
function stampOf(pkg: KpiAllocation | undefined): string | null {
  if (!pkg) return null
  if (pkg.decidedAt) {
    return actedAt(pkg.decidedBy, pkg.status === 'returned' ? 'trả lại' : 'duyệt', pkg.decidedAt)
  }
  if (!pkg.submittedAt) return null
  const verb = pkg.status === 'draft' ? 'đặt số sau cùng' : 'gửi'
  return actedAt(pkg.submittedBy, verb, pkg.submittedAt)
}

/** An agreed package has passed every step, which `Stepper` cannot draw (one
 *  step is always open), so the four are read out as done instead. */
function AllDone() {
  return (
    <ol aria-label="Các bước" className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {STEPS.map((step) => (
        <li key={step.key} className="inline-flex items-center gap-2 text-[12px] font-medium">
          <Icon icon={Check} size={14} className="text-success shrink-0" />
          {step.label}
        </li>
      ))}
    </ol>
  )
}

export function PackageSteps({
  pkg,
  hasTotal,
}: {
  pkg: KpiAllocation | undefined
  /** The role has at least one agreed role target this month. */
  hasTotal: boolean
}) {
  const stamp = stampOf(pkg)
  const done = pkg?.status === 'agreed' || pkg?.status === 'superseded'
  /* On `.glass-b`, not the bare page: the badge text only clears 4.5:1 on that surface (law 13). */
  return (
    <GlassCard variant="b" className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        {done ? <AllDone /> : <Stepper steps={STEPS} current={stepOf(pkg, hasTotal)} />}
        <PackageBadge pkg={pkg} />
      </div>
      {stamp && <p className={cn(NOTE, 'tnum font-num')}>{stamp}</p>}
    </GlassCard>
  )
}
