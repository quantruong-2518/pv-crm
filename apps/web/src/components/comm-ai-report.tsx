import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { AiAction, Button, Icon, Orbit, RotateCcw, Textarea } from '@pv/ui'
import type { CommVocabularyResponse, StepOptionsResponse } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { dm } from '@/lib/date'
import {
  answersOnOffer,
  draftOfAiStep,
  stepsOnOffer,
  type CommAiPart,
  type CommAiReportState,
} from '@/data/comm-ai-report'
import type { StepDraft } from '@/data/comm-record-detail'

/** The AI report on a comm's form (ADR 0132): the two buttons under the note,
 *  then one `AiAction` per part, each set where that part is filled in. A block
 *  only proposes; its confirm button is what moves anything into the form.
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
  return (
    <Button
      type="button"
      variant="secondary"
      className={TOUCH}
      disabled={ai.asking !== null}
      onClick={() => ai.ask(part, note)}
    >
      <Icon icon={Orbit} size={16} />
      {ai.asking === part ? 'Đang tạo…' : children}
    </Button>
  )
}

/** Under the buttons, and over the other cards too: the stepper can leave the
 *  first card while a press runs, and the answer lands where nobody is looking. */
export function CommAiStatus({ ai }: { ai: CommAiReportState }) {
  if (ai.asking) {
    return (
      <p role="status" className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        AI đang đọc, có thể mất tới một phút.
      </p>
    )
  }
  if (!ai.error) return null
  return (
    <p role="alert" className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]">
      {userMessage(ai.error)}
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
  const take = () => {
    if (!ai.report) return
    ai.summaryTaken(note)
    onNote(ai.report.summary)
    if (ai.report.title && title?.trim() === '') onTitle?.(ai.report.title)
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <AskButton ai={ai} part="summary" note={note}>
          Tạo tóm tắt
        </AskButton>
        <AskButton ai={ai} part="minutes" note={note}>
          Tạo biên bản
        </AskButton>
        {ai.canRestore && (
          <Button
            type="button"
            variant="ghost"
            className={TOUCH}
            onClick={() => onNote(ai.restoreNote())}
          >
            <Icon icon={RotateCcw} size={16} />
            Lấy lại {ai.words.note} cũ
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
              ? `Ô ${ai.words.note} đang khác bản này.`
              : `Chưa điền gì. ${capitalized(ai.words.note)} của bạn vẫn giữ nguyên.`
          }
          confirmLabel="Dùng bản này"
          done={ai.summaryUsed && note.trim() === ai.report.summary.trim()}
          doneLabel="Đã điền vào ô"
          onConfirm={take}
        />
      )}
      {ai.report && ai.part === 'minutes' && (
        <AiAction
          variant="panel"
          className={BLOCK}
          suggestion={<MinutesBox ai={ai} />}
          basis={ai.basis}
          empty={ai.minutesChangedSinceSave ? 'Chưa lưu phần vừa sửa.' : 'Chưa lưu biên bản.'}
          confirmLabel="Lưu vào tệp đính kèm"
          done={ai.minutesSaved}
          doneLabel="Đã lưu"
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
  return (
    <span className="flex flex-col gap-2">
      <Textarea
        rows={10}
        autoGrow
        value={ai.minutes}
        aria-label="Biên bản"
        className="max-h-[60dvh] overflow-y-auto text-[14px]"
        onChange={(e) => ai.setMinutes(e.target.value)}
      />
      {ai.savingMinutes && (
        <span role="status" className="text-on-tint-primary-muted text-[12.5px]">
          Đang lưu…
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
      empty="Chưa điền gì. Câu trả lời của bạn vẫn giữ nguyên."
      confirmLabel={`Dùng ${ai.words.evaluation} này`}
      done={rows.every((a) => picked[a.criterionId] === a.answerId)}
      doneLabel="Đã điền vào ô"
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
  if (!ai.report || !options) return null
  const steps = stepsOnOffer(ai.report.steps, options)
  if (steps.length === 0) return null

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {steps.map((step) => {
        const next = draftOfAiStep(step, draft, options)
        return (
          <AiAction
            key={step.templateId ?? step.text}
            variant="panel"
            className={BLOCK}
            suggestion={
              <>
                <strong className="block font-semibold">{next.text}</strong>
                {next.due !== '' && (
                  <span className="text-on-tint-primary-muted tnum block text-[12px]">
                    Làm trước ngày {dm(next.due)}
                  </span>
                )}
                <span className="mt-1 block">{step.reason}</span>
              </>
            }
            basis={ai.basis}
            empty="Chưa chọn bước này."
            confirmLabel="Chọn bước này"
            done={draft.text === next.text && draft.kindId === next.kindId}
            doneLabel="Đã điền vào ô"
            onConfirm={() => onDraft(next)}
          />
        )
      })}
    </div>
  )
}
