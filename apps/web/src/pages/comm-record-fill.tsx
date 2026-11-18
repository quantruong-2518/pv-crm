import { useMemo, useState } from 'react'
import { Button, GlassCard, Icon, PhoneOff, Save, Separator, Timer, cn } from '@pv/ui'
import type { DebriefClose, DebriefView } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dmy, hm } from '@/lib/date'
import { CommAiBlock, FILL_DRAFT } from '@/components/comm-ai-block'
import { CommAiMinutes } from '@/components/comm-ai-minutes'
import { CommLateMark } from '@/components/comm-bits'
import { CommCallPanel } from '@/components/comm-call-panel'
import { FillNote, FillTitle } from '@/components/comm-fill-fields'
import { FillEvaluation, FillNextStep } from '@/components/comm-fill-sections'
import { CommRecordFrame } from '@/components/comm-record-frame'
import { CommUnreachedDialog } from '@/components/comm-unreached-dialog'
import { useCommAiReport } from '@/data/comm-ai-report'
import { clearSettled } from '@/data/comm-ai-settled'
import { useFillDraft } from '@/data/comm-fill-draft'
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
import { BAR_BUTTON, CommFormBar, type FormProblem } from './comm-record-form'

const TEXT = {
  draftSavedOnThisDevice: message(
    'Đã lưu nháp trên máy này',
    'Draft saved on this device',
    '이 기기에 초안을 저장했습니다',
  ),
  suggestionsWait: message(
    'Còn gợi ý AI chưa điền.',
    'AI suggestions are still unfilled.',
    '채우지 않은 AI 제안이 있습니다.',
  ),
}

/** The owner's fill form for an open comm: one page, the form beside what the
 *  call holds, and a sticky bar that says what still blocks the confirm. A draft
 *  is kept in this browser only; the server stores the record when the owner
 *  confirms (ADR 0074 §2, 0075 §2).
 *
 *  AI proposes on a press and waits for another (ADR 0132): its suggestions show
 *  dim beside the fields, and only the fill button moves them into the fields. */

export function CommFillWorkspace({ record }: { record: DebriefView }) {
  const { t } = useI18n()
  const confirm = useConfirmComm()
  const saved = useMemo(() => readCommDraft(record.id), [record.id])
  const form = useCommForm(record, saved ?? EMPTY_COMM_DRAFT)
  const ai = useCommAiReport(record)
  const { close, titles } = form
  const [unreached, setUnreached] = useState(false)
  const [chosen, setChosen] = useState(0)
  const options = close.options.data
  const noteWord = t(ai.words.note)

  const { plan, fill } = useFillDraft(form, ai, options, chosen)

  const gaps = [form.contentGap, form.answersGap ?? close.temperatureGap, close.gapOf(form.draft)]
  const gap = gaps.find((g) => g !== null) ?? null
  const waiting = plan !== null

  const save = () => {
    const { title, summary, picked, draft } = form
    writeCommDraft(record.id, { title, summary, picked, step: draft })
    toastDone(t(TEXT.draftSavedOnThisDevice))
  }
  const submit = () => {
    if (gap || waiting || confirm.isPending) return
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
          clearSettled(record.id)
          toastDone(
            t(message('Đã xác nhận liên hệ', 'Interaction confirmed', '연락 기록을 확인했습니다')),
          )
        },
      },
    )
  }

  const problem: FormProblem = confirm.error
    ? { text: userMessage(confirm.error), failed: true }
    : waiting
      ? { text: t(TEXT.suggestionsWait) }
      : gap === null
        ? null
        : { text: gap }

  return (
    <CommRecordFrame
      wide
      stateBadge={false}
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
          <Button size="lg" variant="ghost" onClick={() => setUnreached(true)}>
            <Icon icon={PhoneOff} size={16} />
            {t(message('Không liên lạc được', 'Could not reach', '연락되지 않음'))}
          </Button>
        )
      }
      bar={
        <CommFormBar problem={problem}>
          <Button size="md" variant="ghost" className={BAR_BUTTON} onClick={save}>
            <Icon icon={Save} size={16} />
            {t(message('Lưu nháp', 'Save draft', '초안 저장'))}
          </Button>
          {waiting && (
            <Button size="md" className={cn(BAR_BUTTON, 'lg:hidden')} onClick={fill}>
              {t(FILL_DRAFT)}
            </Button>
          )}
          <Button
            size="md"
            variant={waiting ? 'secondary' : 'default'}
            className={cn(BAR_BUTTON, waiting && 'max-lg:hidden')}
            disabled={gap !== null || waiting || confirm.isPending}
            onClick={submit}
          >
            {t(message('Xác nhận', 'Confirm', '확인'))}
          </Button>
        </CommFormBar>
      }
    >
      <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {ai.allowed && (
            <CommAiBlock ai={ai} note={form.summary} waiting={waiting} onFill={fill} />
          )}
          <GlassCard className="flex min-w-0 flex-col gap-8 p-5 sm:p-6">
            <FillTitle
              title={form.title}
              onTitle={form.setTitle}
              preview={plan?.title}
              onDrop={() => ai.dropPart('title')}
            />
            <FillNote
              record={record}
              summary={form.summary}
              onSummary={form.setSummary}
              noteWord={noteWord}
              preview={plan?.note}
              onDrop={() => ai.dropPart('note')}
              onRestore={
                ai.canRestore ? () => form.setSummary(ai.restoreNote(form.summary)) : undefined
              }
            />
            <Separator />
            <FillEvaluation
              heading={titles[1] ?? ''}
              vocab={form.vocab}
              picked={form.picked}
              onPick={form.setPicked}
              close={close}
              preview={plan?.answers ?? []}
              onDrop={() => ai.dropPart('answers')}
            />
            <Separator />
            <FillNextStep
              record={record}
              heading={titles[2] ?? ''}
              kinds={form.vocab.data?.stepKinds ?? []}
              close={close}
              draft={form.draft}
              onDraft={form.setDraft}
              steps={plan?.steps ?? []}
              chosen={chosen}
              onChoose={setChosen}
              options={options}
              onDrop={() => ai.dropPart('step')}
            />
          </GlassCard>
        </div>
        <div className="min-w-0 lg:w-[360px] lg:shrink-0">
          <CommCallPanel record={record} minutes={<CommAiMinutes ai={ai} waiting={waiting} />} />
        </div>
      </div>
      <CommUnreachedDialog record={record} open={unreached} onClose={() => setUnreached(false)} />
    </CommRecordFrame>
  )
}

/** Kind and direction, time then date, and what is left of the confirm window. */
function FillMeta({ record }: { record: DebriefView }) {
  const { t, lang } = useI18n()
  const anchor = useAnchorTurn(record)
  const hours = confirmHoursLeft(record.createdAt, useMinuteClock())
  const kind = commKindLine(record.channel, anchor?.direction ?? null, lang)
  return (
    <>
      <span className="tnum">
        {t(
          message(
            `${kind} lúc ${hm(record.createdAt)}, ${dmy(record.createdAt)}`,
            `${kind} at ${hm(record.createdAt)}, ${dmy(record.createdAt)}`,
            `${kind} · ${dmy(record.createdAt)} ${hm(record.createdAt)}`,
          ),
        )}
      </span>
      {record.late || hours === null ? (
        <CommLateMark late />
      ) : (
        <span className="text-warning tnum inline-flex items-center gap-2 font-medium">
          <Icon icon={Timer} size={16} />
          {t(
            message(
              `Còn ${hours} giờ để xác nhận`,
              `${hours} hr left to confirm`,
              `확인까지 ${hours}시간 남음`,
            ),
          )}
        </span>
      )}
    </>
  )
}
