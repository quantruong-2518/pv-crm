import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, FileText, ListChecks, Plus, TriangleAlert } from '@pv/ui'
import { Button, Icon, Input, Modal, Select, Skeleton, Textarea, cn } from '@pv/ui'
import {
  CARE_ACTIVITY_KINDS,
  OPPORTUNITY_MILESTONE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_NOTE_MAX,
  type OpportunityMilestoneKind,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dmy } from '@/lib/date'
import { focusSoon } from '@/lib/focus'
import { dealStepSubject } from '@/data/deal-next-step'
import { nextStepQuery } from '@/data/next-step'
import { eventOfferOf, refusalOf, vnToday, type EventKind } from '@/data/opportunities'
import { useLogMilestone } from '@/data/opportunities-write'
import { Field } from '@/components/ops-fields'
import { NextStepForm } from './lead-next-action'

/** Module 3 · the two facts a seller records on an accepted deal (ADR 0072):
 *  a care activity (repeatable, any order) and a quotation (the stage, a repeat
 *  is another round). One modal for both, because both carry a back-datable
 *  day and a note, and both end on the same question about the next step.
 *
 *  The day bounds are the server's `floors` per door, in Vietnam calendar days,
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

const atOfDay = (day: string): string | undefined =>
  day === vnToday() ? undefined : `${day}T00:00:00+07:00`

const KIND_OPTIONS = [
  { value: '', label: 'Chọn hoạt động…' },
  ...CARE_ACTIVITY_KINDS.map((k) => ({ value: k, label: OPPORTUNITY_MILESTONE_LABEL[k] })),
]

const isActivity = (v: string): v is (typeof CARE_ACTIVITY_KINDS)[number] =>
  (CARE_ACTIVITY_KINDS as readonly string[]).includes(v)

/** Each button shows only while the server's `acts` open its door — on the
 *  profile's floating bar, so 48px everywhere (law 13). `quotePrimary`: the
 *  quotation is the deal's next stage move, so it wears the one primary. */
export function DealEventButtons({
  op,
  quotePrimary = false,
}: {
  op: OpportunityProfileResponse
  quotePrimary?: boolean
}) {
  const [open, setOpen] = useState<EventKind | null>(null)
  /* A fresh modal per opening: its form and phase start clean, with no reset
     running during the exit animation. */
  const [session, setSession] = useState(0)
  const start = (kind: EventKind) => {
    setSession((n) => n + 1)
    setOpen(kind)
  }
  const round = eventOfferOf(op, 'quotation')?.nextRound ?? 1
  const quoteLabel = round > 1 ? `Ghi báo giá lần ${round}` : 'Ghi báo giá'

  return (
    <>
      {op.acts.activity.ok && (
        <Button size="lg" variant="secondary" onClick={() => start('activity')}>
          <Icon icon={ListChecks} size={16} />
          Ghi hoạt động
        </Button>
      )}
      {op.acts.quotation.ok && (
        <Button
          size="lg"
          variant={quotePrimary ? 'default' : 'secondary'}
          title={QUOTE_HINT}
          onClick={() => start('quotation')}
        >
          <Icon icon={FileText} size={16} />
          {quoteLabel}
        </Button>
      )}
      <DealEventModal
        key={session}
        op={op}
        kind={open}
        quoteLabel={quoteLabel}
        onClose={() => setOpen(null)}
      />
    </>
  )
}

function DealEventModal({
  op,
  kind,
  quoteLabel,
  onClose,
}: {
  op: OpportunityProfileResponse
  kind: EventKind | null
  quoteLabel: string
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>('form')
  const [form, setForm] = useState<EventForm>(blankForm)
  const { activity, day, note } = form
  const log = useLogMilestone(op.code)
  const quoting = kind === 'quotation'
  const offer = kind && eventOfferOf(op, kind)
  const atAssigned = offer?.atAssigned ?? false
  const min = (quoting ? op.floors.quotationFrom : op.floors.activityFrom) ?? undefined
  const max = vnToday()

  const outOfRange = day > max || (min !== undefined && day < min)
  /* A re-read may shut the door under an open modal; its reason blocks the press. */
  const blocker =
    kind && !offer
      ? (refusalOf(op.acts[kind]) ?? '')
      : !quoting && activity === ''
        ? 'Chọn một hoạt động.'
        : day === ''
          ? 'Chọn ngày.'
          : outOfRange
            ? range(min)
            : ''
  const label =
    quoting && offer
      ? `Báo giá (lần ${offer.nextRound})`
      : isActivity(activity)
        ? OPPORTUNITY_MILESTONE_LABEL[activity]
        : ''

  const submit = () => {
    const recorded: OpportunityMilestoneKind | null = quoting
      ? 'quotation'
      : isActivity(activity)
        ? activity
        : null
    if (!recorded || blocker) return
    const at = atOfDay(day)
    const typed = note.trim()
    log.mutate(
      { kind: recorded, ...(at ? { at } : {}), ...(typed === '' ? {} : { note: typed }) },
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
      open={kind !== null}
      onClose={onClose}
      className="sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[560px]"
      title={phase === 'form' ? (quoting ? quoteLabel : 'Ghi hoạt động chăm sóc') : 'Đã ghi'}
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
                <Icon icon={quoting ? FileText : ListChecks} size={16} />
                {quoting && atAssigned
                  ? `Chuyển thẳng sang ${OPPORTUNITY_STAGE_LABEL.quotation}`
                  : 'Ghi'}
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
        <EventFields
          form={form}
          setForm={setForm}
          quoting={quoting}
          atAssigned={atAssigned}
          min={min}
          max={max}
        />
      ) : (
        <StepFollowUp op={op} phase={phase} setPhase={setPhase} onDone={onClose} />
      )}
    </Modal>
  )
}

const QUOTE_HINT = `Đã gửi bằng email trong PV One với mẫu ${OPPORTUNITY_MILESTONE_LABEL.quotation} thì không cần ghi lại.`

const range = (min: string | undefined) =>
  min === undefined ? 'Không sau hôm nay.' : `Từ ${dmy(min)} đến hôm nay.`

type EventForm = { activity: string; day: string; note: string }
const blankForm = (): EventForm => ({ activity: '', day: vnToday(), note: '' })

function EventFields({
  form,
  setForm,
  quoting,
  atAssigned,
  min,
  max,
}: {
  form: EventForm
  setForm: (next: EventForm) => void
  quoting: boolean
  atAssigned: boolean
  min: string | undefined
  max: string
}) {
  return (
    <div className="flex flex-col gap-6">
      {quoting && (
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">{QUOTE_HINT}</p>
      )}
      {quoting && atAssigned && (
        <p className="text-warning m-0 flex items-start gap-2 text-[12.5px] leading-[1.6]">
          <Icon icon={TriangleAlert} size={16} className="mt-1 shrink-0" />
          Chưa ghi hoạt động chăm sóc nào — chuyển thẳng sang {OPPORTUNITY_STAGE_LABEL.quotation}?
          Cột {OPPORTUNITY_STAGE_LABEL.engaged} sẽ hiện là bỏ qua.
        </p>
      )}
      {!quoting && (
        <Field
          label="Hoạt động"
          required
          plain
          hint={
            atAssigned
              ? `Hoạt động đầu tiên chuyển cơ hội sang cột ${OPPORTUNITY_STAGE_LABEL.engaged}.`
              : 'Ghi lặp lại được, theo thứ tự nào cũng được.'
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
      )}
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
      <Field label="Ghi chú" hint="Tuỳ chọn — khách nói gì, gửi gì, ai tham gia.">
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
  const subject = dealStepSubject(op.code, op.holder, op.stage)
  if (isPending) return <Skeleton className="h-16 w-full" />
  if (!data) {
    return (
      <p role="alert" className="text-warning m-0 text-[12.5px] leading-[1.6]">
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
