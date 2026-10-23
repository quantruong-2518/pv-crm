import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Button, Icon, PhoneOff, Save, Timer } from '@pv/ui'
import type { DebriefClose, DebriefView } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dmy, hm } from '@/lib/date'
import { CommLateMark } from '@/components/comm-bits'
import { CommRecordFrame } from '@/components/comm-record-frame'
import { CommUnreachedDialog } from '@/components/comm-unreached-dialog'
import {
  COMM_NOUN,
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

/** The owner's fill form for an open comm: three steps, one card at a time,
 *  and a sticky bar that says what the open step still lacks. Next is shut
 *  until the open step is complete, confirm until all three are; the stepper
 *  jumps anywhere. A draft is kept in this browser only; the server stores the
 *  record when the owner confirms (ADR 0074 §2, 0075 §2).
 *
 *  Filled by hand — AI pre-fill is deferred (ADR 0075 §6), so there is no AI
 *  block here and nothing is proposed on the reader's behalf. */

export function CommFillWorkspace({ record }: { record: DebriefView }) {
  const confirm = useConfirmComm()
  const saved = useMemo(() => readCommDraft(record.id), [record.id])
  const form = useCommForm(record, saved ?? EMPTY_COMM_DRAFT)
  const { close, at, go, titles } = form
  const [unreached, setUnreached] = useState(false)

  /* One gap per step, in the order of `titles`; the bar says the open one's. */
  const gaps = [form.contentGap, form.answersGap ?? close.temperatureGap, close.gapOf(form.draft)]
  const blocker = gaps.find((gap) => gap !== null) ?? null
  const last = titles.length - 1

  const save = () => {
    const { title, summary, picked, draft } = form
    writeCommDraft(record.id, { title, summary, picked, step: draft })
    toastDone('Đã lưu nháp trên máy này')
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
          toastDone('Đã xác nhận liên hệ')
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
      title={`Ghi lại ${COMM_NOUN[record.channel]}`}
      meta={<FillMeta record={record} />}
      actions={
        record.channel !== 'meeting' && (
          <Button size="lg" variant="secondary" onClick={() => setUnreached(true)}>
            <Icon icon={PhoneOff} size={16} />
            Không liên lạc được
          </Button>
        )
      }
      bar={
        <CommFormBar problem={problem}>
          <Button size="md" variant="secondary" className={BAR_BUTTON} onClick={save}>
            <Icon icon={Save} size={16} />
            Lưu nháp
          </Button>
          {at > 0 && (
            <Button size="md" variant="ghost" className={BAR_BUTTON} onClick={() => go(at - 1)}>
              <Icon icon={ArrowLeft} size={16} />
              Bước trước
            </Button>
          )}
          {at < last && (
            <Button
              size="md"
              className={BAR_BUTTON}
              disabled={gaps[at] !== null}
              onClick={() => go(at + 1)}
            >
              Tiếp tục
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
              Xác nhận
            </Button>
          )}
        </CommFormBar>
      }
    >
      <CommFormSteps record={record} form={form} gaps={gaps} />
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
