import { useId, type Dispatch, type SetStateAction } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
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
import { COMM_NOUN, subjectKindLabel, type StepDraft } from '@/data/comm-record-detail'
import type { CloseStep } from '@/data/customer-close'

/** The three cards of the owner's fill form on `/comms/:id`, one shown at a
 *  time by `CommFillWorkspace`. Each card only draws and reports; the form's
 *  state and what is still missing live in the workspace. */

const COUNT = new Intl.NumberFormat('vi-VN')

export function ContentStep({
  record,
  title,
  heading,
  summary,
  onTitle,
  onSummary,
}: {
  record: DebriefView
  title: string
  summary: string
  heading: string
  onTitle: (title: string) => void
  onSummary: (summary: string) => void
}) {
  const titleId = useId()
  const summaryId = useId()
  return (
    <CommStepCard index={0} title={heading}>
      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={titleId} className={STEP_LABEL}>
          Tiêu đề
        </label>
        <Input
          id={titleId}
          value={title}
          maxLength={DEBRIEF_TITLE_MAX}
          placeholder="Ví dụ: Chốt lịch khảo sát nhà xưởng"
          className="h-12 text-[14px]"
          onChange={(e) => onTitle(e.target.value)}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={summaryId} className={STEP_LABEL}>
          Ghi chú {COMM_NOUN[record.channel]}
        </label>
        <Textarea
          id={summaryId}
          rows={6}
          autoGrow
          value={summary}
          maxLength={DEBRIEF_SUMMARY_MAX}
          placeholder="Khách nói gì, hai bên đã thống nhất gì"
          className="min-h-40 text-[14px]"
          onChange={(e) => onSummary(e.target.value)}
        />
        <span className="text-muted-foreground tnum self-end text-[12px]">
          {COUNT.format(summary.length)} / {COUNT.format(DEBRIEF_SUMMARY_MAX)} ký tự
        </span>
      </div>
      <Separator />
      <div className="flex min-w-0 flex-col gap-3">
        <span className={STEP_LABEL}>
          Ghi âm và tệp đính kèm{' '}
          <span className="text-muted-foreground font-normal">· không bắt buộc</span>
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
}: {
  heading: string
  vocab: UseQueryResult<CommVocabularyResponse>
  picked: Record<string, string>
  onPick: Dispatch<SetStateAction<Record<string, string>>>
  close: CloseStep
}) {
  return (
    <CommStepCard index={1} title={heading}>
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
}: {
  record: DebriefView
  heading: string
  kinds: CommVocabularyResponse['stepKinds']
  close: CloseStep
  draft: StepDraft
  onDraft: (next: StepDraft) => void
}) {
  const { code } = record.subject
  return (
    <CommStepCard index={2} title={heading}>
      {close.takesStep ? (
        close.stepShown && (
          <CommNextStepFields
            kinds={kinds}
            options={close.options}
            draft={draft}
            onDraft={onDraft}
          />
        )
      ) : close.target.isPending ? null : (
        <p className="text-muted-foreground m-0 text-[13px] leading-[1.6]">
          {subjectKindLabel(code)} <span className="font-mono">{code}</span> không nhận bước tiếp
          theo từ lượt liên hệ này.
        </p>
      )}
    </CommStepCard>
  )
}
