import { useId, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { message, useI18n } from '@/app/i18n'
import { Input, Separator, Textarea } from '@pv/ui'
import {
  DEBRIEF_SUMMARY_MAX,
  DEBRIEF_TITLE_MAX,
  type CommVocabularyResponse,
  type DebriefView,
} from '@pv/contracts'
import { CommEvaluation } from '@/components/comm-evaluation'
import { CommFileDrop, CommFileList } from '@/components/comm-files'
import { CommNextStepFields, STEP_LABEL } from '@/components/comm-next-step-fields'
import { CommStepCard } from '@/components/comm-record-frame'
import { TemperaturePick } from '@/components/temperature-pick'
import { commNoun, subjectKindLabel, type StepDraft } from '@/data/comm-record-detail'
import type { CloseStep } from '@/data/customer-close'

/** The three cards of the owner's form on `/comms/:id`, one shown at a time
 *  by `CommFormSteps` — first fill and later edit alike. Each card only draws
 *  and reports; the form's state lives in `useCommForm`. */

export function ContentStep({
  record,
  title,
  heading,
  summary,
  onTitle,
  onSummary,
  fileNote,
  aid,
}: {
  record: DebriefView
  /** Null hides the field. */
  title: string | null
  summary: string
  heading: string
  onTitle: (title: string) => void
  onSummary: (summary: string) => void
  /** The grey words after the files label. */
  fileNote?: string
  /** Under the note box: the AI report on a first fill (ADR 0132). */
  aid?: ReactNode
}) {
  const { t, number } = useI18n()
  const titleId = useId()
  const summaryId = useId()
  return (
    <CommStepCard index={0} title={heading}>
      {title !== null && (
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={titleId} className={STEP_LABEL}>
            {t(message('Tiêu đề', 'Title', '제목'))}
          </label>
          <Input
            id={titleId}
            value={title}
            maxLength={DEBRIEF_TITLE_MAX}
            placeholder={t(
              message(
                'Ví dụ: Chốt lịch khảo sát nhà xưởng',
                'For example: Schedule a factory visit',
                '예: 공장 방문 일정 확정',
              ),
            )}
            className="h-12 text-[14px]"
            onChange={(e) => onTitle(e.target.value)}
          />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={summaryId} className={STEP_LABEL}>
          {t(
            message(
              `Ghi chú ${commNoun(record.channel, 'vi')}`,
              `${commNoun(record.channel, 'en')} notes`,
              `${commNoun(record.channel, 'ko')} 메모`,
            ),
          )}
        </label>
        <Textarea
          id={summaryId}
          rows={6}
          autoGrow
          value={summary}
          maxLength={DEBRIEF_SUMMARY_MAX}
          placeholder={t(
            message(
              'Khách nói gì, hai bên đã thống nhất gì',
              'What the customer said and what you agreed on',
              '고객의 의견과 양측이 합의한 내용을 적어 주세요',
            ),
          )}
          className="min-h-40 text-[14px]"
          onChange={(e) => onSummary(e.target.value)}
        />
        <span className="text-muted-foreground tnum self-end text-[12px]">
          {number(summary.length)} / {number(DEBRIEF_SUMMARY_MAX)}{' '}
          {t(message('ký tự', 'characters', '자'))}
        </span>
      </div>
      {aid}
      <Separator />
      <div className="flex min-w-0 flex-col gap-3">
        <span className={STEP_LABEL}>
          {t(message('Ghi âm và tệp đính kèm', 'Recording and attachments', '녹음 및 첨부 파일'))}{' '}
          <span className="text-muted-foreground font-normal">
            · {fileNote ?? t(message('không bắt buộc', 'optional', '선택 사항'))}
          </span>
        </span>
        <CommFileDrop id={record.id} />
        <CommFileList id={record.id} canDelete />
      </div>
    </CommStepCard>
  )
}

export function EvaluationStep({
  heading,
  vocab,
  picked,
  onPick,
  close,
  aid,
}: {
  heading: string
  vocab: UseQueryResult<CommVocabularyResponse>
  picked: Record<string, string>
  onPick: Dispatch<SetStateAction<Record<string, string>>>
  close: CloseStep
  aid?: ReactNode
}) {
  return (
    <CommStepCard index={1} title={heading}>
      {aid}
      <CommEvaluation vocab={vocab} picked={picked} onPick={onPick} />
      {close.customer && (
        <TemperaturePick value={close.temperature} onPick={close.setTemperature} />
      )}
    </CommStepCard>
  )
}

export function NextStepStep({
  record,
  heading,
  kinds,
  close,
  draft,
  onDraft,
  aid,
}: {
  record: DebriefView
  heading: string
  kinds: CommVocabularyResponse['stepKinds']
  close: CloseStep
  draft: StepDraft
  onDraft: (next: StepDraft) => void
  /** Over the step fields, and only while they show. */
  aid?: ReactNode
}) {
  const { t, lang } = useI18n()
  const { code } = record.subject
  return (
    <CommStepCard index={2} title={heading}>
      {close.takesStep ? (
        close.stepShown && (
          <>
            {aid}
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
    </CommStepCard>
  )
}
