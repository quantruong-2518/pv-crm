import type { ReactNode } from 'react'
import { Badge, CalendarClock, Chip, Icon, cn } from '@pv/ui'
import type { WorkstreamCloseReason, WorkstreamStandKind } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { chainPath } from '@/data/opportunities'
import { BADGE_INK } from '@/data/opportunities'
import { closeReasonLabel } from '@/data/workstreams'

/** Cells shared by the workstream screens.
 *
 *  They stay in the app, not `@pv/ui`: each one knows how Sales reads a run
 *  (which rung has a deadline, what a close reason means). */

/* `BADGE_INK` on every pill: the tone inks fall under 4.5:1 on a hovered row
   in the fine-stone theme (law 13); the tint still carries the colour. CHURNED
   is neutral, not warning: warning already means "overdue" in this book. */
const CLOSE_BADGE: Record<WorkstreamCloseReason, 'success' | 'danger' | 'draft'> = {
  WON: 'success',
  LOST: 'danger',
  CHURNED: 'draft',
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
  const { t } = useI18n()
  if (overdueBy === null) {
    if (noDeadline) return <span className="text-muted-foreground">{noDeadline}</span>
    const note = t(
      message(
        'Bậc này chưa đặt hạn',
        'No deadline set for this stage',
        '이 단계에는 기한이 없습니다',
      ),
    )
    return (
      <span className="text-muted-foreground shrink-0" role="img" title={note} aria-label={note}>
        —
      </span>
    )
  }
  if (overdueBy <= 0) return null
  return (
    <Badge tone="warning" className={cn('shrink-0 gap-1', BADGE_INK)}>
      <Icon icon={CalendarClock} size={14} />
      {t(message('Trễ ', 'Late by ', '지연 '))}
      <span className="tnum font-num">{overdueBy}</span>
      {t(message(' ngày', ' days', '일'))}
    </Badge>
  )
}

export function CloseBadge({ reason }: { reason: WorkstreamCloseReason }) {
  const { lang } = useI18n()
  return (
    <Badge tone={CLOSE_BADGE[reason]} className={cn('shrink-0', BADGE_INK)}>
      {closeReasonLabel(reason, lang)}
    </Badge>
  )
}
