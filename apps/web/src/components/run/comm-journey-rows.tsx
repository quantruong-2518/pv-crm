import { useQueries, useQuery } from '@tanstack/react-query'
import type {
  CommRecordState,
  DebriefView,
  MailSubjectKind,
  MailSubjectTimelineRow,
  ThreadChannel,
  WorkstreamJourneyResponse,
} from '@pv/contracts'
import { isApiError } from '@/app/api'
import { useCan } from '@/app/auth'
import { summaryTextOf } from '@/data/comm-record-detail'
import { workstreamCommRecordsQuery } from '@/data/comm-records'
import { subjectLettersQuery } from '@/data/mail-letters'
import { workstreamJourneyQuery } from '@/data/workstream-journey'

/** The rows of `CommJourney`: the run's comms and the letters filed on its
 *  objects, one list, newest first.
 *
 *  Letters are read beside the comms because a letter is not a comm: the send
 *  door (`mail-letter.service.ts`) never opens a debrief, so only a letter
 *  sent after the mail button's confirm has a comm, and that comm is the debrief,
 *  not the letter. The run's objects come from the journey; without it only
 *  the subject's own letters are read. Each object's letters are read only
 *  under its book's view permission, so a missing one costs no refused call. */

export type JourneySubject = { kind: MailSubjectKind; code: string }

export type JourneyRow = {
  key: string
  channel: ThreadChannel
  /** The lead, deal or contract the row is filed on. */
  code: string
  at: string | null
  title: string
  /** The title is a placeholder sentence, not content. */
  titleMuted: boolean
  commId: string | null
  commState: CommRecordState | null
  late: boolean
  letter: MailSubjectTimelineRow | null
  /** Who holds the comm, or who wrote the letter. */
  owner?: string
}

const commRow = (row: DebriefView): JourneyRow => ({
  key: `comm:${row.id}`,
  channel: row.channel,
  code: row.subject.code,
  at: row.createdAt,
  title: summaryTextOf(row.summary),
  titleMuted: row.summary.state !== 'visible',
  commId: row.id,
  commState: row.state,
  late: row.late,
  letter: null,
  owner: row.owner.name,
})

const letterRow = (code: string, row: MailSubjectTimelineRow): JourneyRow => ({
  key: `letter:${code}:${row.runId}`,
  channel: 'email',
  code,
  at: row.sentAt ?? row.scheduledAt ?? null,
  title: row.subject,
  titleMuted: false,
  commId: null,
  commState: null,
  late: false,
  letter: row,
  owner: row.createdBy.name,
})

function letterTargets(
  journey: WorkstreamJourneyResponse | undefined,
  subject: JourneySubject | undefined,
): JourneySubject[] {
  if (!journey) return subject ? [subject] : []
  const run: JourneySubject[] = [
    { kind: 'lead', code: journey.lead.code },
    ...journey.deals.map((deal) => ({ kind: 'opportunity' as const, code: deal.code })),
    ...journey.contracts.map((paper) => ({ kind: 'contract' as const, code: paper.code })),
  ]
  return !subject || run.some((t) => t.code === subject.code) ? run : [subject, ...run]
}

const timeOf = (row: JourneyRow) => (row.at ? Date.parse(row.at) : 0)

/** Another object of the run may sit outside this reader's scope; that is a
 *  cut, not a failure, as the comms door cuts it the same way. */
const outOfReach = (error: unknown) =>
  isApiError(error) && (error.kind === 'forbidden' || error.kind === 'not-found')

export function useJourneyRows(workstreamCode: string | null, subject?: JourneySubject) {
  const canComms = useCan('comm.view')
  const canJourney = useCan('workstream.view')
  const canRead: Record<MailSubjectKind, boolean> = {
    lead: useCan('lead.view'),
    opportunity: useCan('opportunity.view'),
    contract: useCan('contract.view'),
  }
  const comms = useQuery({
    ...workstreamCommRecordsQuery(workstreamCode ?? ''),
    enabled: canComms && workstreamCode !== null,
  })
  const journey = useQuery({
    ...workstreamJourneyQuery(workstreamCode ?? ''),
    enabled: canJourney && workstreamCode !== null,
  })
  const targets = letterTargets(journey.data, subject)
  const letters = useQueries({
    queries: targets.map((t) => ({
      ...subjectLettersQuery(t.kind, t.code),
      enabled: canRead[t.kind],
    })),
  })
  const own = subject && letters[targets.findIndex((t) => t.code === subject.code)]
  const lettersError =
    own?.error ?? letters.find((q) => q.error && !outOfReach(q.error))?.error ?? null

  const rows = [
    ...(comms.data?.rows ?? []).map(commRow),
    ...targets.flatMap((t, i) =>
      (letters[i]?.data?.rows ?? []).map((row) => letterRow(t.code, row)),
    ),
  ].sort((a, b) => timeOf(b) - timeOf(a))

  return {
    rows,
    canComms,
    isLoading: comms.isLoading || journey.isLoading || Boolean(own?.isLoading),
    /** The comms read failed: the block says so and draws no list. */
    error: comms.error ?? null,
    /** A letters read failed: a line above the list, the comms still shown. */
    lettersError,
  }
}
