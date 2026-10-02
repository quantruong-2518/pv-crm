import { Check, Minus, Octagon } from '@pv/ui'
import { GlassCard, Icon, StatusDot, cn } from '@pv/ui'
import type { OpportunityProfileResponse } from '@pv/contracts'
import { dealStepSubject } from '@/data/deal-next-step'
import { FailLogCard } from '@/components/opportunity-stop'
import { NextStepCard } from './lead-next-action'
import { statusStepsOf, type StatusStep } from './opportunity-model'

/** Module 3 · where the deal stands, full width under the header: the four
 *  columns and the contract step off the server's `stages`, then the deal's one
 *  next step as a row — or, once stopped, its fail log (ADR 0077 §6, canvas B1–B7).
 *
 *  A local stepper rather than `Stepper`/`StageTrack`: those draw a form's
 *  progress or a bar without dates, and this one carries a date or a clock per
 *  step and a stop marker. */

export function DealStatus({ op }: { op: OpportunityProfileResponse }) {
  const steps = statusStepsOf(op)

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Tình trạng cơ hội">
      <GlassCard className="flex flex-col gap-4 p-4 sm:p-5">
        {/* `list-none` strips the list role in Safari; say it back. */}
        <ol role="list" className="m-0 grid list-none gap-2 p-0 sm:grid-cols-5">
          {steps.map((step) => (
            <StepCell key={step.key} step={step} />
          ))}
        </ol>
        <NextStepRow op={op} />
      </GlassCard>

      {op.state === 'lost' && <FailLogCard op={op} />}
    </section>
  )
}

/** Signing drops the deal's step and the server refuses a new one (ADR 0069
 *  §10), so a won deal states that fact instead of offering a button. A
 *  stopped deal has its fail log below, not a step. */
function NextStepRow({ op }: { op: OpportunityProfileResponse }) {
  if (op.state === 'lost') return null
  if (op.state === 'won') {
    return (
      <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
        Đã thành hợp đồng — cơ hội không còn việc tiếp theo.
      </p>
    )
  }
  return (
    <NextStepCard
      embedded
      subject={dealStepSubject(op.code, op.holder, op.stage)}
      canEdit={op.acts.editDetails.ok}
    />
  )
}

function StepCell({ step }: { step: StatusStep }) {
  const current = step.mark === 'current' || step.mark === 'waiting'

  return (
    <li
      aria-current={step.mark === 'current' ? 'step' : undefined}
      className={cn(
        'flex min-w-0 items-start gap-3 rounded-md px-3 py-2',
        current && 'bg-surface-ink/9',
      )}
    >
      <span className="flex h-5 w-4 shrink-0 items-center justify-center">
        <StepMarker mark={step.mark} />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span
          className={cn(
            'text-[13px] leading-[1.5]',
            current ? 'text-foreground font-semibold' : 'text-foreground',
          )}
        >
          {step.label}
        </span>
        {step.caption && (
          <span
            className={cn(
              'tnum text-[11.5px] leading-[1.5]',
              step.late || step.mark === 'stopped'
                ? 'text-destructive-foreground'
                : 'text-muted-foreground',
            )}
          >
            {step.caption}
          </span>
        )}
      </span>
    </li>
  )
}

/** A marker's meaning is said in words too, not only by glyph and colour. */
function StepMarker({ mark }: { mark: StatusStep['mark'] }) {
  switch (mark) {
    case 'done':
      return (
        <>
          <Icon icon={Check} size={16} className="text-success" />
          <span className="sr-only">đã xong</span>
        </>
      )
    case 'stopped':
      return <Icon icon={Octagon} size={16} className="text-destructive-foreground" />
    case 'skipped':
      return (
        <>
          <Icon icon={Minus} size={16} className="text-muted-foreground" />
          <span className="sr-only">bỏ qua</span>
        </>
      )
    case 'current':
      return <StatusDot state="current" />
    case 'waiting':
      return <StatusDot state="warning" />
    default:
      return <StatusDot state="next" />
  }
}
