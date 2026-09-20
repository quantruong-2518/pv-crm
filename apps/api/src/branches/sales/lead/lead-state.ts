import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import { Injectable, Module } from '@nestjs/common'
import { LEAD_OPEN_STATES, type LeadState } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { GraphModule } from '@api/platform/graph/graph.module'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { SYSTEM_ACTOR, TouchService } from '../touch/touch.service'
import { TouchModule } from '../touch/touch.module'
import { toRef } from './lead.mapper'
import { LEAD_NOTE } from './lead-write.mapper'
import { lead, type LeadRowDb } from './lead.schema'

/** THE ONE PLACE A LEAD'S LIFECYCLE STATE IS WRITTEN (ADR 0058).
 *
 *  Every write moves `state_since` with `state` and refreshes the lead's mirror
 *  row, whose `state` IS `lead.state` — so no door can move one without the
 *  others. Callers pass their own `tx`: the move lands in the same commit as
 *  the write that caused it.
 *
 *  A leaf on purpose: it imports the lead's table and mappers plus `TouchModule`
 *  — which has no controller and no lead import — so the meeting, contact,
 *  account, MAS and deal modules can import `LeadStateModule` without a cycle
 *  through `LeadModule` (which imports several of them). */

/** How long a lead may sit in `nurturing` before the system archives it — the
 *  diagram's six months, ADR 0058. A constant, not a `config_entry` row: that
 *  column is fenced to STAGE/TIER and ADR 0057 §4 suspends new limits. */
export const NURTURE_MAX = sql`interval '6 months'`

/** The two terminal states a deal may not be opened on, and mail may not reach. */
export const LEAD_GONE_STATES = ['disqualified', 'archived'] as const satisfies readonly LeadState[]

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

/** Where a lead stands once it is put back on the backbone: no tier means it
 *  never passed verification, so it lands on `verifying` rather than `working`.
 *  The one copy of that clause — reopen, resume and the journey lane all read
 *  the same stored column and must read it the same way. */
export const stateByTier = (tier: string | null): Extract<LeadState, 'verifying' | 'working'> =>
  tier === null ? 'verifying' : 'working'

/** Reopen recomputes from facts rather than restoring: a deal → `converted`,
 *  no holder → `new`, else by tier. */
export function stateOnReopen(lead: {
  hasDeal: boolean
  ownerId: string | null
  tier: string | null
}): LeadState {
  if (lead.hasDeal) return 'converted'
  if (lead.ownerId === null) return 'new'
  return stateByTier(lead.tier)
}

type LeadColumns = Omit<PgUpdateSetSource<typeof lead>, 'code' | 'state' | 'stateSince'>

type StoredLead = { row: LeadRowDb; ownerName: string | null }

@Injectable()
export class LeadStateWriter {
  constructor(
    private readonly mirror: ObjectMirror,
    private readonly touch: TouchService,
  ) {}

  /** The PIC's first action of any kind: `new|assigned` → `verifying`. One
   *  conditional UPDATE, so it is race-free without a row lock: only the
   *  current holder's action counts, and only the first one moves anything.
   *
   *  It writes its OWN timeline row, because most of the nine doors that call
   *  it write none — mail, account, comms — and the rung was dateless there. */
  async firstAction(tx: Db, codes: readonly string[], actorId: string): Promise<void> {
    if (codes.length === 0) return
    const moved = await tx
      .update(lead)
      .set({ state: 'verifying', stateSince: sql`now()` })
      .where(
        and(
          inArray(lead.code, [...codes]),
          eq(lead.ownerId, actorId),
          inArray(lead.state, ['new', 'assigned']),
        ),
      )
      .returning({ code: lead.code })
    if (moved.length === 0) return

    const rows = await this.reload(
      tx,
      moved.map((r) => r.code),
    )
    await this.put(tx, rows)

    /* The name is the holder's, off the join the mirror already needs: the
       UPDATE moved only leads whose owner IS `actorId`, so they are one person. */
    await this.touch.record(
      tx,
      rows.map((r) => ({
        subjectCode: r.row.code,
        subjectKind: 'lead' as const,
        kind: 'first-action' as const,
        by: r.ownerName ?? SYSTEM_ACTOR,
        actorId,
        note: LEAD_NOTE.firstAction,
      })),
    )
  }

  /** A deal was opened on these leads: any open state → `converted`. Skipping
   *  is allowed, so the tier may stay unset. */
  async converted(tx: Db, codes: readonly string[]): Promise<void> {
    if (codes.length === 0) return
    const moved = await tx
      .update(lead)
      .set({ state: 'converted', stateSince: sql`now()` })
      .where(and(inArray(lead.code, [...codes]), inArray(lead.state, [...LEAD_OPEN_STATES])))
      .returning({ code: lead.code })
    await this.refresh(
      tx,
      moved.map((r) => r.code),
    )
  }

  /** A move the caller has already decided under its own row lock. `also`
   *  rides in the SAME statement because the CHECKs tie state to owner, tier
   *  and exit reason — two UPDATEs would fail on the first. */
  async move(tx: Db, code: string, to: LeadState, also: LeadColumns = {}): Promise<void> {
    await tx
      .update(lead)
      .set({ ...also, state: to, stateSince: sql`now()` })
      .where(eq(lead.code, code))
    await this.refresh(tx, [code])
  }

  /** `nurturing` → `archived` past `NURTURE_MAX`. Idempotent: a second sweep,
   *  even a concurrent one, re-checks the WHERE after the row lock and finds
   *  nothing. Returns what moved so the caller writes touches and closes runs. */
  async archiveStale(tx: Db): Promise<Pick<LeadRowDb, 'code' | 'workstreamCode'>[]> {
    const moved = await tx
      .update(lead)
      .set({ state: 'archived', stateSince: sql`now()` })
      .where(and(eq(lead.state, 'nurturing'), lt(lead.stateSince, sql`now() - ${NURTURE_MAX}`)))
      .returning({ code: lead.code, workstreamCode: lead.workstreamCode })
    await this.refresh(
      tx,
      moved.map((r) => r.code),
    )
    return moved
  }

  /** Re-put the mirror rows from the stored lead, after any write that moved
   *  its owner or state. */
  async refresh(tx: Db, codes: readonly string[]): Promise<void> {
    if (codes.length === 0) return
    await this.put(tx, await this.reload(tx, codes))
  }

  /** The stored leads with their holder's name — one SELECT, whatever the
   *  batch size. Split out of `refresh` so `firstAction` can take the name it
   *  stamps on the timeline off the row it is already reading. */
  private reload(tx: Db, codes: readonly string[]): Promise<StoredLead[]> {
    return tx
      .select({ row: lead, ownerName: actor.name })
      .from(lead)
      .leftJoin(actor, eq(actor.id, lead.ownerId))
      .where(inArray(lead.code, [...codes]))
  }

  private async put(tx: Db, rows: readonly StoredLead[]): Promise<void> {
    await this.mirror.putMany(
      tx,
      rows.map((r) => toRef(r.row, r.ownerName)),
    )
  }
}

@Module({
  imports: [GraphModule, TouchModule],
  providers: [LeadStateWriter],
  exports: [LeadStateWriter],
})
export class LeadStateModule {}
