import { useState } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CommAiReport,
  CommAiReportStatus,
  type CommAiAnswer,
  type CommAiSources,
  type CommAiStep,
  type CommVocabularyResponse,
  type DebriefView,
  type StepOptionsResponse,
} from '@pv/contracts'
import { api, isApiError, userMessage, type ApiError } from '@/app/api'
import { useCan } from '@/app/auth'
import { cacheTier } from '@/app/query-client'
import { dmy } from '@/lib/date'
import {
  COMM_RECORDS_KEY,
  deleteCommFile,
  uploadCommFile,
  type StepDraft,
} from '@/data/comm-record-detail'
import { COMM_VIEW_NEED } from '@/data/comms'
import { dueOnPick } from '@/data/next-step'

/** AI report of one open comm (ADR 0132). A proposal: nothing here writes the
 *  record, and the door drops no cache, so a press landing mid-typing moves
 *  nothing in the form. Each part reaches the form through the person's press.
 *
 *  The hook is called at the workspace, not in a step card: the cards unmount
 *  as the stepper moves, and the report and the edited minutes must outlive them. */

export type CommAiPart = 'summary' | 'minutes'

/** What the form around the blocks calls its boxes; the blocks say the same word. */
export type CommAiWords = { note: string; evaluation: string }
const FORM_WORDS: CommAiWords = { note: 'ghi chú', evaluation: 'đánh giá' }
export const MEETING_AI_WORDS: CommAiWords = { note: 'tóm tắt', evaluation: 'kết quả' }

/** A failed read reads as off: the buttons stay hidden rather than refuse. */
const commAiStatusQuery = queryOptions({
  queryKey: [...COMM_RECORDS_KEY, 'ai-report-status'] as const,
  queryFn: ({ signal }) =>
    api.read('/comms/debriefs/ai-report', {
      need: COMM_VIEW_NEED,
      schema: CommAiReportStatus,
      signal,
    }),
  ...cacheTier.reference,
})

type Held = {
  report: CommAiReport
  part: CommAiPart
  /** The note sent, then each summary taken from this report: the report still
   *  answers those, so the other button need not pay for a new call. */
  notes: string[]
  /** Recorded, not read off the text: a summary equal to the note is still unpressed. */
  summaryUsed: boolean
  /** The editable copy, here so it survives a switch to the other part. */
  minutes: string
  savedMinutes: string | null
  /** Hand edits a new minutes press replaced before they were saved. */
  editedMinutes: string | null
}

/** Already gone is what a replace wanted: the person may have removed it from the list. */
async function dropFile(id: string, fileId: string) {
  try {
    await deleteCommFile(id, fileId)
  } catch (error) {
    if (!isApiError(error) || error.kind !== 'not-found') throw error
  }
}

export function useCommAiReport(record: DebriefView, words = FORM_WORDS) {
  const permitted = useCan('comm.view-content') && record.closableByMe
  const status = useQuery({ ...commAiStatusQuery, enabled: permitted })
  const client = useQueryClient()
  const [held, setHeld] = useState<Held | null>(null)
  /* A stack: a second summary taken must not cost the note kept from the first. */
  const [replaced, setReplaced] = useState<string[]>([])
  const [saveProblem, setSaveProblem] = useState<string | null>(null)
  /* Outside `Held`: a save of a newer report still replaces the file this form saved. */
  const [savedFile, setSavedFile] = useState<string | null>(null)

  const run = useMutation<CommAiReport, ApiError, { part: CommAiPart; note: string }>({
    mutationFn: ({ note }) =>
      api.write(`/comms/debriefs/${encodeURIComponent(record.id)}/ai-report`, {
        body: { note },
        need: COMM_VIEW_NEED,
        schema: CommAiReport,
      }),
    onSuccess: (report, { part, note }) => {
      setSaveProblem(null)
      setHeld((before) => {
        const edited = before && before.minutes !== before.report.minutes ? before : null
        /* A press for the summary was not asked to redo the minutes. */
        const kept = part === 'summary' ? edited : null
        const lost = part === 'minutes' && edited?.savedMinutes !== edited?.minutes.trim()
        return {
          report,
          part,
          notes: [note],
          summaryUsed: false,
          minutes: kept?.minutes ?? report.minutes,
          savedMinutes: kept?.savedMinutes ?? null,
          editedMinutes: lost && edited ? edited.minutes : (before?.editedMinutes ?? null),
        }
      })
    },
  })

  const save = useMutation<string, ApiError, { text: string; replaces: string | null }>({
    mutationFn: async ({ text, replaces }) => {
      const file = new File([text], minutesFileName(record), { type: 'text/plain' })
      const fileId = await uploadCommFile(record.id, file, 'text/plain')
      /* New file first, so a failure never leaves the record with none. An old copy
         that will not delete stays in the list, where the person can remove it. */
      if (replaces) await dropFile(record.id, replaces).catch(() => undefined)
      return fileId
    },
    onSuccess: (fileId, { text }) => {
      setSavedFile(fileId)
      setHeld((h) => h && { ...h, savedMinutes: text })
    },
    onError: (error) =>
      setSaveProblem(isApiError(error) ? userMessage(error) : 'Không lưu được biên bản. Thử lại.'),
    onSettled: () => void client.invalidateQueries({ queryKey: COMM_RECORDS_KEY }),
  })

  const ask = (part: CommAiPart, note: string) => {
    const sent = note.trim()
    if (held && held.part !== part && held.notes.includes(sent)) {
      run.reset()
      setHeld({ ...held, part })
    } else {
      run.mutate({ part, note: sent })
    }
  }

  /** Call before the note box changes: `note` is what the summary replaces. */
  const summaryTaken = (note: string) => {
    if (!held) return
    const summary = held.report.summary.trim()
    if (![summary, ''].includes(note.trim())) setReplaced((notes) => [...notes, note])
    setHeld({ ...held, summaryUsed: true, notes: [...held.notes, summary] })
  }

  /** `note` is the box now. Corrections go to the bottom of the stack, so more
   *  presses walk back through every version and none is lost. */
  const restoreNote = (note: string) => {
    const back = replaced.at(-1) ?? ''
    const rest = replaced.slice(0, -1)
    const corrected = ![back.trim(), held?.report.summary.trim(), ''].includes(note.trim())
    setReplaced(corrected ? [note, ...rest] : rest)
    setHeld((h) => h && { ...h, summaryUsed: false })
    return back
  }

  const setMinutes = (minutes: string) => setHeld((h) => h && { ...h, minutes })

  const restoreMinutes = () =>
    setHeld((h) =>
      h?.editedMinutes
        ? { ...h, part: 'minutes', minutes: h.editedMinutes, editedMinutes: null }
        : h,
    )

  const saveMinutes = () => {
    if (!held || save.isPending) return
    const text = held.minutes.trim()
    if (text === '') return setSaveProblem('Biên bản đang trống.')
    setSaveProblem(null)
    save.mutate({ text, replaces: savedFile })
  }

  const saved = held?.savedMinutes ?? null
  const canAsk = permitted && status.data?.available === true

  return {
    /* Only asking needs the route: a daily limit reached after a press must not
       take the report or the way back to a note. */
    canAsk,
    allowed: canAsk || held !== null || replaced.length > 0,
    words,
    /* Hidden while a press runs: its answer is about to replace these blocks. */
    report: run.isPending ? null : (held?.report ?? null),
    part: held?.part ?? null,
    basis: held ? commAiBasis(held.report.sources, words.note) : '',
    summaryUsed: held?.summaryUsed ?? false,
    /** The part a running press asked for; null when idle. */
    asking: run.isPending ? run.variables.part : null,
    error: run.error,
    ask,
    summaryTaken,
    canRestore: replaced.length > 0,
    restoreNote,
    minutes: held?.minutes ?? '',
    setMinutes,
    canRestoreMinutes: Boolean(held?.editedMinutes),
    restoreMinutes,
    minutesSaved: saved !== null && saved === held?.minutes.trim(),
    minutesChangedSinceSave: saved !== null && saved !== held?.minutes.trim(),
    savingMinutes: save.isPending,
    saveProblem,
    saveMinutes,
  }
}

export type CommAiReportState = ReturnType<typeof useCommAiReport>

/** The law 9 line, from what the server says was read and never from the model.
 *  Built beside the data, as in `data/plan.ts`, so the words cannot drift from it. */
function commAiBasis({ note, turns, files, unread }: CommAiSources, noteWord: string): string {
  const read = [
    ...(note ? [noteWord] : []),
    ...(turns > 0 ? [`${turns} lượt trao đổi`] : []),
    ...files,
  ]
  const skipped = unread.length > 0 ? `Chưa đọc: ${unread.join(', ')}` : ''
  return [read.join(' · '), skipped].filter(Boolean).join('. ')
}

function minutesFileName(record: DebriefView): string {
  const day = dmy(record.meeting?.at ?? record.createdAt).replaceAll('/', '-')
  return `Biên bản ${record.subject.code} ${day}.txt`
}

/** Answers the form can take: the vocabulary may have moved since the press, a
 *  dead id would pass the blocker with no radio lit, and a question the person
 *  answered differently is theirs. */
export function answersOnOffer(
  answers: readonly CommAiAnswer[],
  criteria: CommVocabularyResponse['criteria'],
  picked: Record<string, string>,
): CommAiAnswer[] {
  return answers.filter((a) => {
    const own = picked[a.criterionId]
    const live = criteria
      .find((c) => c.id === a.criterionId)
      ?.answers.some((x) => x.id === a.answerId)
    return live && (!own || own === a.answerId)
  })
}

/** The frame can move between the press and the pick, and the form would refuse
 *  a step it no longer holds. */
export const stepsOnOffer = (steps: readonly CommAiStep[], options: StepOptionsResponse) =>
  steps.filter(
    (step) => options.freeEntry || options.templates.some((t) => t.id === step.templateId),
  )

/** The same move as the template `pick` in `CommNextStepFields`, off the live template. */
export function draftOfAiStep(
  step: CommAiStep,
  draft: StepDraft,
  options: StepOptionsResponse,
): StepDraft {
  const template = options.templates.find((t) => t.id === step.templateId)
  return {
    ...draft,
    templateId: template?.id,
    text: template?.name ?? step.text,
    kindId: template?.kind.id ?? step.kind.id,
    ...dueOnPick(template ?? step, draft.due, draft.dueAuto ?? false),
  }
}
