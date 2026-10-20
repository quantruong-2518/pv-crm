import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Button, Icon, PhoneOff, Save, Timer, cn } from '@pv/ui'
import type { DebriefClose, DebriefView } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dmy, hm } from '@/lib/date'
import { CommLateMark } from '@/components/comm-bits'
import { CommRecordFrame, CommStepper, type CommStepState } from '@/components/comm-record-frame'
import { CommTurns } from '@/components/comm-turns'
import { CommUnreachedDialog } from '@/components/comm-unreached-dialog'
import { commVocabularyQuery } from '@/data/comm-vocabulary'
import {
  COMM_NOUN,
  commStepTitles,
  useAnchorTurn,
  EMPTY_STEP_DRAFT,
  clearCommDraft,
  commKindLine,
  confirmHoursLeft,
  evaluationBlockerOf,
  readCommDraft,
  stepBlockerOf,
  stepInputOf,
  useConfirmComm,
  writeCommDraft,
} from '@/data/comm-record-detail'
import { useMinuteClock } from '@/data/minute-clock'
import { useStepOptions } from '@/data/next-step'
import { ContentStep, EvaluationStep, NextStepStep } from './comm-record-fill-steps'

/** The owner's fill form for an open comm: three steps, one card at a time,
 *  and a sticky bar that says what the open step still lacks. Next is shut
 *  until the open step is complete, confirm until all three are; the stepper
 *  jumps anywhere. A draft is kept in this browser only; the server stores the
 *  record when the owner confirms (ADR 0074 §2, 0075 §2).
 *
 *  Filled by hand — AI pre-fill is deferred (ADR 0075 §6), so there is no AI
 *  block here and nothing is proposed on the reader's behalf. */

type Problem = { text: string; failed?: boolean } | null

export function CommFillWorkspace({ record }: { record: DebriefView }) {
  const vocab = useQuery(commVocabularyQuery)
  const confirm = useConfirmComm()
  const target = record.stepTarget
  const options = useStepOptions(target?.kind ?? null, record.subject.code)
  const saved = useMemo(() => readCommDraft(record.id), [record.id])
  const [title, setTitle] = useState(saved?.title ?? '')
  const [summary, setSummary] = useState(saved?.summary ?? '')
  const [picked, setPicked] = useState<Record<string, string>>(saved?.picked ?? {})
  const [draft, setDraft] = useState(saved?.step ?? EMPTY_STEP_DRAFT)
  const [at, setAt] = useState(0)
  const [unreached, setUnreached] = useState(false)

  const missing = [title.trim() === '' && 'tiêu đề', summary.trim() === '' && 'ghi chú'].filter(
    (word): word is string => word !== false,
  )
  const contentGap = missing.length > 0 ? `Còn thiếu ${missing.join(' và ')}` : null
  const evaluationGap = evaluationBlockerOf(vocab, picked)
  const stepGap = target ? stepBlockerOf(draft, options) : null
  /* One gap per step, in the order of `titles`; the bar says the open one's. */
  const gaps = [contentGap, evaluationGap, stepGap]
  const blocker = gaps.find((gap) => gap !== null) ?? null
  const titles = commStepTitles(record)
  const last = titles.length - 1
  const states = titles.map<CommStepState>((_, i) =>
    i === at ? 'current' : gaps[i] === null ? 'done' : 'todo',
  )

  const criteria = vocab.data?.criteria ?? []
  const go = (index: number) => {
    setAt(index)
    window.scrollTo({ top: 0 })
  }
  const save = () => {
    writeCommDraft(record.id, { title, summary, picked, step: draft })
    toastDone('Đã lưu nháp trên máy này')
  }
  const submit = () => {
    if (blocker || confirm.isPending) return
    const body: DebriefClose = {
      title: title.trim(),
      summary: summary.trim(),
      answers: criteria.map((c) => ({ criterionId: c.id, answerId: picked[c.id] ?? '' })),
      ...(target && { step: stepInputOf(draft, options.data) }),
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
  const problem: Problem =
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
        <FillBar
          problem={problem}
          onSave={save}
          onBack={at > 0 ? () => go(at - 1) : undefined}
          onNext={at < last ? () => go(at + 1) : undefined}
          nextReady={gaps[at] === null}
          onConfirm={at === last ? submit : undefined}
          confirmReady={blocker === null && !confirm.isPending}
        />
      }
    >
      <CommStepper labels={titles} states={states} onGo={go} />
      {at === 0 && <CommTurns threadId={record.threadId} />}
      {at === 0 && (
        <ContentStep
          record={record}
          heading={titles[0]}
          title={title}
          summary={summary}
          onTitle={setTitle}
          onSummary={setSummary}
        />
      )}
      {at === 1 && (
        <EvaluationStep heading={titles[1]} vocab={vocab} picked={picked} onPick={setPicked} />
      )}
      {at === 2 && (
        <NextStepStep
          record={record}
          heading={titles[2]}
          kinds={vocab.data?.stepKinds ?? []}
          options={options}
          draft={draft}
          onDraft={setDraft}
        />
      )}
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

/** Sticky under the open card. Lifted over the bottom nav on a phone; on a
 *  laptop narrow enough that the column meets the assistant button, it stops
 *  short of it. */
function FillBar({
  problem,
  onSave,
  onBack,
  onNext,
  nextReady,
  onConfirm,
  confirmReady,
}: {
  problem: Problem
  onSave: () => void
  onBack?: () => void
  onNext?: () => void
  nextReady: boolean
  onConfirm?: () => void
  confirmReady: boolean
}) {
  const button = 'pointer-coarse:h-12'
  return (
    <div
      role="group"
      aria-label="Thao tác liên hệ"
      className="glass-overlay sticky bottom-[calc(84px+env(safe-area-inset-bottom)+12px)] z-20 flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 lg:bottom-6 lg:max-xl:w-[calc(100%-72px)]"
    >
      <div className="flex min-w-0 flex-1 basis-64 flex-col">
        {problem && (
          <>
            <strong
              role={problem.failed ? 'alert' : undefined}
              className={cn(
                'text-[13px] font-semibold leading-[1.5]',
                problem.failed ? 'text-destructive-foreground' : 'text-warning',
              )}
            >
              {problem.text}
            </strong>
          </>
        )}
      </div>
      <Button size="md" variant="secondary" className={button} onClick={onSave}>
        <Icon icon={Save} size={16} />
        Lưu nháp
      </Button>
      {onBack && (
        <Button size="md" variant="ghost" className={button} onClick={onBack}>
          <Icon icon={ArrowLeft} size={16} />
          Bước trước
        </Button>
      )}
      {onNext && (
        <Button size="md" className={button} disabled={!nextReady} onClick={onNext}>
          Tiếp tục
          <Icon icon={ArrowRight} size={16} />
        </Button>
      )}
      {onConfirm && (
        <Button size="md" className={button} disabled={!confirmReady} onClick={onConfirm}>
          Xác nhận
        </Button>
      )}
    </div>
  )
}
