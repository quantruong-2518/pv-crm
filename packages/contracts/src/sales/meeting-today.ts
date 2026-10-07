import { z } from 'zod'
import { Moment, textInput } from '../primitives'
import { MEETING_TITLE_MAX, MeetingSubjectCode } from './meeting'

/** The actor's next meeting today — the home-screen nudge.
 *
 *      GET /sales/meetings/today     permission `comm.view` · own meetings only
 *
 *  "Own" is creator or host. "Today" is the Asia/Ho_Chi_Minh day, computed on
 *  the server so every client agrees on one clock. `next` is the earliest
 *  not-yet-ended meeting; `remaining` counts today's others after it. */
export const MeetingTodayResponse = z.object({
  next: z
    .object({
      id: z.string().min(1),
      subjectCode: MeetingSubjectCode,
      title: textInput(MEETING_TITLE_MAX),
      at: Moment,
      endsAt: Moment,
    })
    .nullable(),
  remaining: z.number().int().nonnegative(),
})

export type MeetingTodayResponse = z.infer<typeof MeetingTodayResponse>
