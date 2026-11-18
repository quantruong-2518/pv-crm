import type {
  CommAiAnswer,
  CommAiReport,
  CommAiStep,
  CommVocabularyResponse,
  StepOptionsResponse,
} from '@pv/contracts'
import { answersOnOffer, stepsOnOffer } from '@/data/comm-ai-report'
import type { DraftPart } from '@/data/comm-ai-settled'
import type { StepDraft } from '@/data/comm-record-detail'

/** What a ready AI suggestion would put into the open form, part by part. Pure: the
 *  page draws each part as a preview and, on one press, applies the same plan
 *  through the existing fill moves — nothing here writes. */

/** One entry per part the draft can still fill; a settled or inapplicable part is absent. */
export type DraftPlan = {
  title?: string
  /** Differs from the box: an equal summary has nothing left to preview. */
  note?: string
  answers: CommAiAnswer[]
  steps: CommAiStep[]
}

export type DraftForm = {
  title: string
  summary: string
  picked: Record<string, string>
  step: StepDraft
}

const hasNoStep = (draft: StepDraft) =>
  draft.kindId === '' && draft.text.trim() === '' && draft.templateId === undefined

export function planDraft(
  report: CommAiReport,
  form: DraftForm,
  criteria: CommVocabularyResponse['criteria'],
  options: StepOptionsResponse | undefined,
  settled: readonly DraftPart[],
): DraftPlan | null {
  const keep = (part: DraftPart) => !settled.includes(part)
  const note = report.summary.trim() === form.summary.trim() ? undefined : report.summary
  const plan: DraftPlan = {
    ...(keep('title') && report.title && form.title.trim() === '' && { title: report.title }),
    ...(keep('note') && note !== undefined && { note }),
    answers: keep('answers')
      ? answersOnOffer(report.answers, criteria, form.picked).filter(
          (a) => !form.picked[a.criterionId],
        )
      : [],
    steps:
      keep('step') && options && hasNoStep(form.step) ? stepsOnOffer(report.steps, options) : [],
  }
  /* Null once nothing is left, so the confirm is not held for an empty plan. */
  const empty =
    plan.title === undefined &&
    plan.note === undefined &&
    plan.answers.length === 0 &&
    plan.steps.length === 0
  return empty ? null : plan
}
