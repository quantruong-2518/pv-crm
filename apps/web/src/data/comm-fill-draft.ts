import type { StepOptionsResponse } from '@pv/contracts'
import { planDraft } from '@/data/comm-ai-draft'
import type { DraftPart } from '@/data/comm-ai-settled'
import { draftOfAiStep, type CommAiReportState } from '@/data/comm-ai-report'
import type { CommForm } from '@/data/comm-record-form'

/** The AI suggestions still waiting in an open fill form, and the one press that applies
 *  them. `plan` is null unless a part can still be filled; `fill` is the person's press
 *  and the only way a part of the report reaches the form (law 9). */
export function useFillDraft(
  form: CommForm,
  ai: CommAiReportState,
  options: StepOptionsResponse | undefined,
  chosen: number,
) {
  const plan =
    ai.stage === 'ready' && ai.report
      ? planDraft(
          ai.report,
          { title: form.title, summary: form.summary, picked: form.picked, step: form.draft },
          form.vocab.data?.criteria ?? [],
          options,
          ai.settledParts,
        )
      : null

  /* Each part goes in through the same move its own block used before. Only the parts
     the plan held are marked taken: a step still waiting for its options stays offered. */
  const fill = () => {
    if (!plan) return
    const taken: DraftPart[] = []
    if (plan.title !== undefined) {
      form.setTitle(plan.title)
      taken.push('title')
    }
    if (plan.note !== undefined) {
      ai.summaryTaken(form.summary)
      form.setSummary(plan.note)
      taken.push('note')
    }
    if (plan.answers.length > 0) {
      const given = Object.fromEntries(plan.answers.map((a) => [a.criterionId, a.answerId]))
      form.setPicked((now) => ({ ...given, ...now }))
      taken.push('answers')
    }
    const step = plan.steps[chosen] ?? plan.steps[0]
    if (step && options) {
      form.setDraft(draftOfAiStep(step, form.draft, options))
      taken.push('step')
    }
    ai.draftTaken(taken)
  }

  return { plan, fill }
}
