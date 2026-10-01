import { useState, type Dispatch, type SetStateAction } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { Button, Check, GlassCard, SectionTitle, Skeleton, Textarea, cn } from '@pv/ui'
import {
  DEBRIEF_SUMMARY_MAX,
  type CommVocabularyResponse,
  type DebriefClose,
  type DebriefView,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { ChoiceChip } from '@/components/comm-bits'
import { CommNextStepFields } from '@/components/comm-next-step-fields'
import { Field } from '@/components/field-bits'
import { commVocabularyQuery } from '@/data/comm-vocabulary'
import {
  COMM_CARD_SURFACE,
  EMPTY_STEP_DRAFT,
  evaluationBlockerOf,
  stepBlockerOf,
  stepInputOf,
  subjectKindLabel,
  useConfirmComm,
} from '@/data/comm-record-detail'

/** The confirm form of an open comm, and the evaluation block the mobile log
 *  shares (ADR 0074 §2, 0075 §2). The read view of a done comm is
 *  `CommRecordRead` in `components/comm-record-bits.tsx`.
 *
 *  Filled by hand this turn — AI pre-fill is deferred (ADR 0075 §6), so there
 *  is no AI block here and nothing is proposed on the reader's behalf.
 *  Answers are the admin's words, one per active question, never a score. */

export function ConfirmForm({ record }: { record: DebriefView }) {
  const vocab = useQuery(commVocabularyQuery)
  const confirm = useConfirmComm()
  const target = record.stepTarget
  const current = target?.currentStep ?? null

  const [summary, setSummary] = useState('')
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState(EMPTY_STEP_DRAFT)

  const blocker =
    (summary.trim() === '' ? 'Chưa có tóm tắt.' : null) ??
    evaluationBlockerOf(vocab, picked) ??
    (target ? stepBlockerOf(draft) : null)

  const submit = () => {
    if (blocker || confirm.isPending) return
    const body: DebriefClose = {
      summary: summary.trim(),
      answers: (vocab.data?.criteria ?? []).map((c) => ({
        criterionId: c.id,
        answerId: picked[c.id] ?? '',
      })),
      ...(target && { step: stepInputOf(draft, current) }),
    }
    confirm.mutate({ id: record.id, body }, { onSuccess: () => toastDone('Đã xác nhận comm') })
  }

  return (
    <GlassCard className="flex flex-col gap-6 p-5 lg:p-6" aria-label="Phiếu xác nhận">
      <SectionTitle size="detail">Phiếu xác nhận</SectionTitle>

      <Field label="Tóm tắt" note={`${summary.length}/${DEBRIEF_SUMMARY_MAX}`}>
        <Textarea
          value={summary}
          rows={4}
          autoGrow
          maxLength={DEBRIEF_SUMMARY_MAX}
          aria-label="Tóm tắt"
          onChange={(e) => setSummary(e.target.value)}
        />
      </Field>

      <Evaluation vocab={vocab} picked={picked} onPick={setPicked} />

      {target ? (
        <div className="flex flex-col gap-3">
          <span className="text-muted-foreground text-[11px]">
            Bước tiếp theo · cho {subjectKindLabel(record.subject.code).toLowerCase()}{' '}
            <span className="font-mono">{record.subject.code}</span>
          </span>
          <CommNextStepFields
            current={current}
            kinds={vocab.data?.stepKinds ?? []}
            draft={draft}
            onDraft={setDraft}
          />
        </div>
      ) : (
        <p className="text-muted-foreground text-[12px] leading-[1.6]">
          {subjectKindLabel(record.subject.code)}{' '}
          <span className="font-mono">{record.subject.code}</span> không nhận bước tiếp theo từ comm
          này.
        </p>
      )}

      {(confirm.error || blocker) && (
        <p role={confirm.error ? 'alert' : undefined} className="text-warning text-[12px]">
          {confirm.error ? userMessage(confirm.error) : blocker}
        </p>
      )}

      <Button
        size="lg"
        className="self-end"
        disabled={blocker !== null || confirm.isPending}
        onClick={submit}
      >
        Xác nhận
      </Button>
    </GlassCard>
  )
}

/** One fieldset per active question; the answers are the admin's words. */
export function Evaluation({
  vocab,
  picked,
  onPick,
}: {
  vocab: UseQueryResult<CommVocabularyResponse>
  picked: Record<string, string>
  onPick: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const criteria = vocab.data?.criteria ?? []
  return (
    <div className="flex flex-col gap-3">
      <span className="text-muted-foreground text-[11px]">Đánh giá</span>
      {vocab.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : vocab.error ? (
        <p role="alert" className="text-warning text-[12px]">
          Không tải được bộ câu hỏi.{' '}
          {isApiError(vocab.error) ? userMessage(vocab.error) : 'Tải lại trang.'}
        </p>
      ) : criteria.length === 0 ? (
        <p className="text-muted-foreground text-[12px] leading-[1.6]">
          Chưa có câu hỏi đánh giá nào đang bật — phần này để trống.
        </p>
      ) : (
        criteria.map((c) => (
          <fieldset
            key={c.id}
            className={cn('flex flex-col gap-2 rounded-md p-3', COMM_CARD_SURFACE)}
          >
            <legend className="sr-only">{c.name}</legend>
            <span aria-hidden className="text-[12.5px] font-medium">
              {c.name}
            </span>
            <div className="flex flex-wrap gap-2">
              {c.answers.map((a) => (
                <ChoiceChip
                  key={a.id}
                  pressed={picked[c.id] === a.id}
                  icon={picked[c.id] === a.id ? Check : undefined}
                  onClick={() => onPick((p) => ({ ...p, [c.id]: a.id }))}
                >
                  {a.name}
                </ChoiceChip>
              ))}
            </div>
          </fieldset>
        ))
      )}
    </div>
  )
}
