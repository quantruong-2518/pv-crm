import { and, eq, inArray, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import { Injectable, Module } from '@nestjs/common'
import { LEAD_OPEN_STATES, type LeadState } from '@pv/contracts'
import { LEAD_HANDED_OVER, LEAD_NURTURED, LEAD_POOLED, type Actor } from '@pv/engines'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { GraphModule } from '@api/platform/graph/graph.module'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { MailModule } from '@api/platform/mail/mail.module'
import { MailRunRepository } from '@api/platform/mail/mail-run.repository'
import { NotificationHub, type Announcement } from '@api/platform/notification/notification.hub'
import { NotificationModule } from '@api/platform/notification/notification.module'
import { byOf, SYSTEM_ACTOR, TouchService } from '../touch/touch.service'
import { TouchModule } from '../touch/touch.module'
import { toRef } from './lead.mapper'
import { LEAD_NOTE } from './lead-write.mapper'
import { lead, type LeadRowDb } from './lead.schema'
import { leadLive } from './lead-scope'
import { dropStep, dropSteps } from '../next-step/next-step.handover'
import { syncLeadRuns } from '../workstream/workstream-sync'
import { endHolds } from '../hold/hold.sql'

/** THE ONE PLACE A LEAD'S LIFECYCLE STATE IS WRITTEN (ADR 0058, 0063, 0068).
 *
 *  One fact moves a lead forward: a real touch happened — call, message,
 *  meeting held, a mail that went out (`assigned` → `working`). Scheduling
 *  care moves nothing (ADR 0123). The `nurturing` pool is left only by a
 *  claim, a customer reply or a new deal (ADR 0109). Edits move nothing.
 *
 *  Every write moves `state_since` with `state`, refreshes the lead's mirror
 *  row (whose `state` IS `lead.state`) and re-syncs its run — so no door can
 *  move one without the others. Callers pass their own `tx`: the move lands in the same commit as
 *  the write that caused it. `leadLive` on every UPDATE skips a disabled lead in silence.
 *  A leaf on purpose (touch, mail, next-step, run sync and hold SQL only), so the
 *  meeting, contact, account, MAS, deal and contract modules import it without a cycle. */

/** The machine's park reasons (ADR 0109), named by id because migration 0129
 *  inserts them under these ids; the desk may rename them, the id never moves. */
export const LEAD_PARK_REASON = { dealStopped: 'EX-08', contractTerminated: 'EX-09' } as const

/** Why a parked lead's unsent mail is held (ADR 0068 §6) — one reason for
 *  every door that parks a lead, so the delivery row reads the same. */
export const LEAD_NURTURED_WITHHOLD = {
  code: 'lead-nurtured',
  summary: 'lead đã vào nhóm chờ: thư chưa gửi bị giữ lại',
} as const

const isOpen = (state: LeadState): boolean =>
  (LEAD_OPEN_STATES as readonly LeadState[]).includes(state)

/** Where a hand-over leaves the lead: a claim moves `new` → `assigned`, and
 *  so does a deal opener's claim out of the `nurturing` pool (it converts in
 *  the same tx); a release sends any open state back to `new`, A→B keeps the
 *  state. A terminal lead's state never follows its owner. */
export function stateAfterOwnerChange(state: LeadState, ownerId: string | null): LeadState {
  if (!isOpen(state)) return state
  if (ownerId === null) return 'new'
  return state === 'new' || state === 'nurturing' ? 'assigned' : state
}

/** The highest backbone rung a lead's touch trail proves it ever reached
 *  (ADR 0063 §4) — read by `LeadWriteRepository.lockForMove`; a claim out of
 *  the pool puts the lead back there. */
export type LeadReach = Extract<LeadState, 'assigned' | 'working'>

type LeadColumns = Omit<PgUpdateSetSource<typeof lead>, 'code' | 'state' | 'stateSince'>

/** `lead_nurturing_has_reason` ties the park reason and moment to `nurturing`,
 *  so every UPDATE that lands elsewhere clears them — and the re-contact day —
 *  in the same statement. The reply marker goes too: no move but the reply's
 *  own keeps a lead unclaimed in `new` (`lead_replied_from_pool_unclaimed`). */
const LEFT_POOL = {
  exitReason: null,
  exitedAt: null,
  recontactOn: null,
  repliedFromPoolAt: null,
} as const

type StoredLead = { row: LeadRowDb; ownerName: string | null }

/** One park into the pool: the touch's author (`null` = the machine, for a
 *  deal stop or a termination), the `EXIT_REASON` id, the timeline sentence,
 *  and who pressed what caused it — the former holder is not told of their own act.
 *  `recontactOn` = the day to call again (ADR 0125), absent = no date. The state
 *  it leaves is not passed: `parked` reads it off the row the caller locked. */
export type Park = {
  by: { id: string; name: string } | null
  reasonId: string
  note: string
  actorId: string | null
  recontactOn?: string | null | undefined
}

/** Who a move is credited to: the holder (only their own leads move) or the system. */
type Mover = { holderId: string } | null

@Injectable()
export class LeadStateWriter {
  constructor(
    private readonly mirror: ObjectMirror,
    private readonly touch: TouchService,
    private readonly hub: NotificationHub,
    private readonly mailRuns: MailRunRepository,
  ) {}

  /** Leads landed in the common pool — one lead, or a batch (`count`) — so
   *  everyone who may hand leads out hears of it (ADR 0085). Here because the
   *  pool IS the state `new`, and every door that lands a lead there holds
   *  this writer. `occurrence` = the touch that dated the landing. */
  async pooled(
    tx: Db,
    landing: {
      subject: Announcement['subject']
      actorId?: string | undefined
      occurrence?: string | undefined
      count?: number
    },
  ): Promise<void> {
    await this.hub.announce(tx, {
      event: {
        name: LEAD_POOLED,
        ref: { code: landing.subject.code },
        actorId: landing.actorId,
        audiences: { 'pool-watchers': await this.hub.holding(tx, 'lead.assign', 'Sales') },
        occurrence: landing.occurrence,
      },
      subject: landing.subject,
      detail: landing.count === undefined ? null : { count: landing.count },
    })
  }

  /** The holder logged a real exchange: call, message, meeting held. */
  exchanged(tx: Db, codes: readonly string[], actorId: string): Promise<void> {
    return this.touched(tx, codes, { holderId: actorId }, LEAD_NOTE.exchanged)
  }

  /** A letter to these leads really went out (ADR 0068 §1). A system event, so
   *  it moves the lead whoever sent it; a pool lead stays `new` (0067 D6). */
  mailed(tx: Db, codes: readonly string[]): Promise<void> {
    return this.touched(tx, codes, null, LEAD_NOTE.mailed)
  }

  /** The customer answered a letter (ADR 0067 §2): `assigned` →
   *  `working`, credited to nobody so no holder's first-contact count is fed.
   *  A reply is the one campaign response that takes a lead out of the
   *  `nurturing` pool (ADR 0109): back to `new`, and the assigners hear it.
   *  The row written here is the RUNG fact, for a lead that moved; the reply
   *  itself is the caller's `customer-replied` row, on every reply. */
  async replied(tx: Db, codes: readonly string[]): Promise<void> {
    const step = { kind: 'exchange-logged', note: LEAD_NOTE.repliedIntoWork } as const
    await this.advance(tx, codes, null, { ...step, to: 'working', from: ['assigned'] })
    const pooled = await this.advance(tx, codes, null, {
      ...step,
      to: 'new',
      from: ['nurturing'],
      note: LEAD_NOTE.repliedIntoPool,
      also: { repliedFromPoolAt: sql`now()` },
    })
    for (const p of pooled) {
      const subject = { kind: 'lead' as const, code: p.code, label: p.company }
      await this.pooled(tx, { subject, occurrence: p.occurrence })
    }
  }

  /** `assigned` → `working`. A mail sent is not a response, so a
   *  `nurturing` lead stays in the pool (ADR 0109). The same touch ends an open
   *  hold (ADR 0097 §3), moved or not, on the leads the mover's predicate covers. */
  private async touched(
    tx: Db,
    codes: readonly string[],
    mover: Mover,
    note: string,
  ): Promise<void> {
    const step = { to: 'working', kind: 'exchange-logged', note } as const
    await this.advance(tx, codes, mover, { ...step, from: ['assigned'] })
    if (codes.length === 0) return
    const covered = mover
      ? (
          await tx
            .select({ code: lead.code })
            .from(lead)
            .where(and(inArray(lead.code, [...codes]), eq(lead.ownerId, mover.holderId)))
        ).map((r) => r.code)
      : codes
    await endHolds(tx, 'lead', covered, 'touch', null)
  }

  /** One forward move plus its dated timeline row, credited to `mover`.
   *
   *  ONE conditional UPDATE, so it is race-free without a row lock: a repeated
   *  call finds the state already moved and writes nothing.
   *
   *  It writes its OWN timeline row, because most of the doors that call it
   *  write none — mail, comms — and the rung was dateless there. No `toTier`:
   *  the tier left the state machine (ADR 0063 §3). Answers the moved leads
   *  with their timeline row's id. */
  private async advance(
    tx: Db,
    codes: readonly string[],
    mover: Mover,
    step: {
      to: LeadState
      from: readonly LeadState[]
      kind: 'exchange-logged'
      note: string
      also?: LeadColumns
    },
  ): Promise<{ code: string; company: string; occurrence: string | undefined }[]> {
    if (codes.length === 0) return []
    const moved = await tx
      .update(lead)
      .set({ ...LEFT_POOL, ...step.also, state: step.to, stateSince: sql`now()` })
      .where(
        and(
          inArray(lead.code, [...codes]),
          mover ? eq(lead.ownerId, mover.holderId) : undefined,
          inArray(lead.state, [...step.from]),
          leadLive,
        ),
      )
      .returning({ code: lead.code })
    if (moved.length === 0) return []

    const rows = await this.reload(
      tx,
      moved.map((r) => r.code),
    )
    await this.put(tx, rows)
    /* A lead leaving `nurturing` re-opens a run closed LOST (ADR 0069 §4). */
    await syncLeadRuns(
      tx,
      moved.map((r) => r.code),
    )

    /* A holder's name comes off the join the mirror already needs: the UPDATE
       moved only leads that person holds. */
    const dated = await this.touch.record(
      tx,
      rows.map((r) => ({
        subjectCode: r.row.code,
        subjectKind: 'lead' as const,
        kind: step.kind,
        ...(mover === null
          ? { by: SYSTEM_ACTOR }
          : { by: r.ownerName ?? SYSTEM_ACTOR, actorId: mover.holderId }),
        note: step.note,
      })),
    )
    return rows.map((r, i) => ({ code: r.row.code, company: r.row.company, occurrence: dated[i] }))
  }

  /** A deal was opened on these leads: any open state → `converted`. Skipping
   *  is allowed, so the tier may stay unset. A held lead's hold ends with it
   *  (`converted`), credited to the opener when one is named. */
  async converted(tx: Db, codes: readonly string[], openerId: string | null = null): Promise<void> {
    if (codes.length === 0) return
    const moved = await tx
      .update(lead)
      .set({ ...LEFT_POOL, state: 'converted', stateSince: sql`now()` })
      .where(
        and(inArray(lead.code, [...codes]), inArray(lead.state, [...LEAD_OPEN_STATES]), leadLive),
      )
      .returning({ code: lead.code })
    await this.refresh(
      tx,
      moved.map((r) => r.code),
    )
    await this.dropSteps(tx, moved)
    await endHolds(
      tx,
      'lead',
      moved.map((r) => r.code),
      'converted',
      openerId,
    )
  }

  /** THE park into the `nurturing` pool (ADR 0109), on a row the caller locked
   *  and judged: the park door, a hold ended "to waiting", a deal stop and a
   *  contract termination all land here, so every park writes, withholds and
   *  rings the same way. The holder is released and told unless they caused it.
   *  Meetings stay with the caller: the meeting module imports this one. */
  async parked(tx: Db, code: string, park: Park): Promise<void> {
    const [before] = await this.reload(tx, [code])
    if (!before) return
    await this.move(tx, code, 'nurturing', {
      ownerId: null,
      exitReason: park.reasonId,
      /* The DB clock, same as the `state_since` this move stamps. */
      exitedAt: sql`now()`,
      recontactOn: park.recontactOn ?? null,
      repliedFromPoolAt: null,
    })
    /* `nurturing` is open, so `move` keeps the step; the pool has nobody to do it. */
    await dropStep(tx, code)
    const occurrence = await this.afterPark(tx, code, park, before.row.state)
    const holder = before.row.ownerId
    await this.hub.announce(tx, {
      event: {
        name: LEAD_NURTURED,
        ref: { code },
        actorId: park.actorId ?? undefined,
        audiences: { holder: holder ? [holder] : [] },
        occurrence,
      },
      subject: { kind: 'lead', code, label: before.row.company },
    })
  }

  /** What every park owes beside the move: the dated `nurtured` row carrying the
   *  reason (ADR 0070) and the state left (ADR 0125), unsent mail withheld
   *  (ADR 0068 §6), and an open hold ended — a parked lead sits in the pool.
   *  Returns the `nurtured` row's id, the bell's occurrence. */
  private async afterPark(
    tx: Db,
    code: string,
    park: Park,
    parkedFrom: LeadState,
  ): Promise<string | undefined> {
    const [occurrence] = await this.touch.record(tx, [
      {
        subjectCode: code,
        subjectKind: 'lead',
        kind: 'nurtured',
        ...byOf(park.by),
        note: park.note,
        reasonId: park.reasonId,
        parkedFrom,
      },
    ])
    await this.mailRuns.withholdSubject(
      tx,
      { aggregateType: 'lead', aggregateId: code },
      LEAD_NURTURED_WITHHOLD,
    )
    await endHolds(tx, 'lead', [code], 'to-waiting', park.by?.id ?? null)
    return occurrence
  }

  /** A move the caller has already decided under its own row lock. `also`
   *  rides in the SAME statement because the CHECKs tie state to owner, tier
   *  and exit reason — two UPDATEs would fail on the first. */
  async move(tx: Db, code: string, to: LeadState, also: LeadColumns = {}): Promise<void> {
    await tx
      .update(lead)
      .set({ ...(to === 'nurturing' ? {} : LEFT_POOL), ...also, state: to, stateSince: sql`now()` })
      .where(and(eq(lead.code, code), leadLive))
    await this.refresh(tx, [code])
    await syncLeadRuns(tx, [code])
    if (!isOpen(to)) await dropStep(tx, code)
  }

  /** THE owner write, on a row the caller has locked. The state follows the
   *  owner in ONE statement — `lead_open_owner_matches` refuses a `new` lead
   *  with a holder even between two — and a state that stays keeps its clock.
   *  Returns the state the lead now stands in. */
  async ownerSet(
    tx: Db,
    found: Pick<LeadRowDb, 'code' | 'state'>,
    ownerId: string | null,
  ): Promise<LeadState> {
    const state = stateAfterOwnerChange(found.state, ownerId)
    if (state !== found.state) {
      await this.move(tx, found.code, state, { ownerId })
      return state
    }
    await tx.update(lead).set({ ownerId }).where(eq(lead.code, found.code))
    await this.refresh(tx, [found.code])
    return state
  }

  /** A deal door's opener takes the leads nobody holds (ADR 0088 §17): the
   *  owner door's claim out of the pool — same write, same `handed-over` row
   *  with no giver, same bell event. Rows locked by the caller, before
   *  `converted`. */
  async claimed(
    tx: Db,
    leads: readonly Pick<LeadRowDb, 'code' | 'state' | 'company'>[],
    who: Pick<Actor, 'id' | 'name' | 'roleIds'>,
  ): Promise<void> {
    for (const found of leads) await this.ownerSet(tx, found, who.id)
    const [role] = who.roleIds
    const dated = await this.touch.record(
      tx,
      leads.map((found) => ({
        subjectCode: found.code,
        subjectKind: 'lead' as const,
        kind: 'handed-over' as const,
        ...byOf(who),
        to: { actorId: who.id, name: who.name, ...(role ? { role } : {}) },
        note: `${LEAD_NOTE.handedTo} ${who.name}`,
      })),
    )
    /* The lead door's claim event. The taker is the actor, so E4's own-action
       rule rings nobody today; reported anyway so a new rule hears both doors. */
    for (const [i, found] of leads.entries()) {
      await this.hub.announce(tx, {
        event: {
          name: LEAD_HANDED_OVER,
          ref: { code: found.code },
          actorId: who.id,
          audiences: { 'new-holder': [who.id], 'previous-holder': [] },
          occurrence: dated[i],
        },
        subject: { kind: 'lead', code: found.code, label: found.company },
      })
    }
  }

  /** Re-put the mirror rows from the stored lead, after any write that moved
   *  its owner or state. */
  async refresh(tx: Db, codes: readonly string[]): Promise<void> {
    if (codes.length === 0) return
    await this.put(tx, await this.reload(tx, codes))
  }

  /** The stored leads with their holder's name — one SELECT, whatever the
   *  batch size. Split out of `refresh` so `advance` can take the name it
   *  stamps on the timeline off the row it is already reading. */
  private reload(tx: Db, codes: readonly string[]): Promise<StoredLead[]> {
    return tx
      .select({ row: lead, ownerName: actor.name })
      .from(lead)
      .leftJoin(actor, eq(actor.id, lead.ownerId))
      .where(inArray(lead.code, [...codes]))
  }

  /** A next step lives only on an OPEN lead (flow G1): every move out of the
   *  open states drops it here, in the move's own tx, so no door has to. */
  private dropSteps(tx: Db, moved: readonly { code: string }[]): Promise<void> {
    return dropSteps(
      tx,
      moved.map((m) => m.code),
    )
  }

  private async put(tx: Db, rows: readonly StoredLead[]): Promise<void> {
    await this.mirror.putMany(
      tx,
      rows.map((r) => toRef(r.row, r.ownerName)),
    )
  }
}

@Module({
  imports: [GraphModule, TouchModule, NotificationModule, MailModule],
  providers: [LeadStateWriter],
  exports: [LeadStateWriter],
})
export class LeadStateModule {}
