import { Check, ChevronDown, CircleAlert, Loader } from '../icons'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'
import { TrayBadge, type AiTaskItem } from './ai-task-card'

/** The collapsed face of O-12 · AiTaskTray: one 48px pill, plus the status tile
 *  that the expanded header shares. */

type Status = AiTaskItem['status']

const TILE: Record<Status, { glyph: typeof Check; tone: string; spin?: string }> = {
  running: {
    glyph: Loader,
    tone: 'bg-accent text-accent-foreground',
    spin: 'motion-safe:animate-spin',
  },
  failed: { glyph: CircleAlert, tone: 'bg-destructive/16 text-on-tint-destructive' },
  done: { glyph: Check, tone: 'bg-success/16 text-on-tint-success' },
}

const SEGMENT: Record<Status, string> = {
  running: 'bg-primary',
  failed: 'bg-destructive',
  done: 'bg-success',
}

const RANK: Record<Status, number> = { running: 0, failed: 1, done: 2 }

/** Running outranks failed outranks done: a failure must not read as finished. */
export function overallStatus(running: number, failed: number): Status {
  return running > 0 ? 'running' : failed > 0 ? 'failed' : 'done'
}

export function StatusTile({ status }: { status: Status }) {
  const { glyph, tone, spin } = TILE[status]
  /* The spin sits on the glyph, not the tile, so the tinted square stays still. */
  return (
    <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', tone)}>
      <Icon icon={glyph} className={spin} />
    </span>
  )
}

export type TrayPillProps = {
  tasks: AiTaskItem[]
  title: string
  headline: string
  running: number
  failed: number
  failedLabel: string
  /** What the bar says to a screen reader when jobs ended but the headline names others. */
  endedLabel?: string
  onOpen: () => void
}

export function TrayPill({
  tasks,
  title,
  headline,
  running,
  failed,
  failedLabel,
  endedLabel,
  onOpen,
}: TrayPillProps) {
  const unfinished = running + failed > 0
  const segments = [...tasks].sort((a, b) => RANK[a.status] - RANK[b.status])
  return (
    <button
      type="button"
      aria-expanded={false}
      onClick={onOpen}
      className="glass-overlay focus-visible:outline-ring pointer-events-auto flex h-12 items-center gap-3 rounded-lg px-3 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <StatusTile status={overallStatus(running, failed)} />
      <span className="flex flex-col items-start gap-1">
        <span className="font-semibold leading-4">
          {title} · {headline}
          {endedLabel && <span className="sr-only"> · {endedLabel}</span>}
        </span>
        {unfinished && (
          <span aria-hidden className="flex max-w-[168px] gap-1 self-stretch">
            {segments.map((t) => (
              <span key={t.id} className={cn('h-1 w-[22px] rounded-sm', SEGMENT[t.status])} />
            ))}
          </span>
        )}
      </span>
      {running > 0 && failed > 0 && <TrayBadge status="failed">{failedLabel}</TrayBadge>}
      <Icon icon={ChevronDown} className="text-glass-foreground rotate-180" />
    </button>
  )
}

/** The collapsed face in the header: the status tile and one number, so the
 *  tray holds no page content while it waits. The full line is the tooltip. */
export function TrayHeaderButton({
  title,
  headline,
  count,
  status,
  onOpen,
}: {
  title: string
  headline: string
  count: number
  status: Status
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      aria-expanded={false}
      aria-label={`${title} · ${headline}`}
      title={`${title} · ${headline}`}
      onClick={onOpen}
      className="motion-std hover:bg-surface-ink/8 focus-visible:outline-ring pointer-coarse:h-12 flex h-10 items-center gap-2 rounded-lg px-2 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <StatusTile status={status} />
      <span className="tnum">{count}</span>
    </button>
  )
}
