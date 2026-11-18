import { useId, type Dispatch, type SetStateAction } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Separator } from '@pv/ui'
import type {
  CommAiAnswer,
  CommAiStep,
  CommVocabularyResponse,
  DebriefView,
  StepOptionsResponse,
} from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { dm } from '@/lib/date'
import { CommEvaluation } from '@/components/comm-evaluation'
import { FieldHead } from '@/components/comm-fill-fields'
import { CommNextStepFields } from '@/components/comm-next-step-fields'
import { TemperaturePick } from '@/components/temperature-pick'
import { draftOfAiStep } from '@/data/comm-ai-report'
import { subjectKindLabel, type StepDraft } from '@/data/comm-record-detail'
import type { CloseStep } from '@/data/customer-close'

/** The evaluation and the next step of a comm's fill form. A waiting AI suggestion shows
 *  dim above the fields it would fill: the step's rows are plain, so they cannot be
 *  taken for the real step fields below them. */

const PREVIEW = 'bg-muted flex flex-col gap-2 rounded-md p-3'

const dueLine = (due: string) => message(`trước ${dm(due)}`, `by ${dm(due)}`, `${dm(due)}까지`)

export function FillEvaluation({
  heading,
  vocab,
  picked,
  onPick,
  close,
  preview,
  onDrop,
}: {
  heading: string
  vocab: UseQueryResult<CommVocabularyResponse>
  picked: Record<string, string>
  onPick: Dispatch<SetStateAction<Record<string, string>>>
  close: CloseStep
  /** The answers the draft would give to questions still open; empty when none. */
  preview: readonly CommAiAnswer[]
  onDrop: () => void
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4">
      <FieldHead id={id} label={heading} previewing={preview.length > 0} onDrop={onDrop} />
      {preview.length > 0 && (
        <ul className={`${PREVIEW} m-0 list-none`}>
          {preview.map((a) => (
            <li key={a.criterionId} className="flex items-baseline justify-between gap-4">
              <span className="text-muted-foreground min-w-0 text-[14px]">{a.criterionName}</span>
              <span className="text-muted-foreground shrink-0 text-right text-[14px]">
                {a.answerName}
              </span>
            </li>
          ))}
        </ul>
      )}
      <CommEvaluation vocab={vocab} picked={picked} onPick={onPick} />
      {close.customer && (
        <TemperaturePick value={close.temperature} onPick={close.setTemperature} />
      )}
    </section>
  )
}

export function FillNextStep({
  record,
  heading,
  kinds,
  close,
  draft,
  onDraft,
  steps,
  chosen,
  onChoose,
  options,
  onDrop,
}: {
  record: DebriefView
  heading: string
  kinds: CommVocabularyResponse['stepKinds']
  close: CloseStep
  draft: StepDraft
  onDraft: (next: StepDraft) => void
  /** The draft's steps the frame allows; the box is empty, or this is empty. */
  steps: readonly CommAiStep[]
  chosen: number
  onChoose: (index: number) => void
  options: StepOptionsResponse | undefined
  onDrop: () => void
}) {
  const { t, lang } = useI18n()
  const id = useId()
  const { code } = record.subject
  const shown = options ? steps : []
  const pick = shown[chosen] ?? shown[0]

  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4">
      <FieldHead id={id} label={heading} previewing={pick !== undefined} onDrop={onDrop} />
      {pick && options && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {shown.length === 1 ? (
            <StepRow step={pick} draft={draft} options={options} />
          ) : (
            shown.map((step, i) => {
              const next = draftOfAiStep(step, draft, options)
              return (
                <li key={step.templateId ?? step.text}>
                  <label className="text-muted-foreground pointer-coarse:min-h-12 flex min-w-0 cursor-pointer items-start gap-3 py-1 text-[14px]">
                    <input
                      type="radio"
                      name={`${id}-ai-step`}
                      checked={step === pick}
                      onChange={() => onChoose(i)}
                      className="accent-muted-foreground mt-1 size-4 shrink-0"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="wrap-break-word">{next.text}</span>
                      {next.due !== '' && (
                        <span className="tnum text-[12px]">{t(dueLine(next.due))}</span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })
          )}
        </ul>
      )}
      {close.takesStep ? (
        close.stepShown && (
          <>
            <Separator />
            <CommNextStepFields
              kinds={kinds}
              options={close.options}
              draft={draft}
              onDraft={onDraft}
            />
          </>
        )
      ) : close.target.isPending ? null : (
        <p className="text-muted-foreground m-0 text-[13px] leading-[1.6]">
          {subjectKindLabel(code, lang)} <span className="font-mono">{code}</span>
          {t(
            message(
              ' không nhận bước tiếp theo từ lượt liên hệ này.',
              ' does not accept a next step from this interaction.',
              '에는 이 연락 기록에서 다음 단계를 설정할 수 없습니다.',
            ),
          )}
        </p>
      )}
    </section>
  )
}

function StepRow({
  step,
  draft,
  options,
}: {
  step: CommAiStep
  draft: StepDraft
  options: StepOptionsResponse
}) {
  const { t } = useI18n()
  const next = draftOfAiStep(step, draft, options)
  return (
    <li className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground min-w-0 text-[14px]">{next.text}</span>
      <span className="text-muted-foreground tnum shrink-0 text-right text-[14px]">
        {next.due !== '' && t(dueLine(next.due))}
      </span>
    </li>
  )
}
