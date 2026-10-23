import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { DebriefAnswerInput, DebriefView } from '@pv/contracts'
import { commVocabularyQuery } from '@/data/comm-vocabulary'
import {
  EMPTY_STEP_DRAFT,
  commStepTitles,
  evaluationBlockerOf,
  type CommDraft,
} from '@/data/comm-record-detail'
import { useCloseStep } from '@/data/customer-close'

/** The state of a comm's three-step form on `/comms/:id`, shared by the
 *  owner's first fill and the later edit (ADR 0122): what is typed, which step
 *  is open, and the step part's target. What blocks a send and what is sent
 *  stay with each caller, because the edit sends the step only when changed. */

/** `titled` false drops the title field: a booked meeting keeps no title of its own. */
export function useCommForm(record: DebriefView, seed: CommDraft, titled = true) {
  const vocab = useQuery(commVocabularyQuery)
  const close = useCloseStep(record.subject.code, record.stepTarget)
  const [title, setTitle] = useState(seed.title)
  const [summary, setSummary] = useState(seed.summary)
  const [picked, setPicked] = useState(seed.picked)
  const [draft, setDraft] = useState(seed.step)
  const [at, setAt] = useState(0)

  const missing = [
    titled && title.trim() === '' && 'tiêu đề',
    summary.trim() === '' && 'ghi chú',
  ].filter((word): word is string => word !== false)
  const go = (index: number) => {
    setAt(index)
    window.scrollTo({ top: 0 })
  }
  /** One answer per criterion of the vocabulary as it stands now. */
  const answers = (): DebriefAnswerInput[] =>
    (vocab.data?.criteria ?? []).map((c) => ({ criterionId: c.id, answerId: picked[c.id] ?? '' }))

  return {
    vocab,
    close,
    title,
    setTitle,
    summary,
    setSummary,
    picked,
    setPicked,
    draft,
    setDraft,
    at,
    go,
    answers,
    titled,
    titles: commStepTitles(record),
    contentGap: missing.length > 0 ? `Còn thiếu ${missing.join(' và ')}` : null,
    /** The answers alone; each caller decides when the temperature counts too. */
    answersGap: evaluationBlockerOf(vocab, picked),
  }
}

export type CommForm = ReturnType<typeof useCommForm>

export const EMPTY_COMM_DRAFT: CommDraft = {
  title: '',
  summary: '',
  picked: {},
  step: EMPTY_STEP_DRAFT,
}

/** A confirmed record as the form's starting point. A record that set no step
 *  starts from an empty one; the edit never sends it unless it is changed. */
export function editSeedOf(record: DebriefView): CommDraft {
  return {
    title: record.title ?? '',
    summary: record.summary.state === 'visible' ? record.summary.text : '',
    picked: Object.fromEntries(record.answers.map((a) => [a.criterionId, a.answerId])),
    step: record.step
      ? { kindId: record.step.kind.id, text: record.step.text, due: record.step.due }
      : EMPTY_STEP_DRAFT,
  }
}
