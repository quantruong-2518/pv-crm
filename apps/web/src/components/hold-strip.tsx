import type { ReactNode } from 'react'
import { CalendarClock, GlassCard, Icon, MetaPill, cn } from '@pv/ui'
import type { Hold } from '@pv/contracts'
import { dm, dmy } from '@/lib/date'
import { DueBadge } from '@/components/contract-bits'

/** The open hold over a profile, above everything like the switched-off
 *  notice: the date, its due pill, the note, and the ways out the caller
 *  passes in (a lead has three, a deal two — ADR 0097 §3).
 *
 *  On a card face, not a tint: the strip sits on the page ground under the
 *  glow, where the due pills measured 3.80:1 (warning) and 3.53:1 (danger)
 *  in the light theme (law 13). On `--card` they clear 4.5 in both themes, and the
 *  opaque card keeps the glow out of the sum. */
export function HoldStrip({ hold, actions }: { hold: Hold; actions?: ReactNode }) {
  return (
    <GlassCard
      variant="a"
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md p-4"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon icon={CalendarClock} size={20} className="text-muted-foreground shrink-0" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
            <span className="tnum">Tạm hoãn đến {dmy(hold.until)}</span>
            <DueBadge level={hold.dueLevel} />
          </span>
          {hold.note && (
            <span className="text-muted-foreground break-words text-[12px]">{hold.note}</span>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </GlassCard>
  )
}

/** Levels worth a second pill beside the mark; "not yet" says nothing new. */
const LATE: ReadonlySet<Hold['dueLevel']> = new Set(['due-soon', 'due', 'overdue', 'long-overdue'])

/** A held lead or deal says until when, wherever it is listed (ADR 0097 §3);
 *  the profile ends it. `due` adds the due pill once the date draws near, on
 *  the surfaces with room for a second pill. */
export function HoldMark({
  hold,
  due = false,
  className,
}: {
  hold: Pick<Hold, 'until' | 'dueLevel'> | null
  due?: boolean
  className?: string
}) {
  if (!hold) return null
  return (
    <>
      <MetaPill
        icon={CalendarClock}
        title={`Tạm hoãn đến ${dmy(hold.until)}`}
        className={cn('tnum min-w-0', className)}
      >
        <span className="truncate">Tạm hoãn đến {dm(hold.until)}</span>
      </MetaPill>
      {due && LATE.has(hold.dueLevel) && <DueBadge level={hold.dueLevel} className="shrink-0" />}
    </>
  )
}

/** A hold list cell: the date over its due pill, two lines to fit the
 *  book's fixed row height. Dark ink at every level: a hovered or selected
 *  light row drops the tinted ink under 4.5:1 (law 13). */
export function HoldUntilCell({ hold }: { hold: Pick<Hold, 'until' | 'dueLevel'> }) {
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <span className="tnum text-[13px]">{dmy(hold.until)}</span>
      <DueBadge level={hold.dueLevel} />
    </span>
  )
}
