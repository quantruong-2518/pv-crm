import { useLayoutEffect, useRef } from 'react'
import { Check, ChevronDown, CircleAlert, Loader, Orbit, X } from '../icons'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-27 · AiTaskSteps and O-12 · AiTaskTray — background AI work, in the corner.
 *
 *  The press only queues a job; this tray is where its five steps are watched
 *  and where Undo waits on a finished one. The screen maps its rows onto
 *  `AiTaskItem`, so the kit knows nothing about leads or the queue. */

export type AiTaskStepState = 'done' | 'now' | 'wait' | 'fail'

export type AiTaskStep = {
  label: string
  state: AiTaskStepState
  /** Elapsed time on a finished step, or a short state word. */
  note?: string
}

const STEP_SR: Record<AiTaskStepState, string> = {
  done: 'xong',
  now: 'đang chạy',
  wait: 'chờ',
  fail: 'lỗi',
}

const STEP_TEXT: Record<AiTaskStepState, string> = {
  done: 'text-muted-foreground',
  now: 'text-foreground font-semibold',
  wait: 'text-glass-foreground',
  fail: 'text-destructive-foreground',
}

function StepMark({ state }: { state: AiTaskStepState }) {
  if (state === 'done') return <Icon icon={Check} className="text-success" />
  if (state === 'fail') return <Icon icon={X} />
  if (state === 'now')
    return <Icon icon={Loader} className="text-primary motion-safe:animate-spin" />
  return <span aria-hidden className="mx-1 size-3 rounded-full ring-[1.75px] ring-current" />
}

export function AiTaskSteps({ steps }: { steps: AiTaskStep[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s) => (
        <li
          key={s.label}
          aria-current={s.state === 'now' ? 'step' : undefined}
          className={cn(
            'grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 text-[13px] leading-5',
            STEP_TEXT[s.state],
          )}
        >
          <StepMark state={s.state} />
          <span>
            {s.label}
            <span className="sr-only"> · {STEP_SR[s.state]}</span>
          </span>
          <span className="text-glass-foreground tnum text-[12px]">{s.note}</span>
        </li>
      ))}
    </ol>
  )
}

export type AiTaskAction = {
  label: string
  onClick: () => void
  primary?: boolean
  busy?: boolean
}

export type AiTaskItem = {
  id: string
  title: string
  status: 'running' | 'done' | 'failed'
  /** Short state pill text, e.g. the step counter or Done. */
  badge: string
  steps?: AiTaskStep[]
  /** One plain sentence under the title once the job has ended. */
  summary?: string
  /** Right-aligned beside the actions: step count and total time. */
  meta?: string
  actions?: AiTaskAction[]
}

const BADGE_TONE = { running: 'running', done: 'success', failed: 'danger' } as const

export type AiTaskTrayProps = {
  tasks: AiTaskItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onClearDone: () => void
  /** Drop the fixed corner placement (theme kit only). */
  inline?: boolean
  /** Wording the screen owns: pill, header and the clear button. */
  copy: {
    title: string
    running: (n: number) => string
    failed: (n: number) => string
    done: (n: number) => string
    clear: string
    collapse: string
  }
}

function TaskRow({ task }: { task: AiTaskItem }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[14px] font-semibold">{task.title}</span>
        <Badge tone={BADGE_TONE[task.status]}>{task.badge}</Badge>
      </div>
      {task.steps && <AiTaskSteps steps={task.steps} />}
      {task.summary && <span className="text-muted-foreground text-[13px]">{task.summary}</span>}
      {(task.actions?.length || task.meta) && (
        <div className="flex flex-wrap items-center gap-2">
          {task.actions?.map((a) => (
            <Button
              key={a.label}
              size="sm"
              className="pointer-coarse:h-12"
              variant={a.primary ? 'secondary' : 'ghost'}
              onClick={a.busy ? undefined : a.onClick}
              aria-busy={a.busy || undefined}
            >
              {a.label}
            </Button>
          ))}
          {task.meta && (
            <span className="text-glass-foreground tnum ml-auto text-[12px]">{task.meta}</span>
          )}
        </div>
      )}
    </li>
  )
}

/** Height of the open tray, published so the toast row can stack above it. */
const TRAY_HEIGHT_VAR = '--ai-tray-h'

/** O-12 · AiTaskTray — bottom right, above every screen, absent with no jobs. */
export function AiTaskTray({
  tasks,
  open,
  onOpenChange,
  onClearDone,
  inline = false,
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
  /* Running outranks failed outranks done: a failure must not read as finished. */
  const headline =
    running > 0 ? copy.running(running) : failed > 0 ? copy.failed(failed) : copy.done(ended)
  const lead = running > 0 ? Orbit : failed > 0 ? CircleAlert : Check
  /* Under overlays (50) like ActionBanner, over the nav (40). */
  const corner = inline
    ? ''
    : 'fixed right-4 bottom-[calc(84px+env(safe-area-inset-bottom)+16px+var(--sticky-bar-h,0px))] z-[45] lg:right-4 lg:bottom-[calc(24px+var(--sticky-bar-h,0px))]'

  if (!open) {
    return (
      <div ref={box} className={cn('pointer-events-none', corner)}>
        <button
          type="button"
          aria-expanded={false}
          onClick={() => onOpenChange(true)}
          className="glass-overlay pointer-events-auto flex min-h-12 items-center gap-3 rounded-lg px-4 py-2 text-[13px]"
        >
          <Icon icon={lead} />
          <span className="flex-1 text-left font-semibold">{headline}</span>
          {running > 0 && ended + failed > 0 && (
            <span className="text-glass-foreground">
              · {failed > 0 ? copy.failed(failed) : copy.done(ended)}
            </span>
          )}
          <Icon icon={ChevronDown} className="rotate-180" />
        </button>
      </div>
    )
  }

  return (
    <aside
      ref={box}
      aria-label={copy.title}
      className={cn(
        'glass-overlay flex max-h-[min(640px,calc(100dvh-160px))] w-[min(400px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg',
        corner,
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <Icon icon={Orbit} />
        <h2 className="flex-1 text-[15px] font-semibold">
          {copy.title}{' '}
          <span className="text-glass-foreground text-[13px] font-normal">· {headline}</span>
        </h2>
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
      <ul className="flex flex-col overflow-y-auto">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </ul>
    </aside>
  )
}
