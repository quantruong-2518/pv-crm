import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ListChecks, Plus } from '@pv/ui'
import { Button, Icon, Input, Modal, Select, Skeleton, Textarea, cn } from '@pv/ui'
import {
  CARE_ACTIVITY_KINDS,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_NOTE_MAX,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
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

const isActivity = (v: string): v is (typeof CARE_ACTIVITY_KINDS)[number] =>
  (CARE_ACTIVITY_KINDS as readonly string[]).includes(v)

function activityText(
  kind: (typeof CARE_ACTIVITY_KINDS)[number],
  t: (copy: ReturnType<typeof message>) => string,
) {
  const copy = {
    sample: message('Sample', 'Sample', '샘플'),
    poc: message('POC', 'POC', 'POC'),
    demo: message('Demo', 'Demo', '데모'),
    'site-visit': message('Khảo sát / gặp tại nhà máy', 'Site visit', '현장 방문'),
  } as const
  return t(copy[kind])
}

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
  const { t } = useI18n()
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
      ? t(message('Chọn một hoạt động.', 'Choose an activity.', '활동을 선택하세요.'))
      : day === ''
        ? t(message('Chọn ngày.', 'Choose a date.', '날짜를 선택하세요.'))
        : outOfRange
          ? range(min, t)
          : '')
  const label = isActivity(activity) ? activityText(activity, t) : ''

  const submit = () => {
    if (!isActivity(activity) || blocker) return
    const at = atOfDay(day)
    const typed = note.trim()
    log.mutate(
      { kind: activity, ...(at ? { at } : {}), ...(typed === '' ? {} : { note: typed }) },
      {
        onSuccess: () => {
          toastDone(t(message(`Đã ghi ${label}.`, `${label} recorded.`, `${label} 기록 완료.`)))
          setPhase('follow')
          focusFollow()
        },
      },
    )
  }

  const footerLine = log.error
    ? userMessage(log.error)
    : log.isPending
      ? t(message('Đang ghi…', 'Recording…', '기록 중…'))
      : blocker

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[560px]"
      title={
        phase === 'form'
          ? t(message('Ghi hoạt động chăm sóc', 'Log a customer activity', '고객 활동 기록'))
          : t(message('Đã ghi', 'Recorded', '기록 완료'))
      }
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
                {t(message('Quay lại', 'Back', '뒤로'))}
              </Button>
              <Button size="lg" disabled={Boolean(blocker) || log.isPending} onClick={submit}>
                <Icon icon={ListChecks} size={16} />
                {t(message('Ghi', 'Record', '기록'))}
              </Button>
            </div>
          </div>
        ) : phase === 'follow' ? (
          <div className="flex justify-end">
            <Button size="lg" variant="ghost" onClick={onClose}>
              {t(message('Để sau', 'Later', '나중에'))}
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

const range = (min: string | undefined, t: (copy: ReturnType<typeof message>) => string) =>
  min === undefined
    ? t(
        message(
          'Không sau hôm nay.',
          'No later than today.',
          '오늘 이후 날짜는 선택할 수 없습니다.',
        ),
      )
    : t(
        message(
          `Từ ${dmy(min)} đến hôm nay.`,
          `From ${dmy(min)} through today.`,
          `${dmy(min)}부터 오늘까지.`,
        ),
      )

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
  const { t } = useI18n()
  const kindOptions = [
    { value: '', label: t(message('Chọn hoạt động…', 'Choose an activity…', '활동 선택…')) },
    ...CARE_ACTIVITY_KINDS.map((k) => ({ value: k, label: activityText(k, t) })),
  ]
  return (
    <div className="flex flex-col gap-6">
      <Field
        label={t(message('Hoạt động', 'Activity', '활동'))}
        required
        plain
        hint={
          atAssigned
            ? t(
                message(
                  `Hoạt động đầu tiên chuyển cơ hội sang giai đoạn ${OPPORTUNITY_STAGE_LABEL.engaged}.`,
                  `The first activity moves the opportunity to ${OPPORTUNITY_STAGE_LABEL.engaged}.`,
                  `첫 활동을 기록하면 영업 기회가 ${OPPORTUNITY_STAGE_LABEL.engaged} 단계로 이동합니다.`,
                ),
              )
            : t(
                message(
                  'Có thể ghi nhiều lần, không cần theo thứ tự.',
                  'Log activities as often as needed, in any order.',
                  '순서와 관계없이 활동을 여러 번 기록할 수 있습니다.',
                ),
              )
        }
      >
        <Select
          label={t(message('Hoạt động', 'Activity', '활동'))}
          hideLabel
          value={form.activity}
          onChange={(activity) => setForm({ ...form, activity })}
          options={kindOptions}
          size="lg"
          className="w-full"
        />
      </Field>
      <Field label={t(message('Ngày', 'Date', '날짜'))} required hint={range(min, t)}>
        <Input
          type="date"
          aria-label={t(message('Ngày diễn ra', 'Activity date', '활동 날짜'))}
          className="pointer-coarse:h-12"
          value={form.day}
          min={min}
          max={max}
          onChange={(e) => setForm({ ...form, day: e.target.value })}
        />
      </Field>
      <Field
        label={t(message('Ghi chú', 'Notes', '메모'))}
        hint={t(
          message(
            'Khách nói gì, đã gửi gì, ai tham gia.',
            'What the customer said, what you sent, and who joined.',
            '고객이 한 말, 전달한 내용, 참석자를 적어 주세요.',
          ),
        )}
      >
        <Textarea
          autoGrow
          rows={3}
          value={form.note}
          aria-label={t(message('Ghi chú', 'Notes', '메모'))}
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
  const { t } = useI18n()
  const { data, isPending, error } = useQuery(nextStepQuery('opportunity', op.code))
  const subject = dealStepSubject(op.code, op.holder)
  if (isPending) return <Skeleton className="h-16 w-full" />
  if (!data) {
    return (
      <p role="alert" className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]">
        {t(
          message(
            'Không đọc được việc tiếp theo.',
            'Could not load the next step.',
            '다음 단계를 불러오지 못했습니다.',
          ),
        )}{' '}
        {isApiError(error) ? userMessage(error) : ''}
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
        {step
          ? t(
              message(
                `Việc tiếp theo “${step.text}” xong chưa?`,
                `Is “${step.text}” done?`,
                `다음 단계 “${step.text}”을(를) 완료했나요?`,
              ),
            )
          : t(
              message(
                'Cơ hội chưa có việc tiếp theo.',
                'This opportunity has no next step.',
                '이 영업 기회에 다음 단계가 없습니다.',
              ),
            )}
      </p>
      <div className="flex flex-wrap gap-2">
        {step && (
          <Button size="lg" variant="secondary" onClick={() => go('step-done')}>
            <Icon icon={Check} size={16} />
            {t(message('Đánh dấu xong', 'Mark complete', '완료로 표시'))}
          </Button>
        )}
        <Button size="lg" variant="secondary" onClick={() => go('step-new')}>
          <Icon icon={Plus} size={16} />
          {step
            ? t(message('Thay bằng việc mới', 'Replace with a new step', '새 단계로 바꾸기'))
            : t(message('Đặt việc mới', 'Set a next step', '다음 단계 설정'))}
        </Button>
      </div>
    </div>
  )
}
