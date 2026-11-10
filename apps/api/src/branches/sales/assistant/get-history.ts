import {
  DebriefListQuery,
  DebriefStepCopy,
  DebriefView,
  GetHistoryInput,
  MeetingRow,
  NextStepKind,
  ObjectCode,
  TouchHolder,
  TouchRow,
  type AssistantRef,
  type DebriefListResponse,
  type MeetingListResponse,
  type TouchTimelineResponse,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { z } from 'zod'
import { maskContact } from '@api/platform/assistant/assistant-contact'
import {
  defineTool,
  door,
  type AssistantTool,
  type ToolRead,
} from '@api/platform/assistant/assistant-tools'
import { DebriefController } from '@api/platform/comms/debrief.controller'
import type { DebriefService } from '@api/platform/comms/debrief.service'
import { denied, PvError } from '@api/platform/http/problem'
import { zod } from '@api/platform/http/zod.pipe'
import { LeadController } from '../lead/lead.controller'
import type { LeadService } from '../lead/lead.service'
import { OpportunityController } from '../opportunity/opportunity.controller'
import type { OpportunityService } from '../opportunity/opportunity.service'

/** `get_history`: what happened with one lead or deal, from three doors: the
 *  touches (primary), the contact records and the meetings.
 *
 *  Comms fences by the mirror row's single owner, narrower than Sales, so a
 *  co-owner or carer opens the touches and is refused there. That refusal is
 *  `skipped`, never "no history": the model says it cannot see that part. A
 *  summary arrives only when the comms door itself reveals it (`comm.view-content`,
 *  audited there; a stored answer is re-checked against the same reach, without
 *  reading a summary). Meetings come through the no-transcript read, so no transcript,
 *  message body or attachment is loaded, and none is audited as read. */

/** Rows per list, newest first. Typical summaries fit the loop's `TOOL_TOKEN_CAP`; twenty
 *  at `DEBRIEF_SUMMARY_MAX` in 3-byte script go over, and the loop drops the read whole. */
export const HISTORY_LIST = 20

type Part = 'comms' | 'meetings'

const KEYS = {
  lead: { touches: 'leadTouches', meetings: 'leadMeetings' },
  opportunity: { touches: 'dealTouches', meetings: 'dealMeetings' },
} as const

const TouchTrusted = TouchRow.pick({
  at: true,
  kind: true,
  subjectKind: true,
  subjectCode: true,
  toTier: true,
}).extend({ toRole: TouchHolder.shape.role })

const CommTrusted = DebriefView.pick({
  id: true,
  channel: true,
  state: true,
  late: true,
  createdAt: true,
  closedAt: true,
}).extend({
  step: z.object({ kind: NextStepKind.shape.id, due: DebriefStepCopy.shape.due }).nullable(),
  meeting: DebriefView.shape.meeting.unwrap().pick({ at: true, endsAt: true }).nullable(),
  summaryShown: z.boolean(),
})

const MeetingTrusted = MeetingRow.pick({
  at: true,
  heldAt: true,
  cancelledAt: true,
  cancelCause: true,
  mode: true,
  durationMinutes: true,
  isFirst: true,
})

export type HistoryDoors = {
  leads: LeadService
  opportunities: OpportunityService
  /** Resolved per call: comms exports nothing a branch module could import. */
  debriefs: () => DebriefService
  mayReach: (who: Actor) => boolean
  refOf: (who: Actor, kind: GetHistoryInput['kind'], code: string, label: string) => AssistantRef
}

/** What each list needs of a row: its date to order by, and the two halves. */
type Shape<R> = {
  at: (row: R) => string
  trusted: (row: R) => object
  untrusted: (row: R) => object
}

/** Null = the door was shut or refused, and the key is left out, not sent empty. */
function historyList<R>(found: { rows: readonly R[] } | null, shape: Shape<R>, mayReach: boolean) {
  if (!found) return null
  const newest = [...found.rows].sort((a, b) => Date.parse(shape.at(b)) - Date.parse(shape.at(a)))
  const rows = newest.slice(0, HISTORY_LIST)
  const raw = rows.map(shape.untrusted)
  const shown = mayReach ? raw : (maskContact(raw) as typeof raw)
  return {
    withheld: JSON.stringify(shown) !== JSON.stringify(raw),
    cut: rows,
    list: {
      /* The door's own fenced count: it pages nothing, so it is also the total. */
      trusted: { count: found.rows.length, more: found.rows.length > rows.length },
      rows: rows.map((row, i) => ({ trusted: shape.trusted(row), untrusted: shown[i] })),
    },
  }
}

const touchShape: Shape<TouchTimelineResponse['rows'][number]> = {
  at: (r) => r.at,
  trusted: (r) => TouchTrusted.parse({ ...r, toRole: r.to?.role }),
  untrusted: (r) => ({ by: r.by, from: r.from?.name, to: r.to?.name, note: r.note }),
}

const summaryShown = (r: DebriefListResponse['rows'][number]): boolean =>
  r.summary.state === 'visible'

const commShape: Shape<DebriefListResponse['rows'][number]> = {
  at: (r) => r.createdAt,
  trusted: (r) =>
    CommTrusted.parse({
      ...r,
      step: r.step && { kind: r.step.kind.id, due: r.step.due },
      summaryShown: summaryShown(r),
    }),
  untrusted: (r) => ({
    title: r.title,
    answers: r.answers.map((a) => ({ criterion: a.criterionName, answer: a.answerName })),
    step: r.step && { kind: r.step.kind.name, text: r.step.text },
    meeting: r.meeting && { title: r.meeting.title },
    owner: r.owner.name,
    summary: r.summary.state === 'visible' ? r.summary.text : undefined,
  }),
}

const meetingShape: Shape<MeetingListResponse['rows'][number]> = {
  at: (r) => r.at,
  trusted: (r) => MeetingTrusted.parse(r),
  untrusted: (r) => ({
    title: r.title,
    hosts: r.hosts.map((h) => h.name),
    guests: r.guests.map((g) => g.name),
    goal: r.goal,
  }),
}

/** 403 and 404 from a part that is not the primary door: told apart from a failure. */
async function soft<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read()
  } catch (error) {
    const status = error instanceof PvError ? error.getStatus() : null
    if (status === 403 || status === 404) return null
    throw error
  }
}

async function run(
  d: HistoryDoors,
  who: Actor,
  { kind, code }: GetHistoryInput,
  open: ReadonlySet<string>,
): Promise<ToolRead> {
  const keys = KEYS[kind]
  /* Comms or meetings open alone must not read the record past its own door. */
  if (!open.has(keys.touches)) throw denied('permission-denied')
  const record = zod(ObjectCode).transform(code)
  const query = zod(DebriefListQuery).transform({ subjectCode: record })
  const service = kind === 'lead' ? d.leads : d.opportunities
  /* Touches first: a record the person cannot open reaches no summary and no audit line. */
  const touches = await service.touches(who, record)
  const [comms, meetings] = await Promise.all([
    open.has('comms') ? soft(() => d.debriefs().list(who, query)) : null,
    open.has(keys.meetings) ? soft(() => service.meetingTimeline(who, record)) : null,
  ])
  const mayReach = d.mayReach(who)
  const lists = {
    touches: historyList(touches, touchShape, mayReach),
    comms: historyList(comms, commShape, mayReach),
    meetings: historyList(meetings, meetingShape, mayReach),
  }
  const skipped: Part[] = [
    ...(comms ? [] : (['comms'] as const)),
    ...(meetings ? [] : (['meetings'] as const)),
  ]
  const contactInfoWithheld = Object.values(lists).some((l) => l?.withheld)
  const label = comms?.rows[0]?.subject.label ?? code
  const ref = d.refOf(who, kind, record, label)
  /* Rows past the 20-row cut never reach the model, so they reveal nothing stored. */
  const revealsContent = lists.comms?.cut.some(summaryShown) ?? false
  const shown = Object.values(lists).reduce((sum, l) => sum + (l?.list.rows.length ?? 0), 0)
  return {
    data: {
      trusted: { kind, code: record, skipped },
      touches: lists.touches?.list,
      ...(lists.comms && { comms: lists.comms.list }),
      ...(lists.meetings && { meetings: lists.meetings.list }),
      ...(contactInfoWithheld && { contactInfoWithheld }),
    },
    codes: [record],
    rowCount: shown,
    hidden: null,
    refs: [ref],
    revealsContent,
  }
}

export const getHistory = (d: HistoryDoors): AssistantTool =>
  defineTool({
    name: 'get_history',
    description:
      'The history of one lead or opportunity by its code: what happened (touches), the contact records with their steps and summaries, and the meetings. Newest first. Use it for when and how it was last contacted, what was agreed and what comes next.',
    input: GetHistoryInput,
    doors: {
      leadTouches: door(LeadController, 'touches'),
      dealTouches: door(OpportunityController, 'touches'),
      comms: door(DebriefController, 'list'),
      leadMeetings: door(LeadController, 'meetings'),
      dealMeetings: door(OpportunityController, 'meetings'),
    },
    optional: ['comms', 'leadMeetings', 'dealMeetings'],
    reveals: 'comm.view-content',
    revealReach: { door: 'comms', read: (who, codes) => d.debriefs().reachable(who, codes) },
    doorFor: ({ kind }) => [KEYS[kind].touches, 'comms', KEYS[kind].meetings],
    run: (who, input, open) => run(d, who, input, open),
  })
