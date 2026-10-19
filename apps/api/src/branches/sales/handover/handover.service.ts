import { Inject, Injectable } from '@nestjs/common'
import { LEAD_HANDED_OVER, type AccessControl, type Actor } from '@pv/engines'
import {
  NOTIFICATION_DETAIL_COUNT,
  NOTIFICATION_DETAIL_DEALS,
  NOTIFICATION_DETAIL_STEPS,
  type TouchHolder,
  type UserHoldingsResponse,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { invalid } from '@api/platform/http/problem'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { ActorRepository } from '@api/platform/session/actor.repository'
import type { WorkHandover } from '@api/platform/users/work-handover'
import { LeadStateWriter } from '../lead/lead-state'
import { LEAD_NOTE } from '../lead/lead-write.mapper'
import { handDealsOverMany, peopleOf } from '../opportunity/opportunity-handover'
import { acceptorOf, holderOf, toRef } from '../opportunity/opportunity.mapper'
import type { OpportunityRowDb } from '../opportunity/opportunity.schema'
import { byOf, TouchService } from '../touch/touch.service'
import { HandoverRepository } from './handover.repository'

/** Sales' answer to `WorkHandover` (ADR 0088 §14, 0097 §7): a leaver's open
 *  leads, deals and next steps move to one receiver inside the lock's
 *  transaction, each through the rule a person's hand-over already uses —
 *  one owner write for the leads, `handDealsOverMany` for the SALE lane (ADR
 *  0086 primary rules), one UPDATE for steps. A BD seat, or a deal held only
 *  through the leaver's acceptance, has no such door: `seatsOver` writes it.
 *  Same timeline rows as a hand-over by hand; ONE bell line for the whole
 *  lock (ADR 0093). Switched-off leads move too, uncounted. A hold rides with
 *  its subject: it is keyed by the subject, not by a person. */
@Injectable()
export class SalesWorkHandover implements WorkHandover {
  constructor(
    private readonly repo: HandoverRepository,
    private readonly states: LeadStateWriter,
    private readonly mirror: ObjectMirror,
    private readonly touch: TouchService,
    private readonly hub: NotificationHub,
    private readonly actors: ActorRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  holdings(tx: Db, userId: string): Promise<UserHoldingsResponse> {
    return this.repo.holdings(tx, userId)
  }

  /** The lead hand-over's receiver rule: on Sales and able to open deals
   *  (`opportunity.view` through E2). Being unlocked is the caller's check. */
  async vetReceiver(toId: string): Promise<void> {
    const to = (await this.actors.byId(toId))?.actor
    if (to && this.access.check(to, { branch: 'Sales', permission: 'opportunity.view' }).ok) return
    throw invalid(
      { handoverTo: ['Người này không nhận được lead và cơ hội. Chọn người thuộc Sales.'] },
      'Người nhận việc không hợp lệ.',
    )
  }

  /** Locks first, then judges: the leads by code, then the deals (the stop
   *  door's order). The bell counts are `holdings` read after the locks and
   *  before any move, so the line says what the lock dialog said. */
  async handOver(tx: Db, move: { fromId: string; toId: string; by: Actor }): Promise<void> {
    const from = await this.repo.person(tx, move.fromId)
    const to = await this.repo.person(tx, move.toId)
    if (!from || !to) return
    const leads = await this.repo.lockLeads(tx, from.id)
    await this.repo.lockDeals(tx, from.id)
    const counts = await this.repo.holdings(tx, from.id)
    const owned = leads.filter((l) => l.ownedByLeaver)
    const giver: TouchHolder = { actorId: from.id, name: from.name }
    const taker: TouchHolder = { actorId: to.id, name: to.name, ...headRole(to.roleIds) }
    const by = byOf(move.by)
    const note = `${LEAD_NOTE.handedTo} ${to.name}`
    const deps = { mirror: this.mirror, touch: this.touch }

    if (owned.length > 0) {
      const codes = owned.map((l) => l.code)
      await this.repo.giveLeads(tx, codes, to.id)
      await this.states.refresh(tx, codes)
    }
    /* Vetted before the transaction, so the receiver may hold these deals. */
    const step = { leadCodes: leads.map((l) => l.code), from: giver, to: taker, by, note }
    const moved = await handDealsOverMany(tx, deps, { ...step, toSeesDeals: true })
    const handed = new Set(moved.moved)

    const bd = await this.repo.lockBdDeals(tx, from.id)
    const accepted = await this.repo.lockAcceptedDeals(tx, from.id)
    if (bd.length > 0) await this.repo.swapBd(tx, codesOf(bd), from.id, to.id)
    if (accepted.length > 0) await this.repo.seatSale(tx, codesOf(accepted), to.id)
    /* One `handed-over` row per deal across the SALE, BD and acceptance moves:
       a deal `handDealsOver` moved already has its row. */
    const seated = [...new Map([...bd, ...accepted].map((d) => [d.row.code, d])).values()]
    await this.seatsOver(tx, seated, handed, { giver, taker, by, note })

    await this.touch.record(
      tx,
      owned.map((l) => ({
        subjectCode: l.code,
        subjectKind: 'lead' as const,
        kind: 'handed-over' as const,
        ...by,
        from: giver,
        to: taker,
        note,
      })),
    )
    await this.repo.moveSteps(tx, from.id, to.id)
    await this.ring(tx, { from, toId: to.id, actorId: move.by.id, counts })
  }

  /** ONE line to the receiver for the whole lock (ADR 0093), on the leaver,
   *  counting leads, deals and next steps (owner, 15/10/2026). It opens the
   *  lead book, or the deal board when no lead moved. */
  private async ring(
    tx: Db,
    act: {
      from: { id: string; name: string }
      toId: string
      actorId: string
      counts: UserHoldingsResponse
    },
  ): Promise<void> {
    const { leads, opportunities, nextSteps } = act.counts
    if (leads + opportunities + nextSteps === 0) return
    const kind = leads === 0 && opportunities > 0 ? 'opportunity-batch' : 'lead-batch'
    await this.hub.announce(tx, {
      event: {
        name: LEAD_HANDED_OVER,
        ref: { code: act.from.id },
        actorId: act.actorId,
        audiences: { 'new-holder': [act.toId], 'previous-holder': [] },
        /* A second lock of the same person must ring again. */
        occurrence: new Date().toISOString(),
      },
      subject: { kind, code: act.from.id, label: act.from.name },
      detail: {
        [NOTIFICATION_DETAIL_COUNT]: leads,
        [NOTIFICATION_DETAIL_DEALS]: opportunities,
        [NOTIFICATION_DETAIL_STEPS]: nextSteps,
      },
    })
  }

  /** Seats with no person-to-person door (BD, an empty SALE lane), already
   *  written: the mirror names the holder after the change and each deal's
   *  timeline says who took over, unless `handed` already said it. */
  private async seatsOver(
    tx: Db,
    deals: { row: OpportunityRowDb; acceptorName: string | null }[],
    handed: ReadonlySet<string>,
    move: {
      giver: TouchHolder
      taker: TouchHolder
      by: ReturnType<typeof byOf>
      note: string
    },
  ): Promise<void> {
    if (deals.length === 0) return
    const codes = codesOf(deals)
    const after = await peopleOf(tx, codes)
    const on = (code: string) => after.filter((p) => p.code === code)
    await this.mirror.putMany(
      tx,
      deals.map(({ row, acceptorName }) =>
        toRef(row, holderOf(on(row.code), acceptorOf(row, acceptorName))),
      ),
    )
    await this.touch.record(
      tx,
      deals
        .filter(({ row }) => !handed.has(row.code))
        .map(({ row }) => ({
          subjectCode: row.code,
          subjectKind: 'opportunity' as const,
          kind: 'handed-over' as const,
          ...move.by,
          from: move.giver,
          to: move.taker,
          note: move.note,
        })),
    )
  }
}

const codesOf = (deals: readonly { row: OpportunityRowDb }[]) => deals.map((d) => d.row.code)

/** `sales.touch.to_role` holds one role, the receiver's first. */
const headRole = (roleIds: readonly TouchHolder['role'][]): Pick<TouchHolder, 'role'> =>
  roleIds[0] ? { role: roleIds[0] } : {}
