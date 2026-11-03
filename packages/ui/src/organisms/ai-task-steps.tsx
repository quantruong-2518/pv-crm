import { Check, Loader, X } from '../icons'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** M-27 · AiTaskSteps — the steps of one background AI job, in order. */

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

export function StepMark({ state }: { state: AiTaskStepState }) {
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
