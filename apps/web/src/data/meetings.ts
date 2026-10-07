import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { MeetingCreate, MeetingListResponse, MeetingPatch, MeetingRow } from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { COMM_RECORDS_KEY } from '@/data/comm-record-detail'
import { COMMS_KEY } from '@/data/comms'
import { invalidateLeadState } from '@/data/lead-exit'

/** Meetings of one lead or one deal — four doors under
 *  `/sales/{leads|opportunities}/:code/meetings` (`sales/meeting.ts`).
 *
 *  No `load:`: every door is real. The needs copy the server's `@Need` word for
 *  word (`lead.*` / `opportunity.*`, scoped) so a drift shows by comparing lines.
 *
 *  Every write re-reads the whole list rather than patching a row: `isFirst` is
 *  a property of the SET, and a backdated meeting moves the star to another row.
 *  A booking also opens a comm record (`scheduled`) and its thread, so the comm
 *  keys and today's countdown are dropped with it. */

/** `kind` picks the route; the code alone would do, but every caller already
 *  holds the kind, and a prefix parse is a second spelling of it. */
export type MeetingSubject = { kind: 'lead' | 'opportunity'; code: string }

/** The subject of a comm or a countdown, which carry only a code (`LD-`/`OP-`). */
export function meetingSubjectOf(code: string): MeetingSubject | null {
  if (code.startsWith('LD-')) return { kind: 'lead', code }
  if (code.startsWith('OP-')) return { kind: 'opportunity', code }
  return null
}

const PERMISSION = {
  lead: { read: 'lead.view', write: 'lead.edit' },
  opportunity: { read: 'opportunity.view', write: 'opportunity.edit' },
} as const

const needOf = (subject: MeetingSubject, door: 'read' | 'write'): ApiNeed => ({
  branch: 'Sales',
  permission: PERMISSION[subject.kind][door],
  scoped: true,
})

/** Prefix of every meeting key, so a write drops exactly its own part. */
export const MEETING_KEY = ['sales', 'meetings'] as const

/** Today's next meeting (`data/meeting-today.ts`); under the prefix, and no
 *  object code can collide with the word. */
export const MEETING_TODAY_KEY = [...MEETING_KEY, 'today'] as const

/** Copied from `data/leads.ts`, which exports the query, not the prefix. */
const SCORECARD_KEY = ['sales', 'lead-scorecard'] as const

const ROOT = { lead: '/sales/leads', opportunity: '/sales/opportunities' } as const
const path = (subject: MeetingSubject) =>
  `${ROOT[subject.kind]}/${encodeURIComponent(subject.code)}/meetings`

/** The code is IN the key: one list per subject, never one shared slot. */
export const meetingsQuery = (subject: MeetingSubject) =>
  queryOptions({
    queryKey: [...MEETING_KEY, subject.code] as const,
    queryFn: ({ signal }) =>
      api.read<MeetingListResponse>(path(subject), { need: needOf(subject, 'read'), signal }),
  })

/** Everything one meeting write can move: its list, the comm record behind it
 *  (state, `meeting.at`), the thread map of `meetings-card`, and the countdown. */
export function meetingsMoved(client: QueryClient, code: string) {
  void client.invalidateQueries({ queryKey: [...MEETING_KEY, code] })
  void client.invalidateQueries({ queryKey: MEETING_TODAY_KEY })
  void client.invalidateQueries({ queryKey: COMM_RECORDS_KEY })
  void client.invalidateQueries({ queryKey: [...COMMS_KEY, 'threads', code] })
}

type AddInput = { subject: MeetingSubject; body: MeetingCreate }
type EditInput = { subject: MeetingSubject; id: string; body: MeetingPatch }
type DropInput = { subject: MeetingSubject; id: string }

/** No `retry`: a replayed POST is a second meeting nothing tells apart, plus a
 *  second touch line. The form blocks the second press (`isPending`). */
export function useAddMeeting() {
  const client = useQueryClient()

  return useMutation<MeetingRow, ApiError, AddInput>({
    mutationFn: ({ subject, body }) =>
      api.write<MeetingRow>(path(subject), {
        method: 'POST',
        body,
        need: needOf(subject, 'write'),
      }),
    onSuccess: (_row, { subject }) => {
      meetingsMoved(client, subject.code)
      if (subject.kind !== 'lead') return
      /* `firstMeetings` counts leads with a meeting; a future `at` moves the
         lead to `verifying`, a past one to `working` (ADR 0063 §2). */
      void client.invalidateQueries({ queryKey: SCORECARD_KEY })
      invalidateLeadState(client)
    },
  })
}

/** The reschedule door too: a moved `at` re-orders the list and the star, and
 *  moves the lead's state on the same rule as a new meeting. */
export function useEditMeeting() {
  const client = useQueryClient()

  return useMutation<MeetingRow, ApiError, EditInput>({
    mutationFn: ({ subject, id, body }) =>
      api.write<MeetingRow>(`${path(subject)}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body,
        need: needOf(subject, 'write'),
      }),
    onSuccess: (_row, { subject }) => {
      meetingsMoved(client, subject.code)
      if (subject.kind === 'lead') invalidateLeadState(client)
    },
  })
}

export function useDropMeeting() {
  const client = useQueryClient()

  return useMutation<void, ApiError, DropInput>({
    mutationFn: ({ subject, id }) =>
      api.write<void>(`${path(subject)}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        need: needOf(subject, 'write'),
      }),
    onSuccess: (_void, { subject }) => {
      meetingsMoved(client, subject.code)
      /* Dropping a lead's LAST meeting takes it out of `firstMeetings`; the
         screen cannot tell whether it was the last, so the card re-reads. */
      if (subject.kind === 'lead') void client.invalidateQueries({ queryKey: SCORECARD_KEY })
    },
  })
}
