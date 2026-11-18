import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { queryOptions, useMutation, useQuery } from '@tanstack/react-query'
import {
  CommAiReport,
  CommAiReportStatus,
  collapseSpaces,
  type CommAiAnswer,
  type CommAiPart,
  type CommAiSources,
  type CommAiStep,
  type CommAttachmentsResponse,
  type CommVocabularyResponse,
  type DebriefView,
  type StepOptionsResponse,
} from '@pv/contracts'
import { api, userMessage, type ApiError } from '@/app/api'
import { message, translate, useLang, type Lang, type Message } from '@/app/i18n'
import { useCan } from '@/app/auth'
import { cacheTier } from '@/app/query-client'
import { useSaveMinutes } from '@/data/comm-ai-minutes'
import { readSettled, writeSettled, type DraftPart } from '@/data/comm-ai-settled'
import { COMM_AI_JOB_FAILED, isCommJobActive, useCommAiJob } from '@/data/comm-ai-job'
import { COMM_RECORDS_KEY, commFilesQuery, type StepDraft } from '@/data/comm-record-detail'
import { COMM_VIEW_NEED } from '@/data/comms'
import { dueOnPick } from '@/data/next-step'

/** AI report of one open comm (ADR 0132). A proposal: nothing here writes the
 *  record, and the door drops no cache, so a press landing mid-typing moves
 *  nothing in the form. Each part reaches the form through the person's press.
 *
 *  The hook is called at the workspace, not in a step card: the cards unmount
 *  as the stepper moves, and the report and the edited minutes must outlive them.
 *
 *  A record with a recording asks through a background job (ADR 0135,
 *  `data/comm-ai-job.ts`): the answer lands here the same way, whenever it comes. */

/** What the form around the blocks calls its boxes; the blocks say the same word. */
export type CommAiWords = { note: Message; evaluation: Message }
const FORM_WORDS: CommAiWords = {
  note: message('ghi chú', 'notes', '메모'),
  evaluation: message('đánh giá', 'evaluation', '평가'),
}
export const MEETING_AI_WORDS: CommAiWords = {
  note: message('tóm tắt', 'summary', '요약'),
  evaluation: message('kết quả', 'outcome', '결과'),
}

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
  /** The job this report came from, or null for a sync answer that is not kept. */
  jobId: string | null
  /** The parts one press moved into the form; their previews are gone for good. */
  taken: DraftPart[]
  /** "Discard suggestions": the report stays for the minutes, its previews go. */
  dismissed: boolean
  dropped: DraftPart[]
}

/** Where every report lands, whichever door it came through. */
function heldWith(
  before: Held | null,
  report: CommAiReport,
  part: CommAiPart,
  note: string,
  recordId: string,
  jobId: string | null,
): Held {
  const edited = before && before.minutes !== before.report.minutes ? before : null
  /* The "Regenerate" button asks for the summary, so hand-edited minutes survive it here. */
  const kept = part === 'summary' ? edited : null
  const done = jobId ? readSettled(recordId, jobId) : null
  const lost = part === 'minutes' && edited?.savedMinutes !== edited?.minutes.trim()
  return {
    report,
    part,
    notes: [note],
    summaryUsed: false,
    minutes: kept?.minutes ?? report.minutes,
    savedMinutes: kept?.savedMinutes ?? null,
    editedMinutes: lost && edited ? edited.minutes : (before?.editedMinutes ?? null),
    jobId,
    taken: done?.taken ?? [],
    dismissed: done?.dismissed ?? false,
    dropped: done?.dropped ?? [],
  }
}

/** Null without a recording. All ids, so a swapped recording reads as a new one. */
const recordingsOf = ({ rows }: CommAttachmentsResponse) =>
  rows
    .filter((file) => file.mime.startsWith('audio/'))
    .map((file) => file.id)
    .join(' ') || null

/** One entry per job: a reopened record reads the landed job again and must not re-offer
 *  what the person already settled. */
function useKeepSettled(recordId: string, held: Held | null) {
  const jobId = held?.jobId ?? null
  const taken = held?.taken
  const dropped = held?.dropped
  const dismissed = held?.dismissed
  useEffect(() => {
    if (jobId && taken && dropped && dismissed !== undefined)
      writeSettled(recordId, { jobId, taken, dropped, dismissed })
  }, [recordId, jobId, taken, dropped, dismissed])
}

export function useCommAiReport(record: DebriefView, words = FORM_WORDS) {
  const lang = useLang()
  const permitted = useCan('comm.view-content') && record.closableByMe
  const status = useQuery({ ...commAiStatusQuery, enabled: permitted })
  const [held, setHeld] = useState<Held | null>(null)
  /* A stack: a second summary taken must not cost the note kept from the first. */
  const [replaced, setReplaced] = useState<string[]>([])
  /* The recordings the tick was given for: a word given for one does not cover another. */
  const [noticed, setNoticed] = useState<string | null>(null)
  const [jobProblem, setJobProblem] = useState<string | null>(null)
  /* Kept here so one retry button, wherever it sits, resends the last press as it was. */
  const [asked, setAsked] = useState<{ part: CommAiPart; note: string } | null>(null)

  /* `permitted` also guards the cache, which a switched-off query still hands back.
     The route comes first because each read of the file list files an audit line. */
  const listenable = permitted && status.data?.recording === true
  const files = useQuery({
    ...commFilesQuery(record.id),
    enabled: listenable,
    select: recordingsOf,
  })
  const recordings = listenable ? (files.data ?? null) : null
  const listens = recordings !== null
  const { job, press } = useCommAiJob(record.id, permitted)
  const {
    saveMinutes,
    saving,
    problem: saveProblem,
    clearProblem,
  } = useSaveMinutes(record, held?.minutes ?? null, (text) =>
    setHeld((h) => h && { ...h, savedMinutes: text }),
  )

  const land = useCallback(
    (report: CommAiReport, part: CommAiPart, note: string, jobId: string | null = null) => {
      clearProblem()
      setHeld((before) => heldWith(before, report, part, note, record.id, jobId))
    },
    [clearProblem, record.id],
  )

  const run = useMutation<CommAiReport, ApiError, { part: CommAiPart; note: string }>({
    mutationFn: ({ note }) =>
      api.write(`/comms/debriefs/${encodeURIComponent(record.id)}/ai-report`, {
        body: { note },
        need: COMM_VIEW_NEED,
        schema: CommAiReport,
      }),
    onSuccess: (report, { part, note }) => land(report, part, note),
  })

  /* Once per job: a reopened form hydrates from it, a re-read must not undo what the
     person did since. Layout effect: the old blocks must not paint between the
     running state and the report. */
  const landed = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!job || isCommJobActive(job) || landed.current === job.id) return
    landed.current = job.id
    if (job.state === 'FAILED') {
      setJobProblem(job.error ?? translate(COMM_AI_JOB_FAILED))
      /* A retry after a reload must resend what the failed press carried. */
      setAsked((was) => was ?? { part: job.part, note: job.note })
    } else if (job.report) land(job.report, job.part, job.note, job.id)
  }, [job, land])

  const ask = (part: CommAiPart, note: string) => {
    const sent = note.trim()
    setAsked({ part, note: sent })
    run.reset()
    press.reset()
    setJobProblem(null)
    /* A job's note comes back as the server stored it, line breaks collapsed. */
    const same = held?.notes.includes(sent) || held?.notes.includes(collapseSpaces(sent))
    if (held && held.part !== part && same) {
      setHeld({ ...held, part })
    } else if (listens) {
      press.mutate({ part, note: sent })
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

  const draftTaken = (parts: readonly DraftPart[]) =>
    setHeld((h) => h && { ...h, taken: [...new Set([...h.taken, ...parts])] })
  const dismissDraft = () => setHeld((h) => h && { ...h, dismissed: true })
  const dropPart = (part: DraftPart) =>
    setHeld((h) => h && { ...h, dropped: [...h.dropped.filter((p) => p !== part), part] })

  useKeepSettled(record.id, held)

  const setMinutes = (minutes: string) => setHeld((h) => h && { ...h, minutes })

  const restoreMinutes = () =>
    setHeld((h) =>
      h?.editedMinutes
        ? { ...h, part: 'minutes', minutes: h.editedMinutes, editedMinutes: null }
        : h,
    )

  const saved = held?.savedMinutes ?? null
  /* Until the list is read a press could take the sync path past a recording. */
  const filesKnown = !listenable || !files.isPending
  const canAsk = permitted && filesKnown && (status.data?.available === true || listens)
  const running = job && isCommJobActive(job) ? job.part : null
  const pressed = run.isPending ? run.variables.part : press.isPending ? press.variables.part : null
  const asking = pressed ?? running
  const refusal = run.error ?? press.error
  const error = refusal ? userMessage(refusal) : jobProblem
  const live = job && isCommJobActive(job) ? job : null
  const blocked = listens && noticed !== recordings
  const stage: CommAiStage = asking
    ? 'running'
    : error
      ? 'error'
      : !held || held.dismissed
        ? 'idle'
        : 'ready'

  return {
    /* Only asking needs the route: a daily limit reached after a press must not
       take the report or the way back to a note. */
    canAsk,
    allowed: canAsk || held !== null || replaced.length > 0,
    words,
    /* Hidden while a press runs: its answer is about to replace these blocks. */
    report: asking ? null : (held?.report ?? null),
    part: held?.part ?? null,
    basis: held ? commAiBasis(held.report.sources, translate(words.note, lang), lang) : '',
    summaryUsed: held?.summaryUsed ?? false,
    /** The part a running press or job asked for; null when idle. */
    asking,
    /** The running ask is a recording job, so the person need not wait on this screen. */
    listening: press.isPending || running !== null,
    error,
    stage,
    /** Where the job stands, or null on the sync path or when idle. */
    progress:
      press.isPending || live ? { step: live?.step ?? 0, queued: live?.state === 'QUEUED' } : null,
    sources: held?.report.sources ?? null,
    hasReport: held !== null,
    /** Parts the person dropped or took: none of them is previewed again. */
    settledParts: [...(held?.dropped ?? []), ...(held?.taken ?? [])],
    taken: held?.taken ?? [],
    draftTaken,
    dismissDraft,
    dropPart,
    /** Resends the last press with the note it carried; undefined until one was made. */
    retry: asked && canAsk && !blocked ? () => ask(asked.part, asked.note) : undefined,
    needsNotice: listens,
    notice: listens && noticed === recordings,
    setNotice: (ticked: boolean) => setNoticed(ticked ? recordings : null),
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
    savingMinutes: saving,
    saveProblem,
    saveMinutes,
  }
}

export type CommAiReportState = ReturnType<typeof useCommAiReport>

/** running: a press is out · error: it was refused or failed · ready: a report is held
 *  and not discarded; which parts still wait is the form's plan · idle: nothing to press on. */
export type CommAiStage = 'idle' | 'running' | 'error' | 'ready'

/** How many exchanges and files a screen counts: said once for the basis line and the call panel. */
export const exchangesCount = (n: number) =>
  message(`${n} lượt trao đổi`, `${n} exchanges`, `대화 ${n}회`)
export const filesCount = (n: number) => message(`${n} tệp`, `${n} files`, `파일 ${n}개`)

/** The law 9 line, from what the server says was read and never from the model.
 *  Built beside the data so the words cannot drift from it. `files: 'count'` is for a
 *  narrow block where a long file name would not wrap; the panel next to it lists the names. */
export function commAiBasis(
  { note, turns, files, unread }: CommAiSources,
  noteWord: string,
  lang: Lang,
  format: { files: 'names' | 'count' } = { files: 'names' },
): string {
  const fileParts =
    format.files === 'names'
      ? files
      : files.length > 0
        ? [translate(filesCount(files.length), lang)]
        : []
  const read = [
    ...(note ? [noteWord] : []),
    ...(turns > 0 ? [translate(exchangesCount(turns), lang)] : []),
    ...fileParts,
  ]
  const skipped =
    unread.length > 0
      ? translate(
          message(
            `Chưa đọc: ${unread.join(', ')}`,
            `Not read: ${unread.join(', ')}`,
            `읽지 못함: ${unread.join(', ')}`,
          ),
          lang,
        )
      : ''
  return [read.join(' · '), skipped].filter(Boolean).join('. ')
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
