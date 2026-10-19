import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ListChecks, Plus } from '@pv/ui'
import { Button, Icon, Input, Modal, Select, Skeleton, Textarea, cn } from '@pv/ui'
import {
  CARE_ACTIVITY_KINDS,
  OPPORTUNITY_MILESTONE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_NOTE_MAX,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dmy } from '@/lib/date'
import { focusSoon } from '@/lib/focus'
import { dealStepSubject } from '@/data/deal-next-step'
import { nextStepQuery } from '@/data/next-step'
import { refusalOf, vnToday } from '@/data/opportunities'
import { useLogMilestone } from '@/data/opportunities-write'
import { atOfDay } from '@/data/quotations-write'
import { Field } from '@/components/ops-fields'
import { NextStepForm } from '@/components/run/next-step'

/** Module 3 · a care activity a seller records on an accepted deal (ADR 0072):
 *  repeatable, any order, back-datable, ending on the question about the next
 *  step. Quotations have their own ledger and modal (`opportunity-quotation-modal`).
 *
 *  The day bounds are the server's `floors.activityFrom`, in Vietnam calendar days,
 *  up to today. Today sends no `at`, so the server stamps its own now; another
 *  day is sent as that day's VN midnight and the server clamps it to [floor, now]. */

type Phase = 'form' | 'follow' | 'step-done' | 'step-new'

/** Each phase swaps out the button that was pressed, so focus is placed on the
 *  first control of the next phase instead of falling to the page body. */
const FOLLOW_ID = 'deal-event-follow'
const focusFollow = () =>
  focusSoon(() => {
    const box = document.getElementById(FOLLOW_ID)
    return box?.querySelector<HTMLElement>('textarea') ?? box?.querySelector<HTMLElement>('button')
  })

const KIND_OPTIONS = [
  { value: '', label: 'Chọn hoạt động…' },
  ...CARE_ACTIVITY_KINDS.map((k) => ({ value: k, label: OPPORTUNITY_MILESTONE_LABEL[k] })),
]

const isActivity = (v: string): v is (typeof CARE_ACTIVITY_KINDS)[number] =>
  (CARE_ACTIVITY_KINDS as readonly string[]).includes(v)

/** Opened from the header or the bar's more menu; whether the door shows is
 *  the server's `acts.activity`. Mount it with a fresh `key` per opening, so its
 *  form and phase start clean. */
export function DealEventModal({
  op,
  open,
  onClose,
}: {
  op: OpportunityProfileResponse
  open: boolean
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>('form')
  const [form, setForm] = useState<EventForm>(blankForm)
  const { activity, day, note } = form
  const log = useLogMilestone(op.code)
  const refusal = refusalOf(op.acts.activity)
  const atAssigned = op.stage === 'assigned'
  const min = op.floors.activityFrom ?? undefined
  const max = vnToday()

  const outOfRange = day > max || (min !== undefined && day < min)
  /* A re-read may shut the door under an open modal; its reason blocks the press. */
  const blocker =
    refusal ??
    (activity === ''
      ? 'Chọn một hoạt động.'
      : day === ''
        ? 'Chọn ngày.'
        : outOfRange
          ? range(min)
          : '')
  const label = isActivity(activity) ? OPPORTUNITY_MILESTONE_LABEL[activity] : ''

  const submit = () => {
    if (!isActivity(activity) || blocker) return
    const at = atOfDay(day)
    const typed = note.trim()
    log.mutate(
      { kind: activity, ...(at ? { at } : {}), ...(typed === '' ? {} : { note: typed }) },
      {
        onSuccess: () => {
          toastDone(`Đã ghi ${label}.`)
          setPhase('follow')
          focusFollow()
        },
      },
    )
  }

  const footerLine = log.error ? userMessage(log.error) : log.isPending ? 'Đang ghi…' : blocker

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[560px]"
      title={phase === 'form' ? 'Ghi hoạt động chăm sóc' : 'Đã ghi'}
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · {op.account}
        </>
      }
      footer={
        phase === 'form' ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span
              className={cn(
                'min-w-0 flex-1 text-[11.5px] leading-[1.5]',
                log.error ? 'text-destructive-foreground' : 'text-muted-foreground',
              )}
              aria-live="polite"
            >
              {footerLine}
            </span>
            <div className="flex shrink-0 gap-3">
              <Button size="lg" variant="ghost" disabled={log.isPending} onClick={onClose}>
                Quay lại
              </Button>
              <Button size="lg" disabled={Boolean(blocker) || log.isPending} onClick={submit}>
                <Icon icon={ListChecks} size={16} />
                Ghi
              </Button>
            </div>
          </div>
        ) : phase === 'follow' ? (
          <div className="flex justify-end">
            <Button size="lg" variant="ghost" onClick={onClose}>
              Để sau
            </Button>
          </div>
        ) : undefined
      }
    >
      {phase === 'form' ? (
        <EventFields form={form} setForm={setForm} atAssigned={atAssigned} min={min} max={max} />
      ) : (
        <StepFollowUp op={op} phase={phase} setPhase={setPhase} onDone={onClose} />
      )}
    </Modal>
  )
}

const range = (min: string | undefined) =>
  min === undefined ? 'Không sau hôm nay.' : `Từ ${dmy(min)} đến hôm nay.`

type EventForm = { activity: string; day: string; note: string }
const blankForm = (): EventForm => ({ activity: '', day: vnToday(), note: '' })

function EventFields({
  form,
  setForm,
  atAssigned,
  min,
  max,
}: {
  form: EventForm
  setForm: (next: EventForm) => void
  atAssigned: boolean
  min: string | undefined
  max: string
}) {
  return (
    <div className="flex flex-col gap-6">
      <Field
        label="Hoạt động"
        required
        plain
        hint={
          atAssigned
            ? `Hoạt động đầu tiên chuyển cơ hội sang cột ${OPPORTUNITY_STAGE_LABEL.engaged}.`
            : 'Ghi được nhiều lần, thứ tự nào cũng được.'
        }
      >
        <Select
          label="Hoạt động"
          hideLabel
          value={form.activity}
          onChange={(activity) => setForm({ ...form, activity })}
          options={KIND_OPTIONS}
          size="lg"
          className="w-full"
        />
      </Field>
      <Field label="Ngày" required hint={range(min)}>
        <Input
          type="date"
          aria-label="Ngày diễn ra"
          className="pointer-coarse:h-12"
          value={form.day}
          min={min}
          max={max}
          onChange={(e) => setForm({ ...form, day: e.target.value })}
        />
      </Field>
      <Field label="Ghi chú" hint="Khách nói gì, gửi gì, ai tham gia.">
        <Textarea
          autoGrow
          rows={3}
          value={form.note}
          aria-label="Ghi chú"
          maxLength={OPPORTUNITY_STAGE_NOTE_MAX}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
      </Field>
    </div>
  )
}

/** The open next step, asked about right after a recorded fact (ADR 0069 §10):
 *  done, or replaced — through the profile's own form and doors. */
function StepFollowUp({
  op,
  phase,
  setPhase,
  onDone,
}: {
  op: OpportunityProfileResponse
  phase: Phase
  setPhase: (next: Phase) => void
  onDone: () => void
}) {
  const { data, isPending, error } = useQuery(nextStepQuery('opportunity', op.code))
  const subject = dealStepSubject(op.code, op.holder)
  if (isPending) return <Skeleton className="h-16 w-full" />
  if (!data) {
    return (
      <p role="alert" className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]">
        Không đọc được việc tiếp theo. {isApiError(error) ? userMessage(error) : ''}
      </p>
    )
  }
  const step = data.step

  const go = (next: Phase) => {
    setPhase(next)
    focusFollow()
  }

  if (phase !== 'follow') {
    return (
      <div id={FOLLOW_ID}>
        <NextStepForm
          subject={subject}
          step={phase === 'step-done' ? step : null}
          finishing={phase === 'step-done'}
          onClose={onDone}
        />
      </div>
    )
  }
  return (
    <div id={FOLLOW_ID} className="flex flex-col gap-4">
      <p className="text-foreground m-0 break-words text-[13px] leading-[1.6]">
        {step ? `Việc tiếp theo “${step.text}” xong chưa?` : 'Cơ hội chưa có việc tiếp theo.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {step && (
          <Button size="lg" variant="secondary" onClick={() => go('step-done')}>
            <Icon icon={Check} size={16} />
            Đánh dấu xong
          </Button>
        )}
        <Button size="lg" variant="secondary" onClick={() => go('step-new')}>
          <Icon icon={Plus} size={16} />
          {step ? 'Thay bằng việc mới' : 'Đặt việc mới'}
        </Button>
      </div>
    </div>
  )
}
