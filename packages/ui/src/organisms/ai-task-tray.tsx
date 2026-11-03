import { useLayoutEffect, useRef } from 'react'
import { ChevronDown } from '../icons'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'
import { AiTaskCard, type AiTaskCardCopy, type AiTaskItem } from './ai-task-card'
import { StatusTile, TrayPill, overallStatus } from './ai-task-pill'

/** O-12 · AiTaskTray — background AI work, in the corner.
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
  /** The round assistant button holds the corner from `lg`: the pill goes to its
   *  left on the same row, the open tray stacks above it. */
  besideAssistant?: boolean
  /** A screen docks its own box at the bottom (the assistant page): lift clear of it. */
  aboveComposer?: boolean
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

/** Height of the open tray, published so the toast row can stack above it. */
const TRAY_HEIGHT_VAR = '--ai-tray-h'

/* The button is 56px at 32px from the corner. The pill centres on it (36 = 32 + (56 - 48) / 2)
   and sits 12px left of it (100 = 32 + 56 + 12); the open tray clears it with 20px of air. */
const CORNER = {
  base: 'fixed bottom-[max(calc(84px+env(safe-area-inset-bottom)+16px),var(--sticky-bar-clear,0px))] right-4 z-[45]',
  pillAlone: 'lg:bottom-[max(24px,var(--sticky-bar-clear,0px))] lg:right-4',
  lifted: 'lg:bottom-[max(120px,var(--sticky-bar-clear,0px))] lg:right-4',
  pillBeside: 'lg:bottom-[max(36px,var(--sticky-bar-clear,0px))] lg:right-[100px]',
  openBeside: 'lg:bottom-[max(108px,var(--sticky-bar-clear,0px))] lg:right-8',
}

/** O-12 · AiTaskTray — bottom right, above every screen, absent with no jobs. */
export function AiTaskTray({
  tasks,
  open,
  onOpenChange,
  onClearDone,
  inline = false,
  besideAssistant = false,
  aboveComposer = false,
  copy,
}: AiTaskTrayProps) {
  const box = useRef<HTMLDivElement>(null)
  const shown = tasks.length > 0

  useLayoutEffect(() => {
    const root = document.documentElement
    const el = box.current
    if (inline || !el) return
    const publish = () => root.style.setProperty(TRAY_HEIGHT_VAR, `${el.offsetHeight + 12}px`)
    publish()
    const watch = new ResizeObserver(publish)
    watch.observe(el)
    return () => {
      watch.disconnect()
      root.style.removeProperty(TRAY_HEIGHT_VAR)
    }
  }, [inline, shown, open])

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

  const alone = aboveComposer ? CORNER.lifted : CORNER.pillAlone

  if (!open) {
    /* Under overlays (50) like ActionBanner, over the nav (40). */
    const corner = inline ? '' : cn(CORNER.base, besideAssistant ? CORNER.pillBeside : alone)
    return (
      <div ref={box} className={cn('pointer-events-none', corner)}>
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
      </div>
    )
  }

  return (
    <aside
      ref={box}
      aria-label={copy.title}
      className={cn(
        'glass-overlay porcelain:rounded-2xl flex max-h-[min(640px,calc(100dvh-160px-var(--sticky-bar-clear,0px)))] w-[min(440px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg',
        (besideAssistant || aboveComposer) &&
          'lg:max-h-[min(640px,calc(100dvh-240px-var(--sticky-bar-clear,0px)))]',
        !inline && cn(CORNER.base, besideAssistant ? CORNER.openBeside : alone),
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
