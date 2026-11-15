import type { ModuleRef } from '@nestjs/core'
import {
  ApprovalChainLink,
  ApprovalRequestView,
  Hold,
  HoldListQuery,
  MeetingTodayResponse,
  AssistantReadKind,
  type AssistantRef,
  type ListMyWorkInput,
  type MyWorkSection,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { z } from 'zod'
import { door, type WorkItem } from '@api/platform/assistant/assistant-tools'
import { maskContact } from '@api/platform/assistant/assistant-contact'
import { ApprovalController } from '@api/platform/approval/approval.controller'
import { ApprovalService } from '@api/platform/approval/approval.service'
import { PvError } from '@api/platform/http/problem'
import { zod } from '@api/platform/http/zod.pipe'
import { HoldController } from '../hold/hold.controller'
import { HoldService } from '../hold/hold.service'
import { MeetingTodayController } from '../meeting/meeting-today.controller'
import { MeetingService } from '../meeting/meeting.service'
import { kindOfCode } from './record-read-kit'

/** The secondary sections of `list_my_work`: what waits on the asker to approve,
 *  what they have parked (their own holds) and their meetings today. Each is read
 *  only when its kind is named, so a plain call keeps the desk's size, and only
 *  behind its own open door and is fetched lazily, so a denied section never touches
 *  its service. A refusal by the service itself (403 or 404) reads as `refused`, like
 *  `get_history`'s `skipped`: the model must say it cannot see that part, not "none".
 *
 *  Codes, enums and dates are `trusted`; names and free text are `untrusted` and cut
 *  of phone and email without `data.export`. A meeting carries no title, link or
 *  guests, and not the record it is about: the door returns the next one and a count. */

/** Rows per list, as the lead and deal books; declared here because `list-my-work.ts`
 *  already imports this file, so the other way round would be an import cycle. */
export const LIST_SIZE = 20

export type ExtraSection = 'approval' | 'parked' | 'meeting'

/** Step and hold levels that are today's work (ADR 0154 §1): a step not yet due is not. */
export const TODAY_LEVELS: ReadonlySet<string> = new Set(['due', 'overdue', 'long-overdue'])

/** Two doors for approvals: the inbox and the asker's own requests are two routes. */
export const EXTRA_DOORS = {
  approvalWaiting: door(ApprovalController, 'pending'),
  approvalRaised: door(ApprovalController, 'mine'),
  hold: door(HoldController, 'list'),
  meeting: door(MeetingTodayController, 'today'),
} as const
export type ExtraDoor = keyof typeof EXTRA_DOORS

export const SECTION_OF_DOOR: Record<ExtraDoor, ExtraSection> = {
  approvalWaiting: 'approval',
  approvalRaised: 'approval',
  hold: 'parked',
  meeting: 'meeting',
}

export type ExtraDeps = {
  modules: ModuleRef
  /** The one `data.export` rule, as `get_record` reads it. */
  mayReach: (who: Actor) => boolean
  refOf: (who: Actor, kind: AssistantRef['kind'], code: string, label: string) => AssistantRef
}

const ApprovalTrusted = ApprovalRequestView.pick({
  kind: true,
  state: true,
  raisedAt: true,
  fromAi: true,
  decidedAt: true,
}).extend({ links: z.array(AssistantReadKind.nullable()), due: ApprovalChainLink.shape.due })

const HoldTrusted = Hold.pick({
  subjectType: true,
  code: true,
  until: true,
  setAt: true,
  dueLevel: true,
})

const NextMeeting = MeetingTodayResponse.shape.next.unwrap()
const MeetingTrusted = z.object({
  next: NextMeeting.pick({ at: true, endsAt: true }).nullable(),
  remaining: MeetingTodayResponse.shape.remaining,
})

/** Null = the service refused (403 or 404); anything else is a failure. */
export async function soft<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read()
  } catch (error) {
    const status = error instanceof PvError ? error.getStatus() : null
    if (status === 403 || status === 404) return null
    throw error
  }
}

export const listOf = <R, V>(rows: readonly R[], row: (r: R) => V) => ({
  rows: rows.slice(0, LIST_SIZE).map(row),
  more: rows.length > LIST_SIZE,
})

export type Extra<S extends string = ExtraSection> = {
  data: Record<string, object>
  /** Sections the service itself refused, on top of the doors the gate shut. */
  refused: S[]
  rowCount: number
  refs: AssistantRef[]
  /** The refs whose code is stored with the call: only what its re-check door reaches. */
  codes: string[]
  workItems: WorkItem[]
  /** Sections whose items are known incomplete; the extra sections read whole. */
  workCut: MyWorkSection[]
}

export async function readExtra(
  d: ExtraDeps,
  who: Actor,
  kind: ListMyWorkInput['kind'],
  open: { has(door: ExtraDoor): boolean },
): Promise<Extra> {
  const ask = <T>(section: ExtraSection, doorKey: ExtraDoor, read: () => Promise<T>) =>
    kind === section && open.has(doorKey) ? soft(read) : undefined
  const get = <T>(token: new (...args: never[]) => T) => d.modules.get(token, { strict: false })
  const [waiting, raised, holds, meeting] = await Promise.all([
    ask('approval', 'approvalWaiting', () => get(ApprovalService).pendingFor(who)),
    ask('approval', 'approvalRaised', () => get(ApprovalService).raisedBy(who)),
    ask('parked', 'hold', () => get(HoldService).list(who, zod(HoldListQuery).transform({}))),
    ask('meeting', 'meeting', () => get(MeetingService).today(who)),
  ])
  /* Resolved on the first text only: a meeting or a desk kind reads none, so it needs no grant. */
  let mayReach: boolean | undefined
  const shown = <T>(value: T): T => {
    mayReach ??= d.mayReach(who)
    return mayReach ? value : (maskContact(value) as T)
  }
  const refs: AssistantRef[] = []
  const workItems: WorkItem[] = []

  /* A link keeps its kind and label, never its code: a code would be re-checked on reload
     through a stricter book door, and the whole answer withheld if the asker cannot open it. */
  const approvalRow = (r: ApprovalRequestView) => ({
    trusted: ApprovalTrusted.parse({
      ...r,
      links: r.links.map((l) => kindOfCode(l.objectCode)),
      due: r.chain.find((c) => c.state === 'waiting')?.due,
    }),
    untrusted: shown({
      raisedBy: r.raisedBy,
      consequence: r.consequence,
      links: r.links.map((l) => l.objectLabel),
      decidedReason: r.decidedReason,
    }),
  })
  /* Own = the person holding the subject now; a row set by the asker on another's record is not. */
  const own = holds?.rows.filter((r) => r.holder?.id === who.id)
  const holdRow = (r: NonNullable<typeof own>[number]) => {
    refs.push(d.refOf(who, r.subjectType, r.code, r.subjectType === 'lead' ? r.customer : r.name))
    return {
      trusted: HoldTrusted.parse(r),
      untrusted: shown({ name: r.name, customer: r.customer, note: r.note }),
    }
  }

  /* Items come from the whole read, not the LIST_SIZE rows shown; raised approvals never count. */
  workItems.push(
    ...(own ?? [])
      .filter((r) => TODAY_LEVELS.has(r.dueLevel))
      .map((r) => ({ section: 'parked' as const, code: r.code })),
  )
  if (waiting && raised) {
    workItems.push(...waiting.rows.map(() => ({ section: 'approval' as const, code: null })))
  }
  const meetingCount = meeting ? (meeting.next ? 1 : 0) + meeting.remaining : 0
  for (let i = 0; i < meetingCount; i++) workItems.push({ section: 'meeting', code: null })

  const data = {
    ...(waiting &&
      raised && {
        approvals: {
          waitingOnMe: listOf(waiting.rows, approvalRow),
          raisedByMe: listOf(raised.rows, approvalRow),
        },
      }),
    ...(own && { holds: listOf(own, holdRow) }),
    ...(meeting && {
      meeting: { trusted: MeetingTrusted.parse(meeting) },
    }),
  }
  const refused: ExtraSection[] = [
    ...(waiting === null || raised === null ? (['approval'] as const) : []),
    ...(holds === null ? (['parked'] as const) : []),
    ...(meeting === null ? (['meeting'] as const) : []),
  ]
  const rowCount =
    (data.approvals
      ? data.approvals.waitingOnMe.rows.length + data.approvals.raisedByMe.rows.length
      : 0) +
    (data.holds?.rows.length ?? 0) +
    (meeting?.next ? 1 : 0)
  return { data, refused, rowCount, refs, codes: refs.map((r) => r.code), workItems, workCut: [] }
}
