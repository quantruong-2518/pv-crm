import { randomUUID } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { highestRank, roleRank, type Actor } from '@pv/engines'
import {
  MeetingListResponse,
  MeetingRow,
  MeetingTodayResponse,
  type MeetingAttendedGuest,
  type MeetingCalendarState,
  type MeetingAttendedHost,
  type MeetingCreate,
  type MeetingPatch,
} from '@pv/contracts'
import {
  COMM_DEBRIEF_HOOK,
  closesMeetingFor,
  unconfirmable,
  type CommDebriefHook,
  type MeetingHeld,
  type MeetingSlot,
} from '@api/platform/comms/comm-debrief.hook'
import { CommRecordService } from '@api/platform/comms/comm-record.service'
import type { Db } from '@api/platform/db/db.module'
import { PvError, conflict, denied, invalid, notFound } from '@api/platform/http/problem'
import { ActorRepository } from '@api/platform/session/actor.repository'
import { LeadStateWriter } from '../lead/lead-state'
import { editDetailsVerdict } from '../opportunity/opportunity-acts'
import { TouchService, byOf } from '../touch/touch.service'
import { MeetingCalendar } from './meeting-calendar'
import { MeetingRepository } from './meeting.repository'
import { firstMeetingId, meetingEndOf, toContract } from './meeting.mapper'
import type { MeetingAttendeeRowDb, MeetingAttendeeValues, MeetingRowDb } from './meeting.schema'

/** The meeting book of a lead or a deal — a facility, shaped like `TouchService`.
 *
 *  No controller and no permission check of its own: the four doors live on
 *  `LeadController` and `OpportunityController` under `:code/meetings`, whose
 *  services have asked "is this subject real and in your scope" before calling
 *  down (contract docblock: why `:id` hangs under `:code`).
 *
 *  Booking a meeting opens its comm record at once, `scheduled` (ADR 0075 §3):
 *  the meeting row, its attendees, its touch and the record commit in ONE
 *  transaction, and a reschedule or a drop moves the record in the same one.
 *  close-meeting closes the record and marks the meeting held (`markHeld`).
 *  Changing a booking takes the fence the close takes (`closesMeetingFor`);
 *  on a deal every write also takes the deal's "editable until lost" rule. */
@Injectable()
export class MeetingService {
  private readonly log = new Logger('meeting')

  constructor(
    private readonly repo: MeetingRepository,
    private readonly touch: TouchService,
    /* A meeting by the lead's holder moves the state — see `moveLead` below. */
    private readonly states: LeadStateWriter,
    private readonly records: CommRecordService,
    private readonly actors: ActorRepository,
    private readonly calendar: MeetingCalendar,
    /* The debrief hook is reached by token at call time: its module imports
       this one (and `LeadModule`), so a constructor injection is a cycle. */
    private readonly modules: ModuleRef,
  ) {}

  /** Every meeting of one subject, newest first, with the first-meeting flag. */
  async timeline(code: string): Promise<MeetingListResponse> {
    const rows = await this.repo.bySubject(code)
    const attendees = await this.repo.attendeesOf(rows.map((r) => r.id))
    const firstId = firstMeetingId(rows)

    return MeetingListResponse.parse({
      rows: rows.map((row) =>
        toContract(
          row,
          attendees.filter((a) => a.meetingId === row.id),
          row.id === firstId,
        ),
      ),
    })
  }

  /** Book a meeting (or write one up after the fact).
   *
   *  The id is minted here so the comm record can be opened FIRST and the
   *  meeting rows ride its transaction (`also`): one commit for the thread,
   *  the `scheduled` record, the meeting, its attendees and its touch.
   *
   *  A meeting written up after it started opens its booked record like any
   *  other, but the lead move and the touch wait for close-meeting (`markHeld`):
   *  until then the meeting, its record and the lead all read "not closed out". */
  async record(who: Actor, code: string, body: MeetingCreate): Promise<MeetingRow> {
    const id = randomUUID()
    const at = new Date(body.at)
    await this.dealEditable(undefined, code)
    await this.guestsBelongHere(undefined, code, body.guests)

    const ahead = at.getTime() > Date.now()
    await this.openRecord(who, { id, subjectCode: code, at }, body.guests, async (tx) => {
      const already = ahead ? await this.repo.countOf(tx, code) : 0
      await this.repo.insert(tx, {
        id,
        subjectCode: code,
        at,
        title: body.title,
        link: body.link ?? null,
        durationMinutes: body.durationMinutes,
        mode: body.mode,
        goal: body.goal ?? null,
        by: who.name,
        createdBy: who.id,
      })
      await this.repo.setAttendees(tx, id, attendeesOf(id, body))
      if (!ahead) return
      await this.moveLead(tx, code, who.id, at)
      await this.writeTouch(tx, who, { subjectCode: code, at, title: body.title }, already)
    })
    /* After the commit, never inside it: Google cannot fail or hold the booking. */
    return this.one(code, id, await this.calendar.push(id))
  }

  /** Edit a booking. No touch row: fixing a title is not something that
   *  happened with the customer. Slot and title live on this row alone; a new
   *  `at` also moves the lead by the OWNER (`moveLead`) and the record's
   *  booking turn (`reschedule`). A held meeting is history and refuses. */
  async amend(who: Actor, code: string, id: string, body: MeetingPatch): Promise<MeetingRow> {
    const current = await this.changeable(who, code, id)
    const at = body.at === undefined ? current.at : new Date(body.at)

    /* Read BEFORE the transaction: a pool read inside it would be a read
       outside the transaction dressed as one inside. */
    const before =
      body.hosts === undefined || body.guests === undefined
        ? (await this.timeline(code)).rows.find((r) => r.id === id)
        : undefined

    await this.repo.run(async (tx) => {
      await this.stillOpen(tx, id)
      await this.repo.update(tx, id, {
        ...(body.at === undefined ? {} : { at }),
        ...(body.title === undefined ? {} : { title: body.title }),
        /* Absent = untouched, and zod turns "" into absent, so no PATCH clears
           a link. `transcript` has no write door since ADR 0074 §9. */
        ...(body.link === undefined ? {} : { link: body.link }),
        ...(body.durationMinutes === undefined ? {} : { durationMinutes: body.durationMinutes }),
        ...(body.mode === undefined ? {} : { mode: body.mode }),
        ...(body.goal === undefined ? {} : { goal: body.goal }),
      })

      if (body.hosts !== undefined || body.guests !== undefined) {
        await this.guestsBelongHere(tx, code, body.guests)
        await this.repo.setAttendees(
          tx,
          id,
          attendeesOf(id, {
            hosts: body.hosts ?? (before?.hosts ?? []).map(requireActor),
            guests:
              body.guests ??
              (before?.guests ?? []).map((g) => ({
                name: g.name,
                ...(g.role ? { role: g.role } : {}),
                /* `setAttendees` REPLACES the list: dropping the code here
                   would unlink every guest on a title fix. */
                ...(g.contactCode ? { contactCode: g.contactCode } : {}),
              })),
          }),
        )
      }

      if (body.at === undefined) return
      if (current.createdBy) await this.moveLead(tx, code, current.createdBy, at)
      await this.records.reschedule(tx, id, at)
    })
    /* Every patchable field shows on the event (`link` as its location). */
    return this.one(code, id, await this.calendar.push(id))
  }

  /** Only a meeting still ahead and not held may go, and only while its comm
   *  record holds nothing but the booking (`dropBooked`); files leave storage
   *  after the commit. */
  async drop(who: Actor, code: string, id: string): Promise<void> {
    const row = await this.changeable(who, code, id)
    if (row.at.getTime() <= Date.now()) {
      throw conflict('Lịch họp đã diễn ra nên không thể xoá.')
    }
    const files = await this.repo.run(async (tx) => {
      await this.stillOpen(tx, id)
      const keys = await this.records.dropBooked(tx, id, {
        actorId: who.id,
        subjectCode: code,
        ownerId: row.createdBy,
      })
      await this.repo.remove(tx, id)
      return keys
    })
    /* The event first: it mails the guests, so a storage hiccup must not
       leave a cancelled meeting on their calendars. */
    await this.afterDrop('calendar', row.id, () => this.calendar.forget(row))
    await this.afterDrop('files', row.id, () => this.records.forgetFiles(files))
  }

  /** The row is already gone: a cleanup that fails is logged, never the caller's 500. */
  private async afterDrop(step: string, id: string, run: () => Promise<void>): Promise<void> {
    try {
      await run()
    } catch (error) {
      this.log.warn(`drop ${id}: ${step} cleanup failed — ${(error as Error).message}`)
    }
  }

  /** close-meeting, inside the record's close transaction (`CommDebriefHook.meetingHeld`):
   *  the mark, the attendance as it happened, and the lead moved as an
   *  exchange OF THE OWNER — whoever closes, the meeting was theirs. A meeting
   *  written up after the fact takes here the touch its booking deferred. */
  async markHeld(tx: Db, who: Actor, held: MeetingHeld): Promise<void> {
    const row = await this.repo.lock(tx, held.meetingId)
    if (!row || row.subjectCode !== held.subjectCode) {
      throw new Error(`meeting ${held.meetingId} is not on ${held.subjectCode}`)
    }
    if (row.heldAt) throw conflict('Cuộc họp này đã được chốt họp xong.')
    if (row.at.getTime() > Date.now()) {
      throw conflict('Cuộc họp chưa bắt đầu nên chưa chốt “Họp xong” được.')
    }
    await this.dealEditable(tx, row.subjectCode)
    await this.guestsBelongHere(tx, row.subjectCode, held.guests)
    await this.repo.update(tx, row.id, { heldAt: new Date() })
    if (held.hosts !== undefined || held.guests !== undefined) {
      const kept = await this.repo.attendeesOf([row.id], tx)
      await this.repo.setAttendees(tx, row.id, [
        ...(held.hosts ? attendeesOf(row.id, { hosts: held.hosts }) : keptSide(kept, 'host')),
        ...(held.guests ? attendeesOf(row.id, { guests: held.guests }) : keptSide(kept, 'guest')),
      ])
    }
    if (row.subjectCode.startsWith('LD-')) {
      await this.states.exchanged(tx, [row.subjectCode], held.ownerId)
    }
    const deferred = row.at.getTime() <= row.createdAt.getTime()
    if (deferred && !(await this.repo.hasMeetingTouch(tx, row.subjectCode, row.at))) {
      const already = await this.repo.countOf(tx, row.subjectCode, row.createdAt)
      await this.writeTouch(tx, who, row, already)
    }
  }

  /** Slot and title for comms (`CommDebriefHook.meetingSlots`); a pre-0050 row
   *  has no length, so it ends where it starts. */
  async slots(ids: readonly string[]): Promise<Map<string, MeetingSlot>> {
    const rows = await this.repo.byIds(ids)
    return new Map(
      rows.map((r) => [r.id, { at: r.at, endsAt: meetingEndOf(r) ?? r.at, title: r.title }]),
    )
  }

  /** The caller's next meeting today and how many more follow.
   *
   *  "Today" is the Asia/Ho_Chi_Minh calendar day, computed here so every
   *  client agrees: Vietnam is UTC+7 all year (no DST), so the day starts at
   *  17:00 UTC of the previous UTC date. Own = booked or hosted by the caller;
   *  held or already-ended meetings are not "next". */
  async today(who: Actor): Promise<MeetingTodayResponse> {
    const now = new Date()
    const from = new Date(
      Math.floor((now.getTime() + HCM_OFFSET_MS) / DAY_MS) * DAY_MS - HCM_OFFSET_MS,
    )
    const to = new Date(from.getTime() + DAY_MS)
    const [next, ...rest] = await this.repo.upcomingOf(who.id, from, to, now)
    return MeetingTodayResponse.parse({
      next: next
        ? {
            id: next.id,
            subjectCode: next.subjectCode,
            title: next.title,
            at: next.at.toISOString(),
            endsAt: (meetingEndOf(next) ?? next.at).toISOString(),
            ...(next.mode ? { mode: next.mode } : {}),
            ...(next.link ? { link: next.link } : {}),
            ...(next.googleEventUrl ? { eventUrl: next.googleEventUrl } : {}),
          }
        : null,
      remaining: rest.length,
    })
  }

  /** One-off backfill: a meeting not held that has no comm record gets a
   *  booked one through the same opener as `record` — a past one too, which
   *  close-meeting then closes. Idempotent per (meeting, owner), as `open` is. */
  async fileBooked(id: string): Promise<'opened' | 'skipped'> {
    const row = await this.repo.byId(id)
    if (!row || row.heldAt || !row.createdBy) return 'skipped'
    const owner = await this.actors.byId(row.createdBy)
    if (!owner) return 'skipped'
    await this.dealEditable(undefined, row.subjectCode)
    const guests = (await this.repo.attendeesOf([id])).filter((a) => a.side === 'guest')
    await this.openRecord(
      owner.actor,
      { id, subjectCode: row.subjectCode, at: row.at },
      guests.map((g) => (g.contactCode ? { contactCode: g.contactCode } : {})),
    )
    return 'opened'
  }

  /** Minutes logged through comms must name a meeting of THIS subject (ADR
   *  0074 §9). Read on the turn's `tx`: a pool read waits on PGlite's one
   *  connection. 400 for "unknown" and "another subject's" alike. */
  async assertOnSubject(tx: Db, code: string, id: string): Promise<void> {
    const row = await this.repo.byId(id, tx)
    if (row?.subjectCode === code) return
    throw invalid(
      { meetingId: [`Cuộc họp này không thuộc ${code} — chọn một cuộc họp của chính ${code}.`] },
      `Cuộc họp không thuộc ${code}.`,
    )
  }

  /** The scheduled comm record, owned by `owner`, filed under the first guest
   *  picked from the contact book (else the lead's own contact person, as the
   *  call buttons do). Refused up front when the owner could never confirm it,
   *  and an address problem names the guest list, the field the form shows. */
  private async openRecord(
    owner: Actor,
    m: { id: string; subjectCode: string; at: Date },
    guests: readonly { contactCode?: string | undefined }[],
    also?: (tx: Db) => Promise<void>,
  ): Promise<void> {
    const hook = this.modules.get<CommDebriefHook>(COMM_DEBRIEF_HOOK, { strict: false })
    if (!(await hook.slot(owner, m.subjectCode)).confirmable) throw unconfirmable(m.subjectCode)
    const guestCode = guests.find((g) => g.contactCode !== undefined)?.contactCode
    const person = await hook.contactOf(m.subjectCode, guestCode)
    try {
      await this.records.open(
        {
          channel: 'meeting',
          meetingId: m.id,
          subjectCode: m.subjectCode,
          ownerId: owner.id,
          contactCode: person?.code ?? guestCode,
          addresses: person ? { phone: person.phone, email: person.email } : undefined,
          sameLead: person?.sameLead,
          at: m.at,
          booked: true,
        },
        also,
      )
    } catch (error) {
      const why = error instanceof PvError ? error.fields?.['contactCode'] : undefined
      if (!why || !(error instanceof PvError)) throw error
      throw invalid({ guests: why }, error.message)
    }
  }

  /** THE meeting rule (ADR 0063 §2), for the booking and the reschedule: a
   *  meeting still ahead is care SCHEDULED, by its OWNER. The exchange is
   *  logged by close-meeting alone (`markHeld`), never by a clock. Owner-only and
   *  forward-only; on a deal there is no lead state to move. */
  private moveLead(tx: Db, code: string, ownerId: string, at: Date): Promise<void> {
    if (!code.startsWith('LD-') || at.getTime() <= Date.now()) return Promise.resolve()
    return this.states.scheduled(tx, [code], ownerId)
  }

  /** The timeline row: `first-meeting` when the book held no meeting of this
   *  LEAD before this one was typed, else `contacted` — on a deal always the
   *  latter, the customer was first met on its lead. */
  private writeTouch(
    tx: Db,
    who: Actor,
    m: { subjectCode: string; at: Date; title: string },
    already: number,
  ): Promise<void> {
    const first = already === 0 && m.subjectCode.startsWith('LD-')
    return this.touch.record(tx, [
      {
        subjectCode: m.subjectCode,
        subjectKind: m.subjectCode.startsWith('OP-') ? 'opportunity' : 'lead',
        kind: first ? 'first-meeting' : 'contacted',
        ...byOf(who),
        note: noteOf(m.at, m.title, first),
        /* The timeline's mark is when the meeting IS, not when it was typed. */
        at: m.at,
      },
    ])
  }

  /** On a deal, every meeting write takes the deal's own "editable until lost"
   *  rule (`editDetailsVerdict`), the one its profile and contacts doors take. */
  private async dealEditable(handle: Db | undefined, code: string): Promise<void> {
    if (!code.startsWith('OP-')) return
    const deal = await this.repo.dealOf(code, handle)
    if (!deal) throw notFound('cơ hội', code)
    const verdict = editDetailsVerdict(deal)
    if (!verdict.ok) throw conflict(verdict.reason)
  }

  /** Re-read under the row lock inside the write: close-meeting may have
   *  landed since `changeable` read the row on the pool. */
  private async stillOpen(tx: Db, id: string): Promise<void> {
    const row = await this.repo.lock(tx, id)
    if (!row) throw notFound('cuộc họp', id)
    if (row.heldAt) throw conflict(HELD)
  }

  /** Every `contactCode` must name somebody in the subject's own contact book
   *  — the lead on the path, or the lead a deal grew from. The FK only asks
   *  "is this code in `sales.contact`", so without this an `ownOnly` seat could
   *  link another department's contact and read the name back. Same 400 for
   *  "not in the book" and "another lead's": telling them apart would confirm
   *  the code exists elsewhere. `handle` undefined = the pool, before a tx. */
  private async guestsBelongHere(
    handle: Db | undefined,
    subjectCode: string,
    guests: readonly { contactCode?: string | undefined }[] | undefined,
  ): Promise<void> {
    if (guests === undefined) return

    const codes = [...new Set(guests.map((g) => g.contactCode).filter((c) => c !== undefined))]
    if (codes.length === 0) return

    const leadCode = await this.repo.leadOfSubject(subjectCode, handle)
    const found = await this.repo.contactLeadsOf(codes, handle)
    const stray = codes.filter((c) => found.find((f) => f.code === c)?.leadCode !== leadCode)
    if (stray.length === 0) return

    throw invalid(
      {
        guests: [
          `Người liên hệ ${stray.join(', ')} không thuộc ${subjectCode} — chỉ chọn được người trong sổ liên hệ của chính ${subjectCode}.`,
        ],
      },
      `Người dự không thuộc ${subjectCode}.`,
    )
  }

  /** The meeting exists, hangs off the subject on the path (404 otherwise —
   *  the caller must not learn it exists elsewhere), is not held yet, its deal
   *  still takes edits, and the caller is its booker or outranks them
   *  (`closesMeetingFor`). Pool reads; the write re-checks under lock (`stillOpen`). */
  private async changeable(who: Actor, code: string, id: string): Promise<MeetingRowDb> {
    const row = await this.repo.byId(id)
    if (!row || row.subjectCode !== code) throw notFound('cuộc họp', id)
    if (row.heldAt) throw conflict(HELD)
    await this.dealEditable(undefined, code)
    const owner = row.createdBy ? await this.actors.byId(row.createdBy) : null
    if (owner?.actor.id === who.id) return row
    const hook = this.modules.get<CommDebriefHook>(COMM_DEBRIEF_HOOK, { strict: false })
    const confirmable = (await hook.slot(who, code)).confirmable
    if (owner && closesMeetingFor(who, owner.actor, confirmable)) return row
    /* No owner left to outrank (pre-`created_by` row, or actor gone): only the
       top of the ladder may stand in, never every editor. */
    if (!owner && confirmable && highestRank(who.roleIds) >= roleRank('head-of-sales')) return row
    throw denied(
      'permission-denied',
      owner
        ? `Chỉ ${owner.actor.name} hoặc cấp trên của ${owner.actor.name} mới đổi được lịch họp này.`
        : 'Lịch họp này không còn người đặt — chỉ trưởng phòng kinh doanh hoặc giám đốc đổi được.',
    )
  }

  private async one(code: string, id: string, calendar: MeetingCalendarState): Promise<MeetingRow> {
    const list = await this.timeline(code)
    const row = list.rows.find((r) => r.id === id)
    if (!row) throw notFound('cuộc họp', id)
    return MeetingRow.parse({ ...row, calendar })
  }
}

const HELD = 'Cuộc họp đã họp xong nên không sửa hay xoá được.'
const DAY_MS = 86_400_000
/** Asia/Ho_Chi_Minh is UTC+7 with no daylight saving. */
const HCM_OFFSET_MS = 7 * 3_600_000

/** The timeline sentence, in the tense `at` earns against the SERVER clock at
 *  write time — a booking for next week must not read as minutes. Decided once
 *  and never recomputed: a touch row records what was true THEN. */
function noteOf(at: Date, title: string, isFirst: boolean): string {
  if (at.getTime() > Date.now()) {
    return isFirst ? `Đặt lịch gặp lần đầu: ${title}` : `Đặt lịch họp: ${title}`
  }
  return isFirst ? `Gặp lần đầu: ${title}` : `Họp: ${title}`
}

/** The booking's lists, or close-meeting's with `attended` beside each person. */
type AttendeeInput = {
  hosts?: readonly (MeetingCreate['hosts'][number] | MeetingAttendedHost)[]
  guests?: readonly (MeetingCreate['guests'][number] | MeetingAttendedGuest)[]
}

const attendedOf = (p: object): boolean | null =>
  'attended' in p && typeof p.attended === 'boolean' ? p.attended : null

/** The contract's two lists as one child table. `side` is SET here, never
 *  taken from the caller, so a `side: 'host'` inside `guests` cannot write a
 *  self-contradicting row. `attended` only arrives from close-meeting. */
function attendeesOf(meetingId: string, body: AttendeeInput): MeetingAttendeeValues[] {
  return [
    ...(body.hosts ?? []).map((h) => ({
      meetingId,
      side: 'host' as const,
      actorId: h.actorId,
      name: h.name,
      role: null,
      attended: attendedOf(h),
    })),
    ...(body.guests ?? []).map((g) => ({
      meetingId,
      side: 'guest' as const,
      actorId: null,
      /* Guest only — `meeting_attendee_contact_only_guest`. Optional for ever:
         typing a name is the only option for somebody not in the book. */
      contactCode: g.contactCode ?? null,
      name: g.name,
      role: g.role ?? null,
      attended: attendedOf(g),
    })),
  ]
}

/** One side's rows as they stand — close-meeting sent no list for it. */
function keptSide(rows: readonly MeetingAttendeeRowDb[], side: 'host' | 'guest') {
  return rows.filter((r) => r.side === side).map(({ id: _id, ...values }) => values)
}

/** A host read back from the book always has `actorId` —
 *  `meeting_attendee_host_is_actor` allows no other row. */
function requireActor(h: { actorId?: string; name: string }): { actorId: string; name: string } {
  if (!h.actorId) throw new Error('meeting_attendee: host row without actor_id')
  return { actorId: h.actorId, name: h.name }
}
