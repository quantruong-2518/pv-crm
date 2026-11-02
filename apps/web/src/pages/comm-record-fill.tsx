import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Button, Icon, PhoneOff, Save, Timer } from '@pv/ui'
import type { DebriefClose, DebriefView } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dmy, hm } from '@/lib/date'
import {
  CommAiContent,
  CommAiEvaluation,
  CommAiStatus,
  CommAiSteps,
} from '@/components/comm-ai-report'
import { CommLateMark } from '@/components/comm-bits'
import { CommRecordFrame } from '@/components/comm-record-frame'
import { CommUnreachedDialog } from '@/components/comm-unreached-dialog'
import { useCommAiReport } from '@/data/comm-ai-report'
import {
  commNoun,
  useAnchorTurn,
  clearCommDraft,
  commKindLine,
  confirmHoursLeft,
  readCommDraft,
  useConfirmComm,
  writeCommDraft,
} from '@/data/comm-record-detail'
import { EMPTY_COMM_DRAFT, useCommForm } from '@/data/comm-record-form'
import { useMinuteClock } from '@/data/minute-clock'
import { BAR_BUTTON, CommFormBar, CommFormSteps, type FormProblem } from './comm-record-form'

const TEXT = {
  draftSavedOnThisDevice: message(
    'Đã lưu nháp trên máy này',
    'Draft saved on this device',
    '이 기기에 초안을 저장했습니다',
  ),
}

/** The owner's fill form for an open comm: three steps, one card at a time,
 *  and a sticky bar that says what the open step still lacks. Next is shut
 *  until the open step is complete, confirm until all three are; the stepper
 *  jumps anywhere. A draft is kept in this browser only; the server stores the
 *  record when the owner confirms (ADR 0074 §2, 0075 §2).
 *
 *  AI proposes on a press and waits for another (ADR 0132): the report sits
 *  beside this form, and only the owner's press moves a part into it. */

export function CommFillWorkspace({ record }: { record: DebriefView }) {
  const { t } = useI18n()
  const confirm = useConfirmComm()
  const saved = useMemo(() => readCommDraft(record.id), [record.id])
  const form = useCommForm(record, saved ?? EMPTY_COMM_DRAFT)
  const ai = useCommAiReport(record)
  const { close, at, go, titles } = form
  const [unreached, setUnreached] = useState(false)

  /* One gap per step, in the order of `titles`; the bar says the open one's. */
  const gaps = [form.contentGap, form.answersGap ?? close.temperatureGap, close.gapOf(form.draft)]
  const blocker = gaps.find((gap) => gap !== null) ?? null
  const last = titles.length - 1

  const save = () => {
    const { title, summary, picked, draft } = form
    writeCommDraft(record.id, { title, summary, picked, step: draft })
    toastDone(t(TEXT.draftSavedOnThisDevice))
  }
  const submit = () => {
    if (blocker || confirm.isPending) return
    const body: DebriefClose = {
      title: form.title.trim(),
      summary: form.summary.trim(),
      answers: form.answers(),
      ...close.inputOf(form.draft),
    }
    confirm.mutate(
      { id: record.id, body },
      {
        onSuccess: () => {
          clearCommDraft(record.id)
          toastDone(
            t(message('Đã xác nhận liên hệ', 'Interaction confirmed', '연락 기록을 확인했습니다')),
          )
        },
      },
    )
  }

  const shortfall = at === last ? blocker : (gaps[at] ?? null)
  const problem: FormProblem =
    at === last && confirm.error
      ? { text: userMessage(confirm.error), failed: true }
      : shortfall === null
        ? null
        : { text: shortfall }

  return (
    <CommRecordFrame
      record={record}
      title={t(
        message(
          `Ghi lại ${commNoun(record.channel, 'vi')}`,
          `Log ${commNoun(record.channel, 'en')}`,
          `${commNoun(record.channel, 'ko')} 기록`,
        ),
      )}
      meta={<FillMeta record={record} />}
      actions={
        record.channel !== 'meeting' && (
          <Button size="lg" variant="secondary" onClick={() => setUnreached(true)}>
            <Icon icon={PhoneOff} size={16} />
            {t(message('Không liên lạc được', 'Could not reach', '연락되지 않음'))}
          </Button>
        )
      }
      bar={
        <CommFormBar problem={problem}>
          <Button size="md" variant="secondary" className={BAR_BUTTON} onClick={save}>
            <Icon icon={Save} size={16} />
            {t(message('Lưu nháp', 'Save draft', '초안 저장'))}
          </Button>
          {at > 0 && (
            <Button size="md" variant="ghost" className={BAR_BUTTON} onClick={() => go(at - 1)}>
              <Icon icon={ArrowLeft} size={16} />
              {t(message('Bước trước', 'Previous step', '이전 단계'))}
            </Button>
          )}
          {at < last && (
            <Button
              size="md"
              className={BAR_BUTTON}
              disabled={gaps[at] !== null}
              onClick={() => go(at + 1)}
            >
              {t(message('Tiếp tục', 'Continue', '계속'))}
              <Icon icon={ArrowRight} size={16} />
            </Button>
          )}
          {at === last && (
            <Button
              size="md"
              className={BAR_BUTTON}
              disabled={blocker !== null || confirm.isPending}
              onClick={submit}
            >
              {t(message('Xác nhận', 'Confirm', '확인'))}
            </Button>
          )}
        </CommFormBar>
      }
    >
      <CommFormSteps
        record={record}
        form={form}
        gaps={gaps}
        ai={
          ai.allowed
            ? {
                content: (
                  <CommAiContent
                    ai={ai}
                    note={form.summary}
                    onNote={form.setSummary}
                    title={form.title}
                    onTitle={form.setTitle}
                  />
                ),
                evaluation: (
                  <>
                    <CommAiStatus ai={ai} />
                    <CommAiEvaluation
                      ai={ai}
                      criteria={form.vocab.data?.criteria ?? []}
                      picked={form.picked}
                      onPick={form.setPicked}
                    />
                  </>
                ),
                nextStep: (
                  <>
                    <CommAiStatus ai={ai} />
                    <CommAiSteps
                      ai={ai}
                      options={close.options.data}
                      draft={form.draft}
                      onDraft={form.setDraft}
                    />
                  </>
                ),
              }
            : undefined
        }
      />
      <CommUnreachedDialog record={record} open={unreached} onClose={() => setUnreached(false)} />
    </CommRecordFrame>
  )
}

/** Kind and direction, time then date, and what is left of the confirm window. */
function FillMeta({ record }: { record: DebriefView }) {
  const anchor = useAnchorTurn(record)
  const hours = confirmHoursLeft(record.createdAt, useMinuteClock())
  return (
    <>
      <span className="tnum">
        {commKindLine(record.channel, anchor?.direction ?? null)} lúc {hm(record.createdAt)},{' '}
        {dmy(record.createdAt)}
      </span>
      {record.late || hours === null ? (
        <CommLateMark late />
      ) : (
        <span className="text-warning tnum inline-flex items-center gap-2 font-medium">
          <Icon icon={Timer} size={16} />
          Còn {hours} giờ để xác nhận
        </span>
      )}
    </>
  )
}
