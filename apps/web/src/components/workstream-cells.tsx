import { Avatar, AvatarGroup, Badge, cn, type BadgeProps } from '@pv/ui'
import { vnDayOf, type WorkstreamRow, type WorkstreamStandKind } from '@pv/contracts'
import { dmy } from '@/lib/date'
import { chainPath } from '@/data/opportunities'
import { IN_CHARGE_SEAT_WORD, footprintTotal } from '@/data/workstreams'
import { DueBadge } from './contract-bits'
import { CloseBadge, ObjectChip, OverdueNote } from './workstream-bits'

/** The cells of a workstream row in the book (`pages/workstreams.tsx`). The
 *  customer and stand cells are the originals; the other four answer what the
 *  book is read for: what is next, who holds it, when we last spoke. */

type Go = (path: string) => void

/* Every code is `XX-0000` in mono, so one fixed slot holds any chip: the text
   beside it then starts at the same x on every row. */
const CODE_SLOT = 'flex w-18 shrink-0'

/* The name opens the company, so no `AC-` chip is needed to reach it. The
   stops keep the click from also opening the row. */
export function CustomerCell({ row, go }: { row: WorkstreamRow; go: Go }) {
  const path = row.accountCode === null ? undefined : chainPath('AC', row.accountCode)
  if (path === undefined) {
    return (
      <span className="min-w-0 truncate font-semibold" title={row.customer}>
        {row.customer}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="min-w-0 truncate text-left font-semibold hover:underline"
      title={row.customer}
      onClick={(event) => {
        event.stopPropagation()
        go(path)
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {row.customer}
    </button>
  )
}

/* One hue per object kind, the pill shapes the opportunity book's stage cell
   already uses (law 16). The chip beside it stays a muted code. */
const STAND_TONE: Record<WorkstreamStandKind, { tone: BadgeProps['tone']; className?: string }> = {
  LD: { tone: 'draft', className: 'text-foreground' },
  OP: { tone: 'running' },
  HĐ: { tone: 'success' },
}

export function StandCell({ row, go }: { row: WorkstreamRow; go: Go }) {
  const { kind, code, phaseLabel } = row.stand
  const { tone, className } = STAND_TONE[kind]
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={CODE_SLOT}>
        <ObjectChip kind={kind} code={code} go={go} />
      </span>
      <Badge tone={tone} className={cn('min-w-0 max-w-full', className)} title={phaseLabel}>
        <span className="truncate">{phaseLabel}</span>
      </Badge>
    </span>
  )
}

/** The run's code and its customer-side contact under the name, muted. */
export function CustomerLines({ row, go }: { row: WorkstreamRow; go: Go }) {
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <CustomerCell row={row} go={go} />
      <span className="text-muted-foreground max-w-full truncate text-[11.5px]">
        <span className="font-mono">{row.code}</span> · {row.contact}
      </span>
    </span>
  )
}

/** Open: the next step with its due pill. Closed: the outcome and its day.
 *
 *  `nextStep` is `undefined` on an API one deploy behind, and that must not
 *  read as "no next step": it falls back to the overdue badge alone. */
export function NextStepCell({ row }: { row: WorkstreamRow }) {
  if (row.closeReason !== null && row.closedAt !== null) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <CloseBadge reason={row.closeReason} />
        <span className="tnum font-num text-muted-foreground">{dmy(row.closedAt)}</span>
      </span>
    )
  }
  const step = row.nextStep
  const late = row.overdueBy !== null && row.overdueBy > 0
  if (step) {
    return (
      <span
        className="flex min-w-0 items-center gap-2"
        title={`${step.text} · hạn ${dmy(step.due)}`}
      >
        <span className="min-w-0 flex-1 truncate">{step.text}</span>
        {/* The run's own lateness wins: the toggle counts it, so the row must show it. */}
        {late ? (
          <OverdueNote overdueBy={row.overdueBy} />
        ) : (
          <DueBadge level={step.dueLevel} className="shrink-0" />
        )}
      </span>
    )
  }
  if (step === undefined || late) {
    return <OverdueNote overdueBy={row.overdueBy} />
  }
  return <span className="text-muted-foreground truncate">Chưa có việc tiếp theo</span>
}

/** The people who answer for the object the run stands on. `inCharge` absent
 *  is an API one deploy behind and prints a dash; `null` or nobody is a run
 *  no one has taken yet. */
export function InChargeCell({ row }: { row: WorkstreamRow }) {
  const { inCharge } = row
  if (inCharge === undefined) return <span className="text-muted-foreground">—</span>
  const people = inCharge?.people ?? []
  const [only] = people
  if (inCharge === null || only === undefined) {
    return <span className="text-muted-foreground truncate">Chưa ai nhận</span>
  }
  if (people.length === 1) {
    return (
      <span className="flex min-w-0 items-center gap-2" title={only.name}>
        <Avatar name={only.name} size="sm" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{only.name}</span>
          <span className="text-muted-foreground text-[11.5px]">
            {IN_CHARGE_SEAT_WORD[inCharge.seat]}
          </span>
        </span>
      </span>
    )
  }
  const names = people.map((p) => p.name)
  return (
    <span className="flex min-w-0 items-center gap-2" title={names.join(' · ')}>
      <AvatarGroup names={names} max={3} />
      <span className="text-muted-foreground truncate text-[12px]">
        {people.length} {inCharge.seat === 'contract' ? 'người chốt' : 'người'}
      </span>
    </span>
  )
}

const DAY_MS = 86_400_000

/** Whole Vietnam calendar days, not 24-hour spans: a call at 23:50 is
 *  "yesterday" at 00:10. A clock a little behind the server never reads as
 *  the future. */
function daysSince(moment: string, today: string): number {
  const then = Date.parse(`${vnDayOf(new Date(moment))}T00:00:00Z`)
  return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - then) / DAY_MS))
}

const agoWord = (n: number) => (n === 0 ? 'Hôm nay' : n === 1 ? 'Hôm qua' : `${n} ngày trước`)

/** When the last contact was, and how many there have been. `today` is read
 *  once by the screen, so a redraw never changes a label mid-view. */
export function LastContactCell({ row, today }: { row: WorkstreamRow; today: string }) {
  const last = row.footprint.lastContactedAt
  if (last === null) return <span className="text-muted-foreground truncate">Chưa liên hệ</span>
  return (
    <span className="flex min-w-0 flex-col" title={`Lần liên hệ gần nhất: ${dmy(last)}`}>
      <span className="truncate">{agoWord(daysSince(last, today))}</span>
      <span className="text-muted-foreground tnum font-num text-[11.5px]">
        {footprintTotal(row.footprint)} lần
      </span>
    </span>
  )
}
