import { and, eq, inArray, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import { Injectable, Module } from '@nestjs/common'
import { LEAD_OPEN_STATES, LEAD_STATE_LABEL, type LeadState } from '@pv/contracts'
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
 *  Two facts move a lead forward, and nothing else does: care was SCHEDULED
 *  (→ `verifying`) and a real touch happened — call, message, meeting held, a
 *  mail that went out (→ `working`, also out of `nurturing`). Edits move nothing.
 *
 *  Every write moves `state_since` with `state`, refreshes the lead's mirror
 *  row (whose `state` IS `lead.state`) and re-syncs its run — so no door can
 *  move one without the others. Callers pass their own `tx`: the move lands in the same commit as
 *  the write that caused it. `leadLive` on every UPDATE skips a disabled lead in silence.
 *
 *  A leaf on purpose: lead table and mappers, `TouchModule` (no controller, no
 *  lead import), `MailModule` (platform) and the module-free `next-step.handover`,
 *  `workstream-sync` and `hold.sql` only — so the meeting, contact, account, MAS and deal modules can import
 *  `LeadStateModule` without a cycle through `LeadModule`. */

/** The terminal state a deal may not be opened on, and mail may not reach — a
 *  list because every caller filters with it, and `archived` left it (ADR 0068). */
export const LEAD_GONE_STATES = ['disqualified'] as const satisfies readonly LeadState[]

/** The same states in the words a screen shows them in. One copy, off
 *  `LEAD_STATE_LABEL`: every door that refuses a lead that has left says it the
 *  same way, and renaming a state renames the refusal with it. */
export const LEAD_GONE_WORDS = LEAD_GONE_STATES.map((s) => `“${LEAD_STATE_LABEL[s]}”`).join(
  ' hoặc ',
)

/** Why a parked lead's unsent mail is held (ADR 0068 §6) — one reason for
 *  every door that parks a lead, so the delivery row reads the same. */
export const LEAD_NURTURED_WITHHOLD = {
  code: 'lead-nurtured',
  summary: 'lead đã vào nhóm chờ: thư chưa gửi bị giữ lại',
} as const

const isOpen = (state: LeadState): boolean =>
  (LEAD_OPEN_STATES as readonly LeadState[]).includes(state)

/** Where a hand-over leaves the lead: a claim moves `new` → `assigned`, a
 *  release to the pool sends any open state back to `new`, A→B keeps the
 *  state. A terminal lead's state never follows its owner. */
export function stateAfterOwnerChange(state: LeadState, ownerId: string | null): LeadState {
  if (!isOpen(state)) return state
  if (ownerId === null) return 'new'
  return state === 'new' ? 'assigned' : state
}

/** The highest backbone rung a lead's touch trail proves it ever reached
 *  (ADR 0063 §4) — read by `LeadWriteRepository.lockForMove`. */
export type LeadReach = Extract<LeadState, 'assigned' | 'verifying' | 'working'>

/** Where a lead stands once it is put back on the backbone: an exchange was
 *  logged means it really was being worked, otherwise care had only been
 *  planned. Reads FACTS, never the tier (ADR 0063 §3).
 *
 *  The SQL twin is the `nurturing` branch of `sales.workstream_stand()`
 *  — change one and change the other. */
export const stateByWork = (exchanged: boolean): Extract<LeadState, 'verifying' | 'working'> =>
  exchanged ? 'working' : 'verifying'

/** Reopen recomputes from facts rather than restoring: `hasDeal` → `converted`,
 *  no holder → `new`, else the rung the trail proves. `hasDeal` means an open
 *  deal or a contract (`leadConverted` in `../open-deal`), never a lost deal. */
export function stateOnReopen(lead: {
  hasDeal: boolean
  ownerId: string | null
  reached: LeadReach
}): LeadState {
  if (lead.hasDeal) return 'converted'
  if (lead.ownerId === null) return 'new'
  return lead.reached
}

type LeadColumns = Omit<PgUpdateSetSource<typeof lead>, 'code' | 'state' | 'stateSince'>

type StoredLead = { row: LeadRowDb; ownerName: string | null }

/** One park into the waiting group: who parked (`null` = the machine, flow C5),
 *  the `EXIT_REASON` id if the door asked one, and the timeline sentence. */
export type Park = { by: { id: string; name: string } | null; reasonId?: string; note: string }

/** Who a move is credited to: the holder (only their own leads move), a named
 *  person moving any holder's lead, or the system. */
type Mover = { holderId: string } | { anyone: { id: string; name: string } } | null

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

  /** The holder booked a future meeting: `assigned` → `verifying`. */
  scheduled(tx: Db, codes: readonly string[], actorId: string): Promise<void> {
    return this.planned(tx, codes, { holderId: actorId })
  }

  /** A mail run timed for later, any kind and whoever timed it (ADR 0068 §2):
   *  `assigned` → `verifying`; a pool lead has no holder and stays `new`. */
  mailTimed(tx: Db, codes: readonly string[], who: { id: string; name: string }): Promise<void> {
    return this.planned(tx, codes, { anyone: who })
  }

  private planned(tx: Db, codes: readonly string[], mover: Mover): Promise<void> {
    return this.advance(tx, codes, mover, {
      to: 'verifying',
      from: ['assigned'],
      kind: 'care-planned',
      note: LEAD_NOTE.carePlanned,
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

  /** The customer answered a letter (ADR 0067 §2): `assigned|verifying` →
   *  `working`, credited to nobody so no holder's first-contact count is fed.
   *  NOT `nurturing`, unlike `mailed`: the inbound door cannot tell an
   *  auto-reply from a person, and it must not un-park a lead parked on
   *  purpose. The row written here is the RUNG fact, for a lead that moved;
   *  the reply itself is the caller's `customer-replied` row, on every reply. */
  replied(tx: Db, codes: readonly string[]): Promise<void> {
    return this.advance(tx, codes, null, {
      to: 'working',
      from: ['assigned', 'verifying'],
      kind: 'exchange-logged',
      note: LEAD_NOTE.repliedIntoWork,
    })
  }

  /** `assigned|verifying` → `working`, and `nurturing` loops back to `working`
   *  on the same lead, holder kept (ADR 0068 §4). Two UPDATEs so the looped
   *  row says so; `exchange-logged` on both keeps the SQL rung walk right.
   *  The same touch ends an open hold (ADR 0097 §3), moved or not, on the
   *  leads the mover's predicate covers. */
  private async touched(
    tx: Db,
    codes: readonly string[],
    mover: Mover,
    note: string,
  ): Promise<void> {
    const step = { to: 'working', kind: 'exchange-logged', note } as const
    await this.advance(tx, codes, mover, { ...step, from: ['assigned', 'verifying'] })
    await this.advance(tx, codes, mover, {
      ...step,
      from: ['nurturing'],
      note: `${note} · ${LEAD_NOTE.resumed.toLowerCase()}`,
    })
    if (codes.length === 0) return
    const covered =
      mover && 'holderId' in mover
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
   *  the tier left the state machine (ADR 0063 §3). */
  private async advance(
    tx: Db,
    codes: readonly string[],
    mover: Mover,
    step: {
      to: LeadState
      from: readonly LeadState[]
      kind: 'care-planned' | 'exchange-logged'
      note: string
    },
  ): Promise<void> {
    if (codes.length === 0) return
    const moved = await tx
      .update(lead)
      .set({ state: step.to, stateSince: sql`now()` })
      .where(
        and(
          inArray(lead.code, [...codes]),
          mover && 'holderId' in mover ? eq(lead.ownerId, mover.holderId) : undefined,
          inArray(lead.state, [...step.from]),
          leadLive,
        ),
      )
      .returning({ code: lead.code })
    if (moved.length === 0) return

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
    await this.touch.record(
      tx,
      rows.map((r) => ({
        subjectCode: r.row.code,
        subjectKind: 'lead' as const,
        kind: step.kind,
        ...(mover === null
          ? { by: SYSTEM_ACTOR }
          : 'holderId' in mover
            ? { by: r.ownerName ?? SYSTEM_ACTOR, actorId: mover.holderId }
            : { by: mover.anyone.name, actorId: mover.anyone.id }),
        note: step.note,
      })),
    )
  }

  /** A deal was opened on these leads: any open state → `converted`. Skipping
   *  is allowed, so the tier may stay unset. A held lead's hold ends with it
   *  (`converted`), credited to the opener when one is named. */
  async converted(tx: Db, codes: readonly string[], openerId: string | null = null): Promise<void> {
    if (codes.length === 0) return
    const moved = await tx
      .update(lead)
      .set({ state: 'converted', stateSince: sql`now()` })
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

  /** The last live deal of a `converted` lead stopped with nothing signed (ADR
   *  0069 §3, 0097 §2): → `nurturing`. The caller gives an unheld lead its
   *  holder first (`claimed`), so the park never lands on `new` —
   *  `lead_open_owner_matches` refuses an ownerless `nurturing`. Parked as every
   *  park is (`afterPark`). `true` when the lead moved. */
  async dealsLost(
    tx: Db,
    code: string,
    by: { id: string; name: string },
    note: string,
  ): Promise<boolean> {
    const [moved] = await tx
      .update(lead)
      .set({ state: 'nurturing', stateSince: sql`now()` })
      .where(and(eq(lead.code, code), eq(lead.state, 'converted'), leadLive))
      .returning({ code: lead.code })
    if (!moved) return false
    await this.refresh(tx, [code])
    await syncLeadRuns(tx, [code])
    await this.afterPark(tx, code, { by, note })
    return true
  }

  /** THE park into the waiting group, on a row the caller locked and judged:
   *  the nurture door, a hold ended "to waiting" and a campaign's close (C5)
   *  all land here, so a park always reads, withholds and rings the same way.
   *  The holder hears it unless they pressed it — a machine park included
   *  (ADR 0093 §6). `dealsLost` does not ring: a stop rings `opportunity-lost` only.
   *  `ring: false` = the caller rings one counted line for many parks (C5). */
  async parked(tx: Db, code: string, park: Park, ring = true): Promise<void> {
    await this.move(tx, code, 'nurturing')
    const occurrence = await this.afterPark(tx, code, park)
    if (!ring) return
    const [stored] = await this.reload(tx, [code])
    if (!stored) return
    await this.hub.announce(tx, {
      event: {
        name: LEAD_NURTURED,
        ref: { code },
        actorId: park.by?.id,
        audiences: { holder: stored.row.ownerId ? [stored.row.ownerId] : [] },
        occurrence,
      },
      subject: { kind: 'lead', code, label: stored.row.company },
    })
  }

  /** What every park owes beside the move: the dated `nurtured` row carrying the
   *  reason (ADR 0070), unsent mail withheld (ADR 0068 §6), and an open hold
   *  ended — a parked lead sits in the waiting group, not in the hold list.
   *  Returns the `nurtured` row's id, the bell's occurrence. */
  private async afterPark(tx: Db, code: string, park: Park): Promise<string | undefined> {
    const [occurrence] = await this.touch.record(tx, [
      {
        subjectCode: code,
        subjectKind: 'lead',
        kind: 'nurtured',
        ...byOf(park.by),
        note: park.note,
        ...(park.reasonId ? { reasonId: park.reasonId } : {}),
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
      .set({ ...also, state: to, stateSince: sql`now()` })
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
   *  `converted`. `by` differs from the taker when a stop hands an unheld lead
   *  to the lost deal's primary Sale (ADR 0097 §2); that claim passes
   *  `ring: false`, since the stop's `opportunity-lost` already tells them. */
  async claimed(
    tx: Db,
    leads: readonly Pick<LeadRowDb, 'code' | 'state' | 'company'>[],
    who: Pick<Actor, 'id' | 'name' | 'roleIds'>,
    by: Pick<Actor, 'id' | 'name'> = who,
    ring = true,
  ): Promise<void> {
    for (const found of leads) await this.ownerSet(tx, found, who.id)
    const [role] = who.roleIds
    const dated = await this.touch.record(
      tx,
      leads.map((found) => ({
        subjectCode: found.code,
        subjectKind: 'lead' as const,
        kind: 'handed-over' as const,
        ...byOf(by),
        to: { actorId: who.id, name: who.name, ...(role ? { role } : {}) },
        note: `${LEAD_NOTE.handedTo} ${who.name}`,
      })),
    )
    /* The lead door's claim event. The taker is the actor, so E4's own-action
       rule rings nobody today; reported anyway so a new rule hears both doors. */
    if (!ring) return
    for (const [i, found] of leads.entries()) {
      await this.hub.announce(tx, {
        event: {
          name: LEAD_HANDED_OVER,
          ref: { code: found.code },
          actorId: by.id,
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
