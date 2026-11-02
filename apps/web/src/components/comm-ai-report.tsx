import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { AiAction, AiChoices, Button, Checkbox, Icon, Orbit, RotateCcw, Textarea } from '@pv/ui'
import type { CommAiPart, CommVocabularyResponse, StepOptionsResponse } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { dm } from '@/lib/date'
import {
  answersOnOffer,
  draftOfAiStep,
  stepsOnOffer,
  type CommAiReportState,
} from '@/data/comm-ai-report'
import type { StepDraft } from '@/data/comm-record-detail'

/** The AI report on a comm's form (ADR 0132): the two buttons under the note,
 *  then one AI block per part, each set where that part is filled in. A block
 *  only proposes; its button is what moves anything into the form.
 *
 *  Long text, so every block is the panel: a strip keeps the button in the row
 *  and leaves the words a narrow column on a phone. */

const TOUCH = 'pointer-coarse:h-12'
/** `AiAction` draws its own 40px button; this lifts it to 48px on touch (law 13).
 *  The wrap is for file names and URLs in the basis line, which have no break. */
const BLOCK = 'wrap-break-word pointer-coarse:[&_button]:h-12'

const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

function AskButton({
  ai,
  part,
  note,
  children,
}: {
  ai: CommAiReportState
  part: CommAiPart
  note: string
  children: ReactNode
}) {
  const { t } = useI18n()
  return (
    <Button
      type="button"
      variant="secondary"
      className={TOUCH}
      disabled={ai.asking !== null || (ai.needsNotice && !ai.notice)}
      onClick={() => ai.ask(part, note)}
    >
      <Icon icon={Orbit} size={16} />
      {ai.asking === part ? t(message('Đang tạo…', 'Generating…', '생성 중…')) : children}
    </Button>
  )
}

/** Under the buttons, and over the other cards too: the stepper can leave the
 *  first card while a press runs, and the answer lands where nobody is looking. */
export function CommAiStatus({ ai }: { ai: CommAiReportState }) {
  const { t } = useI18n()
  if (ai.asking) {
    return (
      <p role="status" className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        {ai.listening
          ? t(
              message(
                'AI đang nghe ghi âm, mất vài phút.',
                'AI is listening to the recording. This takes a few minutes.',
                'AI가 녹음을 듣는 중입니다. 몇 분 걸립니다.',
              ),
            )
          : t(
              message(
                'AI đang đọc, có thể mất tới một phút.',
                'The AI is reading. This can take up to a minute.',
                'AI가 읽는 중입니다. 최대 1분 정도 걸릴 수 있습니다.',
              ),
            )}
      </p>
    )
  }
  if (!ai.error) return null
  return (
    <p role="alert" className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]">
      {ai.error}
    </p>
  )
}

export function CommAiContent({
  ai,
  note,
  onNote,
  title,
  onTitle,
}: {
  ai: CommAiReportState
  note: string
  onNote: (note: string) => void
  /** Absent on a booked meeting, which keeps no title of its own. */
  title?: string
  onTitle?: (title: string) => void
}) {
  const { t } = useI18n()
  const noteWord = t(ai.words.note)
  const take = () => {
    if (!ai.report) return
    ai.summaryTaken(note)
    onNote(ai.report.summary)
    if (ai.report.title && title?.trim() === '') onTitle?.(ai.report.title)
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {ai.needsNotice && (
        <Checkbox
          className="pointer-coarse:min-h-12 -mx-3"
          wrap
          checked={ai.notice}
          onChange={ai.setNotice}
          /* Three languages: an attestation must be readable by whoever gives it. */
          label={t(
            message(
              'Tôi xác nhận mọi người trong ghi âm đã được báo trước',
              'I confirm everyone on the recording was told beforehand',
              '녹음에 포함된 모든 사람에게 미리 알렸음을 확인합니다',
            ),
          )}
        />
      )}
      <div className="flex flex-wrap gap-2 empty:hidden">
        {ai.canAsk && (
          <>
            <AskButton ai={ai} part="summary" note={note}>
              {t(message('Tạo tóm tắt', 'Create summary', '요약 생성'))}
            </AskButton>
            <AskButton ai={ai} part="minutes" note={note}>
              {t(message('Tạo biên bản', 'Create minutes', '회의록 생성'))}
            </AskButton>
          </>
        )}
        {ai.canRestore && (
          <Button
            type="button"
            variant="ghost"
            className={TOUCH}
            onClick={() => onNote(ai.restoreNote(note))}
          >
            <Icon icon={RotateCcw} size={16} />
            {t(
              message(
                `Lấy lại ${noteWord} cũ`,
                `Restore previous ${noteWord}`,
                `이전 ${noteWord} 복원`,
              ),
            )}
          </Button>
        )}
        {ai.canRestoreMinutes && (
          <Button type="button" variant="ghost" className={TOUCH} onClick={ai.restoreMinutes}>
            <Icon icon={RotateCcw} size={16} />
            {t(message('Lấy lại biên bản đã sửa', 'Restore edited minutes', '수정한 회의록 복원'))}
          </Button>
        )}
      </div>
      <CommAiStatus ai={ai} />
      {ai.report && ai.part === 'summary' && (
        <AiAction
          variant="panel"
          className={BLOCK}
          suggestion={
            <>
              {ai.report.title && (
                <strong className="mb-2 block font-semibold">{ai.report.title}</strong>
              )}
              <span className="block whitespace-pre-line">{ai.report.summary}</span>
            </>
          }
          basis={ai.basis}
          empty={
            ai.summaryUsed
              ? t(
                  message(
                    `Ô ${noteWord} đang khác bản này.`,
                    `The ${noteWord} field differs from this version.`,
                    `${noteWord} 입력란이 이 버전과 다릅니다.`,
                  ),
                )
              : t(
                  message(
                    `Chưa điền gì. ${capitalized(noteWord)} của bạn vẫn giữ nguyên.`,
                    `Nothing filled in yet. Your ${noteWord} is unchanged.`,
                    `아직 입력된 내용이 없습니다. 작성하신 ${noteWord}은(는) 그대로입니다.`,
                  ),
                )
          }
          confirmLabel={t(message('Dùng bản này', 'Use this version', '이 버전 사용'))}
          done={ai.summaryUsed && note.trim() === ai.report.summary.trim()}
          doneLabel={t(message('Đã điền vào ô', 'Added to the field', '입력란에 반영됨'))}
          onConfirm={take}
        />
      )}
      {ai.report && ai.part === 'minutes' && (
        <AiAction
          variant="panel"
          className={BLOCK}
          suggestion={<MinutesBox ai={ai} />}
          basis={ai.basis}
          empty={
            ai.minutesChangedSinceSave
              ? t(
                  message(
                    'Chưa lưu phần vừa sửa.',
                    'The latest edits are not saved.',
                    '방금 수정한 내용이 저장되지 않았습니다.',
                  ),
                )
              : t(
                  message(
                    'Chưa lưu biên bản.',
                    'The minutes are not saved.',
                    '회의록이 저장되지 않았습니다.',
                  ),
                )
          }
          confirmLabel={t(
            message('Lưu vào tệp đính kèm', 'Save as attachment', '첨부 파일로 저장'),
          )}
          done={ai.minutesSaved}
          doneLabel={t(message('Đã lưu', 'Saved', '저장됨'))}
          onConfirm={ai.saveMinutes}
        />
      )}
    </div>
  )
}

/** `Textarea` brings its own opaque `bg-input` and `text-foreground`, so the tint
 *  behind it cannot lower its contrast. `AiAction` has no disabled state, so
 *  saving and a refused save are said here. */
function MinutesBox({ ai }: { ai: CommAiReportState }) {
  const { t } = useI18n()
  return (
    <span className="flex flex-col gap-2">
      <Textarea
        rows={10}
        autoGrow
        value={ai.minutes}
        aria-label={t(message('Biên bản', 'Minutes', '회의록'))}
        className="max-h-[60dvh] overflow-y-auto text-[14px]"
        onChange={(e) => ai.setMinutes(e.target.value)}
      />
      {ai.savingMinutes && (
        <span role="status" className="text-on-tint-primary-muted text-[12.5px]">
          {t(message('Đang lưu…', 'Saving…', '저장 중…'))}
        </span>
      )}
      {ai.saveProblem && (
        <span role="alert" className="text-on-tint-destructive text-[12.5px] leading-[1.6]">
          {ai.saveProblem}
        </span>
      )}
    </span>
  )
}

export function CommAiEvaluation({
  ai,
  criteria,
  picked,
  onPick,
}: {
  ai: CommAiReportState
  criteria: CommVocabularyResponse['criteria']
  picked: Record<string, string>
  onPick: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const { t } = useI18n()
  const rows = answersOnOffer(ai.report?.answers ?? [], criteria, picked)
  if (!ai.report || rows.length === 0) return null

  return (
    <AiAction
      variant="panel"
      className={BLOCK}
      suggestion={
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((a) => (
            <li key={a.criterionId}>
              <span className="text-on-tint-primary-muted block text-[12px]">
                {a.criterionName}
              </span>
              <strong className="font-semibold">{a.answerName}</strong>
            </li>
          ))}
        </ul>
      }
      basis={ai.basis}
      empty={t(
        message(
          'Chưa điền gì. Câu trả lời của bạn vẫn giữ nguyên.',
          'Nothing filled in yet. Your answers are unchanged.',
          '아직 입력된 내용이 없습니다. 작성하신 답변은 그대로입니다.',
        ),
      )}
      confirmLabel={t(
        message(
          `Dùng ${t(ai.words.evaluation)} này`,
          `Use this ${t(ai.words.evaluation)}`,
          `이 ${t(ai.words.evaluation)} 사용`,
        ),
      )}
      done={rows.every((a) => picked[a.criterionId] === a.answerId)}
      doneLabel={t(message('Đã điền vào ô', 'Added to the field', '입력란에 반영됨'))}
      /* The person's own answers spread last: a question answered while the
         report ran stays as they left it. */
      onConfirm={() =>
        onPick((now) => ({
          ...Object.fromEntries(rows.map((a) => [a.criterionId, a.answerId])),
          ...now,
        }))
      }
    />
  )
}

export function CommAiSteps({
  ai,
  options,
  draft,
  onDraft,
}: {
  ai: CommAiReportState
  /** The frame the step fields read; undefined until it is. */
  options: StepOptionsResponse | undefined
  draft: StepDraft
  onDraft: (next: StepDraft) => void
}) {
  const { t } = useI18n()
  if (!ai.report || !options) return null
  const steps = stepsOnOffer(ai.report.steps, options)
  if (steps.length === 0) return null

  return (
    <AiChoices
      choices={steps.map((step) => {
        const next = draftOfAiStep(step, draft, options)
        return {
          key: step.templateId ?? step.text,
          label: next.text,
          hint: (
            <>
              {next.due !== '' && (
                <span className="tnum block">
                  {t(
                    message(
                      `Làm trước ngày ${dm(next.due)}`,
                      `Do by ${dm(next.due)}`,
                      `${dm(next.due)}까지 처리`,
                    ),
                  )}
                </span>
              )}
              <span className="block">{step.reason}</span>
            </>
          ),
          picked: draft.text === next.text && draft.kindId === next.kindId,
          onPick: () => onDraft(next),
        }
      })}
      basis={ai.basis}
      empty={t(message('Chưa chọn bước nào.', 'No step chosen yet.', '선택한 단계가 없습니다.'))}
      pickLabel={t(message('Chọn bước này', 'Choose this step', '이 단계 선택'))}
      pickedLabel={t(message('Đã điền vào ô', 'Added to the field', '입력란에 반영됨'))}
    />
  )
}
