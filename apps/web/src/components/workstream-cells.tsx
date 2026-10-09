import { Badge, cn, type BadgeProps } from '@pv/ui'
import type { WorkstreamRow, WorkstreamStandKind } from '@pv/contracts'
import { dm, dmy } from '@/lib/date'
import { chainPath } from '@/data/opportunities'
import { footprintTotal } from '@/data/workstreams'
import { CloseBadge, ObjectChip, OverdueNote } from './workstream-bits'

/** The four cells of a workstream row, shared by the book
 *  (`pages/workstreams.tsx`) and the overview's short list (`pages/home.tsx`),
 *  so one run reads the same in both places. */

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

/** One line: the count with its noun, then the last contact. A run nobody has
 *  touched prints the "never contacted" note alone. */
export function ContactCell({ row }: { row: WorkstreamRow }) {
  const last = row.footprint.lastContactedAt
  const total = footprintTotal(row.footprint)
  if (total === 0 && last === null) {
    return <span className="text-muted-foreground truncate">Chưa liên lạc</span>
  }
  return (
    <span className="min-w-0 truncate">
      <span className="tnum font-num font-semibold">{total}</span> lượt liên hệ
      {last !== null && (
        <span className="text-muted-foreground tnum font-num" title="Lần liên lạc gần nhất">
          {' '}
          · {dm(last)}
        </span>
      )}
    </span>
  )
}

/** One place for "does this need me": overdue while open, the outcome once closed. */
export function StatusCell({ row }: { row: WorkstreamRow }) {
  if (row.closeReason === null || row.closedAt === null) {
    return <OverdueNote overdueBy={row.overdueBy} />
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CloseBadge reason={row.closeReason} />
      <span className="tnum font-num text-muted-foreground">{dmy(row.closedAt)}</span>
    </span>
  )
}
