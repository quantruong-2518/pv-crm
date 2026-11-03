import { useState, type ReactNode } from 'react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { cn } from '../lib/cn'
import { AiTaskSteps, StepMark, type AiTaskStep } from './ai-task-steps'

/** One job card inside O-12 · AiTaskTray: kind, title, status badge, progress while it
 *  runs, the current step with a toggle for the full list, then the outcome and actions. */

export type AiTaskAction = {
  label: string
  onClick: () => void
  primary?: boolean
  busy?: boolean
}

export type AiTaskItem = {
  id: string
  title: string
  /** The title is an object code, so it is set in the mono face (law 6). */
  titleMono?: boolean
  /** Small line above the title that names the sort of job, e.g. a contact report. */
  kind?: string
  status: 'running' | 'done' | 'failed'
  /** Short state pill text, e.g. the step counter or Done. */
  badge: string
  steps?: AiTaskStep[]
  /** One plain sentence under the title once the job has ended. */
  summary?: string
  /** Right-aligned beside the actions: step count and total time, or where it stopped. */
  meta?: string
  actions?: AiTaskAction[]
}

export type AiTaskCardCopy = {
  /** The toggle that opens the full step list, given how many steps there are. */
  steps: (n: number) => string
  hideSteps: string
  progress: string
}

const BADGE_TONE = { running: 'running', done: 'success', failed: 'danger' } as const

/* Owner, 03/11: tray badges read clearly. Stone keeps its lighter tint, which is
   what holds law 13 there; the global Badge tones stay as they are. Measured to
   clear 4.5:1 with about 0.1 to spare on stone: re-measure if a token changes. */
const BADGE_TINT = {
  running: 'bg-primary/30',
  done: 'bg-success/26 stone:bg-success/14',
  failed: 'bg-destructive/26 stone:bg-destructive/14',
} as const

export function TrayBadge({
  status,
  children,
}: {
  status: AiTaskItem['status']
  children: ReactNode
}) {
  return (
    <Badge tone={BADGE_TONE[status]} className={cn('px-3 text-[12px]', BADGE_TINT[status])}>
      {children}
    </Badge>
  )
}

/** The step the job is on now: running, else the one that failed, else the next waiting. */
function currentStep(steps: AiTaskStep[]) {
  return (
    steps.find((s) => s.state === 'now' || s.state === 'fail') ??
    steps.find((s) => s.state === 'wait') ??
    steps[steps.length - 1]
  )
}

function Progress({ steps, label }: { steps: AiTaskStep[]; label: string }) {
  const total = steps.length
  const at =
    steps.filter((s) => s.state === 'done').length + (steps.some((s) => s.state === 'now') ? 1 : 0)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={at}
      aria-valuemin={0}
      aria-valuemax={total}
      className="bg-secondary h-1.5 overflow-hidden rounded-sm"
    >
      <span
        className="bg-primary block h-full rounded-sm"
        style={{ width: `${(at / total) * 100}%` }}
      />
    </div>
  )
}

export function AiTaskCard({ task, copy }: { task: AiTaskItem; copy: AiTaskCardCopy }) {
  const [listed, setListed] = useState(false)
  const steps = task.steps?.length ? task.steps : undefined
  const now = steps ? currentStep(steps) : undefined
  const failed = task.status === 'failed'
  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-md px-4 py-3',
        failed ? 'bg-destructive/8' : 'bg-surface-ink/5',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {task.kind && (
            <span className="text-muted-foreground text-[12px] leading-4">{task.kind}</span>
          )}
          <span
            className={cn(
              'break-words text-[14px] font-semibold leading-5',
              task.titleMono && 'font-mono',
            )}
          >
            {task.title}
          </span>
        </div>
        <TrayBadge status={task.status}>{task.badge}</TrayBadge>
      </div>
      {steps && task.status === 'running' && <Progress steps={steps} label={copy.progress} />}
      {steps && (
        <>
          {listed && <AiTaskSteps steps={steps} />}
          <div className="flex items-center gap-2 text-[13px]">
            {!listed && now && (
              <>
                <StepMark state={now.state} />
                <span className="min-w-0 flex-1 font-semibold">{now.label}</span>
              </>
            )}
            <button
              type="button"
              aria-expanded={listed}
              onClick={() => setListed(!listed)}
              className="text-accent-foreground focus-visible:outline-ring pointer-coarse:h-12 ml-auto flex h-8 items-center rounded-sm text-[12px] font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {listed ? copy.hideSteps : copy.steps(steps.length)}
            </button>
          </div>
        </>
      )}
      {task.summary && (
        <p
          className={cn(
            'text-[13px] leading-5',
            failed ? 'text-on-tint-destructive' : 'text-foreground',
          )}
        >
          {task.summary}
        </p>
      )}
      {(task.actions?.length || task.meta) && (
        <div className="flex flex-wrap items-center gap-2">
          {task.actions?.map((a) => (
            <Button
              key={a.label}
              size="sm"
              className={cn(
                'pointer-coarse:h-12',
                a.primary && 'bg-accent text-accent-foreground hover:bg-primary/24',
              )}
              variant={a.primary ? 'secondary' : 'ghost'}
              onClick={a.busy ? undefined : a.onClick}
              aria-busy={a.busy || undefined}
            >
              {a.label}
            </Button>
          ))}
          {task.meta && (
            <span className="text-muted-foreground tnum ml-auto text-[12px]">{task.meta}</span>
          )}
        </div>
      )}
    </li>
  )
}
