import type {
  DebriefAnswerInput,
  DebriefStepInput,
  DebriefStepTarget,
  DebriefTargetResponse,
  MeetingAttendedGuest,
  MeetingAttendedHost,
  NextStepKind,
} from '@pv/contracts'
import { canCloseMeetingOnBehalf, type Actor, type RoleId } from '@pv/engines'
import type { Db } from '@api/platform/db/db.module'
import { denied } from '@api/platform/http/problem'
import type { CommContact } from './comm-record.service'

/** THE SEAM BETWEEN A COMM RECORD AND THE BRANCH THAT OWNS ITS SUBJECT.
 *
 *  A close-out writes the subject's next step and is checked against config
 *  lists, and a sales run or a deal's lead are `sales` facts — all tables
 *  `platform/` may not import. So the dependency runs backward as
 *  `MESSAGE_LOGGED_HOOK` does (ADR 0049, 0074, 0075): comms asks through this
 *  token, the Sales branch answers, `app.module.ts` names both.
 *
 *  `prepare` runs BEFORE the transaction because the branch reads on the pool
 *  and PGlite holds one connection; `apply` runs inside it so the debrief and
 *  the next step commit or roll back together. */
export interface CommDebriefHook {
  /** Null when the subject takes no step from this caller: a contract, a
   *  closed lead or deal, or one outside their edit reach. */
  target(who: Actor, subjectCode: string): Promise<DebriefStepTarget | null>
  /** The step slot plus whether this caller could ever confirm a comm here:
   *  false on an open lead or deal whose step they cannot set. Read-only; the
   *  create door refuses on it and `prepare` refuses on the same predicate. */
  slot(who: Actor, subjectCode: string): Promise<DebriefTargetResponse>
  /** `target` for a page of records at once; a code with none is absent. */
  targets(who: Actor, subjectCodes: readonly string[]): Promise<Map<string, DebriefStepTarget>>
  /** The lead, deals and contract of one sales run; empty for an unknown run. */
  subjectsOfRun(workstreamCode: string): Promise<string[]>
  /** Whom a record on this subject is with, and their known addresses:
   *  `contactCode` when it is a contact of the subject's lead, else the lead's
   *  own contact person. Null = that contact belongs to another lead. */
  contactOf(subjectCode: string, contactCode: string | undefined): Promise<CommContact | null>
  /** Refuses with a problem response on an unknown or inactive criterion,
   *  answer or step kind, an unanswered required criterion, or a step on a
   *  subject that takes none. */
  prepare(who: Actor, input: CommDebriefInput): Promise<PreparedDebrief>
  apply(tx: Db, who: Actor, prepared: PreparedDebrief): Promise<void>
  /** close-meeting: the meeting behind a closed record is marked held with its
   *  attendance, inside the close's transaction. Refuses (409) a meeting not
   *  started yet, one already held, or one on a deal that no longer takes edits. */
  meetingHeld(tx: Db, who: Actor, held: MeetingHeld): Promise<void>
  /** Slot and title of booked meetings as sales holds them — the one ledger
   *  for when and what (0084). A meeting that no longer exists is absent. */
  meetingSlots(meetingIds: readonly string[]): Promise<Map<string, MeetingSlot>>
}

export type MeetingSlot = { at: Date; endsAt: Date; title: string }

/** `ownerId` is the record's owner — the one whose exchange it was, also when
 *  a superior closes on their behalf. An absent list keeps that side's
 *  attendees as they are (`MeetingDebriefClose`). */
export type MeetingHeld = {
  meetingId: string
  subjectCode: string
  ownerId: string
  hosts: readonly MeetingAttendedHost[] | undefined
  guests: readonly MeetingAttendedGuest[] | undefined
}

export type CommDebriefInput = {
  subjectCode: string
  answers: readonly DebriefAnswerInput[]
  step: DebriefStepInput | undefined
}

/** Names travel back so comms stores copies: renaming a config row later must
 *  not rewrite what somebody chose at the time. */
export type PreparedDebrief = {
  answers: Array<DebriefAnswerInput & { criterionName: string; answerName: string }>
  step: (DebriefStepInput & { kind: NextStepKind; doerId: string }) | null
}

/** Optional like `MESSAGE_LOGGED_HOOK`: with no branch bound, close-out refuses
 *  rather than closing without the checks the branch owns. */
export const COMM_DEBRIEF_HOOK = Symbol('pv.comms.comm-debrief')

/** The one sentence for "this caller can never confirm a comm on that subject",
 *  shared by the create door and the confirm so the two cannot drift. */
export const unconfirmable = (subjectCode: string) =>
  denied(
    'permission-denied',
    `Bạn không đặt được việc tiếp theo cho ${subjectCode} nên không xác nhận được liên hệ trên đó — nhờ người giữ ${subjectCode}.`,
  )

/** THE fence on a booked meeting and its record, one copy for the comm doors
 *  and the meeting doors: the owner, or an outranking closer (E2 rank) who
 *  could confirm on the subject. Reach is the caller's to have asked first. */
export const closesMeetingFor = (
  who: Actor,
  owner: { id: string; roleIds: readonly RoleId[] },
  confirmable: boolean,
): boolean =>
  who.id === owner.id || (confirmable && canCloseMeetingOnBehalf(who.roleIds, owner.roleIds))
