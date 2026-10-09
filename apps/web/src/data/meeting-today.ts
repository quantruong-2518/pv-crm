import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { DebriefView, MeetingTodayResponse, type MeetingDebriefClose } from '@pv/contracts'
import { api, type ApiError } from '@/app/api'
import { commClosed } from '@/data/comm-record-detail'
import { COMM_VIEW_NEED } from '@/data/comms'
import { MEETING_KEY, MEETING_TODAY_KEY } from '@/data/meetings'
import { rereadOptionsOnRefusal } from '@/data/next-step'

/** The two meeting doors that are not on one subject's list: today's next
 *  meeting (`GET /sales/meetings/today`, the countdown bar) and the close-out of
 *  a booked meeting (`POST /comms/debriefs/:id/close-meeting`, the held button).
 *
 *  No `load:`: both are real. Both ride a bare `comm.view`, as the server
 *  declares them; "own meetings only" and the closer fence are server-side. */

/** The bar is a claim about the next hour, so it re-asks every minute and on
 *  focus — the app-wide `staleTime: Infinity` would freeze it at first paint. */
const TODAY_FRESH_MS = 60_000

export const meetingTodayQuery = queryOptions({
  queryKey: MEETING_TODAY_KEY,
  queryFn: ({ signal }) =>
    api.read('/sales/meetings/today', {
      need: COMM_VIEW_NEED,
      schema: MeetingTodayResponse,
      signal,
    }),
  staleTime: TODAY_FRESH_MS,
  refetchInterval: TODAY_FRESH_MS,
  refetchOnWindowFocus: true,
})

/** The close-out: summary, answers, step and attendance in one write; the record
 *  turns `done` and the meeting `held`. No `retry` — a replay finds the record
 *  done and answers 409, which would read as a failure of a success. */
export function useCloseMeeting() {
  const client = useQueryClient()

  return useMutation<DebriefView, ApiError, { id: string; body: MeetingDebriefClose }>({
    mutationFn: ({ id, body }) =>
      api.write(`/comms/debriefs/${encodeURIComponent(id)}/close-meeting`, {
        body,
        need: COMM_VIEW_NEED,
        schema: DebriefView,
      }),
    onError: rereadOptionsOnRefusal(client),
    onSuccess: (view) => {
      commClosed(client, view)
      /* `heldAt` and per-person `attended` now differ on the list. */
      void client.invalidateQueries({ queryKey: [...MEETING_KEY, view.subject.code] })
      void client.invalidateQueries({ queryKey: MEETING_TODAY_KEY })
    },
  })
}
