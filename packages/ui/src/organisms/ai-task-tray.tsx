import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from '../icons'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'
import { AiTaskCard, type AiTaskCardCopy, type AiTaskItem } from './ai-task-card'
import { StatusTile, TrayHeaderButton, TrayPill, overallStatus } from './ai-task-pill'

/** O-12 · AiTaskTray — background AI work, in the header.
 *
 *  The press only queues a job; this tray is where its five steps are watched
 *  and where Undo waits on a finished one. The screen maps its rows onto
 *  `AiTaskItem`, so the kit knows nothing about leads or the queue. */

export { AiTaskSteps } from './ai-task-steps'
export type { AiTaskStep, AiTaskStepState } from './ai-task-steps'
export type { AiTaskAction, AiTaskItem } from './ai-task-card'

export type AiTaskTrayProps = {
  tasks: AiTaskItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onClearDone: () => void
  /** Drop the fixed corner placement (theme kit only). */
  inline?: boolean
  /** Where the collapsed button lives: an element in the header. The open
   *  panel drops from under it, so nothing on the page is covered while it waits. */
  slot?: HTMLElement | null
  /** Wording the screen owns: pill, header, the cards and the clear button. */
  copy: AiTaskCardCopy & {
    title: string
    running: (n: number) => string
    failed: (n: number) => string
    done: (n: number) => string
    clear: string
    collapse: string
  }
}

/** Gap between the header's bottom edge and the open panel. */
const PANEL_GAP = 12

/** O-12 · AiTaskTray — a header button that opens a panel, absent with no jobs. */
export function AiTaskTray({
  tasks,
  open,
  onOpenChange,
  onClearDone,
  inline = false,
  slot,
  copy,
}: AiTaskTrayProps) {
  const shown = tasks.length > 0
  const [top, setTop] = useState(72)

  useLayoutEffect(() => {
    if (inline || !open || !slot) return
    const place = () => setTop(slot.getBoundingClientRect().bottom + PANEL_GAP)
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [inline, open, slot])

  if (!shown) return null
  const running = tasks.filter((t) => t.status === 'running').length
  const failed = tasks.filter((t) => t.status === 'failed').length
  const ended = tasks.length - running - failed
  const status = overallStatus(running, failed)
  const headline =
    status === 'running'
      ? copy.running(running)
      : status === 'failed'
        ? copy.failed(failed)
        : copy.done(ended)
  const summary = [
    running > 0 && copy.running(running),
    failed > 0 && copy.failed(failed),
    ended > 0 && copy.done(ended),
  ]
    .filter(Boolean)
    .join(' · ')

  if (!open) {
    if (inline) {
      return (
        <TrayPill
          tasks={tasks}
          title={copy.title}
          headline={headline}
          running={running}
          failed={failed}
          failedLabel={copy.failed(failed)}
          endedLabel={ended > 0 && status !== 'done' ? copy.done(ended) : undefined}
          onOpen={() => onOpenChange(true)}
        />
      )
    }
    const button = (
      <TrayHeaderButton
        title={copy.title}
        headline={summary}
        count={status === 'running' ? running : status === 'failed' ? failed : ended}
        status={status}
        onOpen={() => onOpenChange(true)}
      />
    )
    return slot ? createPortal(button, slot) : null
  }

  return (
    <aside
      style={inline ? undefined : { top }}
      aria-label={copy.title}
      className={cn(
        'glass-overlay porcelain:rounded-2xl flex max-h-[min(640px,calc(100dvh-120px))] w-[min(440px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg',
        !inline && 'fixed right-4 z-[45]',
      )}
    >
      <div className="flex items-center gap-3 py-3 pl-4 pr-3">
        <StatusTile status={status} />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-[15px] font-bold leading-5">{copy.title}</h2>
          <span className="text-muted-foreground text-[12px] leading-4">{summary}</span>
        </div>
        {ended + failed > 0 && (
          <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onClearDone}>
            {copy.clear}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:size-12 size-8 px-0"
          aria-label={copy.collapse}
          aria-expanded
          onClick={() => onOpenChange(false)}
        >
          <Icon icon={ChevronDown} />
        </Button>
      </div>
      <ul className="flex flex-col gap-2 overflow-y-auto px-3 pb-3">
        {tasks.map((t) => (
          <AiTaskCard key={t.id} task={t} copy={copy} />
        ))}
      </ul>
    </aside>
  )
}
