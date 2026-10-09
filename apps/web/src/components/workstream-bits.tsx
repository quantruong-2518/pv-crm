import type { ReactNode } from 'react'
import { Badge, Chip, cn } from '@pv/ui'
import type { WorkstreamCloseReason, WorkstreamStandKind } from '@pv/contracts'
import { chainPath } from '@/data/opportunities'
import { CLOSE_REASON_LABEL } from '@/data/workstreams'

/** Cells shared by the workstream screens.
 *
 *  They stay in the app, not `@pv/ui`: each one knows how Sales reads a run
 *  (which rung has a deadline, what a close reason means). */

/* The class override lifts the badge text to 4.5:1 on a hovered row, where
   the default success/danger text falls short (law 13). CHURNED is neutral,
   not warning: warning already means "overdue" in the same book. */
const CLOSE_BADGE: Record<
  WorkstreamCloseReason,
  { tone: 'success' | 'danger' | 'draft'; className?: string }
> = {
  WON: { tone: 'success', className: 'text-on-tint-success-strong' },
  LOST: { tone: 'danger', className: 'text-on-tint-destructive' },
  CHURNED: { tone: 'draft', className: 'text-foreground' },
}

/** A chip inside a clickable row: without stopping the event the row would
 *  open the workstream right after the chip opened its own object. */
export function ObjectChip({
  kind,
  code,
  go,
}: {
  /** `WS` is the run itself — the one object a stand never is, and the one a
   *  lead profile links out to. */
  kind: WorkstreamStandKind | 'AC' | 'WS'
  code: string
  go: (path: string) => void
}) {
  const path = chainPath(kind, code)
  if (!path) return <Chip className="shrink-0">{code}</Chip>
  return (
    <span
      className="inline-flex shrink-0"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Chip onOpen={() => go(path)}>{code}</Chip>
    </span>
  )
}

/** Null means nobody set a deadline for this rung — never "on time", so it
 *  must not print as 0. Early or on time prints nothing at all. A table has
 *  room for "—" only; pass `noDeadline` where there is room to say it. */
export function OverdueNote({
  overdueBy,
  noDeadline,
}: {
  overdueBy: number | null
  noDeadline?: string
}): ReactNode {
  if (overdueBy === null) {
    if (noDeadline) return <span className="text-muted-foreground">{noDeadline}</span>
    const note = 'Bậc này chưa đặt hạn'
    return (
      <span className="text-muted-foreground shrink-0" role="img" title={note} aria-label={note}>
        —
      </span>
    )
  }
  if (overdueBy <= 0) return null
  return (
    <Badge tone="warning" className="shrink-0 gap-1">
      Trễ <span className="tnum font-num">{overdueBy}</span> ngày
    </Badge>
  )
}

export function CloseBadge({ reason }: { reason: WorkstreamCloseReason }) {
  const { tone, className } = CLOSE_BADGE[reason]
  return (
    <Badge tone={tone} className={cn('shrink-0', className)}>
      {CLOSE_REASON_LABEL[reason]}
    </Badge>
  )
}
