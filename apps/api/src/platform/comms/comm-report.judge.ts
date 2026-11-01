import {
  COMM_AI_MAX_STEPS,
  CommAiReport,
  DEBRIEF_SUMMARY_MAX,
  DEBRIEF_TITLE_MAX,
  NEXT_STEP_TEXT_MAX,
  StepTemplateOption,
  type CommAiAnswer,
  type CommAiSources,
  type CommAiStep,
} from '@pv/contracts'
import type { CommReportModelOutput } from '@api/platform/ai/prompts/comm-report.prompts'
import type { CommReportContext } from './comm-debrief.hook'

/** The server's check of the model (ADR 0132 §6). A row that fails is dropped,
 *  never repaired: names, a template's kind, text and due come from the live
 *  lists, so what survives reads as if a person had picked it.
 *
 *  Null = nothing usable: a report with no summary or no minutes is a failed
 *  call, not a thin report, and `CommAiReport` could not carry it anyway. */
export function judgeReport(
  model: CommReportModelOutput,
  context: CommReportContext,
  booked: boolean,
  sources: CommAiSources,
): CommAiReport | null {
  const summary = clamp(model.summary, DEBRIEF_SUMMARY_MAX)
  const minutes = model.minutes.trim()
  if (!summary || !minutes) return null
  return CommAiReport.parse({
    title: booked ? null : clamp(model.title ?? '', DEBRIEF_TITLE_MAX) || null,
    summary,
    minutes,
    answers: judgeAnswers(model.answers, context.vocabulary.criteria),
    steps: judgeSteps(model.steps, context),
    sources,
  })
}

function judgeAnswers(
  proposed: CommReportModelOutput['answers'],
  criteria: CommReportContext['vocabulary']['criteria'],
): CommAiAnswer[] {
  const answered = new Set<string>()
  return proposed.flatMap(({ criterionId, answerId }) => {
    const criterion = criteria.find((c) => c.id === criterionId)
    const answer = criterion?.answers.find((a) => a.id === answerId)
    if (!criterion || !answer || answered.has(criterion.id)) return []
    answered.add(criterion.id)
    return [
      {
        criterionId: criterion.id,
        criterionName: criterion.name,
        answerId: answer.id,
        answerName: answer.name,
      },
    ]
  })
}

function judgeSteps(
  proposed: CommReportModelOutput['steps'],
  { step: frame, vocabulary }: CommReportContext,
): CommAiStep[] {
  if (!frame) return []
  const judged = proposed.flatMap((s) => judgeStep(s, frame, vocabulary.stepKinds) ?? [])
  const keyOf = (s: CommAiStep) => s.templateId ?? s.text
  return judged
    .filter((s, i) => judged.findIndex((o) => keyOf(o) === keyOf(s)) === i)
    .slice(0, COMM_AI_MAX_STEPS)
}

function judgeStep(
  proposed: CommReportModelOutput['steps'][number],
  frame: NonNullable<CommReportContext['step']>,
  stepKinds: CommReportContext['vocabulary']['stepKinds'],
): CommAiStep | null {
  const reason = proposed.reason.trim()
  if (!reason) return null
  if (proposed.templateId) {
    const template = frame.templates.find((t) => t.id === proposed.templateId)
    if (!template) return null
    const { id, name, kind, dueDays } = template
    return { templateId: id, kind, text: name, dueDays, reason }
  }
  const kind = stepKinds.find((k) => k.id === proposed.kindId)
  const text = clamp(proposed.text ?? '', NEXT_STEP_TEXT_MAX)
  if (!frame.freeEntry || !kind || !text) return null
  const dueDays = StepTemplateOption.shape.dueDays.safeParse(proposed.dueDays ?? undefined)
  return { kind, text, dueDays: dueDays.success ? dueDays.data : undefined, reason }
}

const clamp = (text: string, max: number): string => text.trim().slice(0, max).trimEnd()
