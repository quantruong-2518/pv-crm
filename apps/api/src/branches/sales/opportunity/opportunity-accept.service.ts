import { Injectable, Logger } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  OpportunityAcceptResponse,
  type ObjectCode,
  type OpportunityAct,
  type OpportunityAcceptBody,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, notFound } from '@api/platform/http/problem'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { TouchService } from '../touch/touch.service'
import {
  boardVerdict,
  DEAL_HELD_REFUSAL,
  dealAtOf,
  OpportunityLifecycle,
} from './opportunity-lifecycle'
import { announceAccepted, announceOwners } from './opportunity-bell'
import {
  actorRoles,
  actorsByIds,
  assertSellersIn,
  primaryOf,
  recordSaleLane,
  salePrimaryOf,
} from './opportunity-owners'
import { daysInStageOf, holderOf, type RefOwner } from './opportunity.mapper'
import { OpportunityFacts } from './opportunity-facts'
import { OpportunityRepository, type OpportunityRead } from './opportunity.repository'

/** The accept door (ADR 0071 §3): a head of sales or director takes a `new`
 *  deal to `assigned`, optionally adding SALE owners in the same act.
 *
 *  UNSCOPED on purpose — a head accepts from the queue of every deal, so the
 *  read is `byCode(null, …)` and a missing deal is the only 404. Accepting is
 *  once: a deal past `new` answers 409 naming who accepted it; re-accept and
 *  takeover are not doors (yet).
 *
 *  One transaction, under the deal's row lock: owners union, then the move
 *  through `OpportunityLifecycle.assigned`, which writes the acceptor in the
 *  same UPDATE as the stage, plus the stage event, touch and mirror row; added
 *  sellers leave the assign door's touch, and the old holder's step follows
 *  the new holder (the acceptor, when no seller is added). */
@Injectable()
export class OpportunityAccept {
  private readonly log = new Logger('opportunity-accept')

  constructor(
    private readonly deals: OpportunityRepository,
    private readonly lifecycle: OpportunityLifecycle,
    private readonly touch: TouchService,
    private readonly facts: OpportunityFacts,
    private readonly hub: NotificationHub,
  ) {}

  async accept(
    who: Actor,
    code: ObjectCode,
    body: OpportunityAcceptBody,
  ): Promise<OpportunityAcceptResponse> {
    const by = { id: who.id, name: who.name }
    const at = new Date()
    /* Who opened the deal: the `by` of its entry stage event, the oldest row.
       Read before the tx on the pool — it never changes. Bell-only, so a
       failure skips the opener's line, never the accept. */
    const opener = await this.deals.openerOf(code).catch((error: unknown) => {
      this.log.error(`Opener of ${code} was not read: ${String(error)}`)
      return null
    })

    const answered = await this.deals.run(async (tx) => {
      const found = await this.deals.lockedByCode(null, code, tx)
      if (!found) throw notFound('cơ hội', code)
      const verdict = acceptVerdict(found, found.pendingSign)
      if (!verdict.ok) throw conflict(verdict.reason)

      /* Union, never replace: accepting must not drop someone already on the
         deal. Only ids new to the SALE lane are judged as sellers. */
      const onSale = new Set(found.owners.filter((o) => o.role === 'SALE').map((o) => o.id))
      const addedIds = (body.saleOwners ?? []).filter((id) => !onSale.has(id))
      const actors = await actorsByIds(tx, [...onSale, ...addedIds])
      assertSellersIn(actors, addedIds)
      /* The primary is judged on the MERGED lane: the body may name someone
         already standing on it (ADR 0086). */
      const before = primaryOf(found.owners)
      const salePrimary = salePrimaryOf(actors, before, body.salePrimary)
      await this.deals.addOwners(
        tx,
        (body.saleOwners ?? []).map((actorId) => ({
          opportunityCode: code,
          actorId,
          role: 'SALE' as const,
        })),
      )
      if (salePrimary !== before) await this.deals.setSalePrimary(tx, code, salePrimary)
      /* The people are re-read only when this door wrote some. */
      const wrote = (body.saleOwners?.length ?? 0) > 0 || salePrimary !== before
      const fresh = wrote ? ((await this.deals.byCode(null, code, tx)) ?? found) : found
      const owner = await this.holderAfter(tx, fresh, by)
      const moved = await this.lifecycle.assigned(
        tx,
        { row: fresh.row, owner, signed: false, pendingSign: false, held: fresh.held },
        by,
        at,
      )
      if (!moved) throw conflict(alreadyAccepted(found))
      const label = fresh.row.name
      const occurrence = await recordSaleLane(
        tx,
        { touch: this.touch, hub: this.hub },
        {
          code,
          label,
          added: fresh.owners.filter((o) => o.role === 'SALE' && addedIds.includes(o.id)),
          removed: [],
          from: found.holder,
          to: owner,
          by,
          at,
        },
      )
      const was = found.owners.map((o) => o.id)
      const after = fresh.owners.map((o) => o.id)
      const people = { code, label, actorId: who.id, before: was, after }
      await announceOwners(tx, this.hub, { ...people, occurrence })
      /* One act, one line: whoever it added hears `announceOwners`, the rest
         hear this, so no primary-changed line either. */
      const stayed = after.filter((id) => was.includes(id))
      await announceAccepted(tx, this.hub, { ...people, holders: stayed })
      if (opener && !after.includes(opener)) {
        await this.tellOpener(tx, { code, label, actorId: who.id }, opener, fresh.row.leadCode)
      }
      /* The move changed only the row, the acceptor, and so the holder. */
      return {
        ...fresh,
        row: moved,
        acceptedBy: by,
        holder: owner,
        daysInStage: daysInStageOf(moved, at),
      }
    })

    return OpportunityAcceptResponse.parse(await this.facts.row(answered))
  }

  /** An opener off the deal may not open it: they hear it on the lead (ADR
   *  0093 §7), and only while they hold that lead or are not own-only — else
   *  the lead is not theirs to open either. A failed read skips the line. */
  private async tellOpener(
    tx: Db,
    deal: { code: string; label: string; actorId: string },
    opener: string,
    leadCode: string,
  ): Promise<void> {
    const lead = await this.hub.bellRead(tx, `lead of ${deal.code}`, null, async (s) => {
      const read = await this.deals.leadCompany(s, leadCode)
      if (!read) return null
      /* The shared role audience is exactly "active and not own-only". */
      const roles = (await actorRoles(s, [opener])).get(opener) ?? []
      const shared = (await this.hub.sharedInRoles(s, roles)).includes(opener)
      return read.ownerId === opener || shared ? read : null
    })
    if (!lead) return
    const subject = { kind: 'lead' as const, code: leadCode, label: lead.company }
    await announceAccepted(tx, this.hub, { ...deal, holders: [opener], subject })
  }

  /** The holder once `by` is the acceptor — read before the move, because the
   *  move writes the mirror row and must name the right person in it. */
  private async holderAfter(tx: Db, read: OpportunityRead, by: RefOwner): Promise<RefOwner | null> {
    const roles = await actorRoles(
      tx,
      read.owners.map((o) => o.id),
    )
    return holderOf(
      read.owners.map((o) => ({ ...o, roleIds: roles.get(o.id) ?? null })),
      by,
    )
  }
}

/** `dd/mm` in Vietnam time. `en-GB`, not `vi-VN`: Node's ICU prints `dd-mm`
 *  for the latter, and the sentence reads the slash form. */
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
})

/** Accepting is once, and only on the board (`boardVerdict`). Pure: the door
 *  and the profile's `acts.accept` read the same answer. */
export function acceptVerdict(found: OpportunityRead, pendingSign: boolean): OpportunityAct {
  const board = boardVerdict(dealAtOf(found, pendingSign), 'nhận PIC')
  if (!board.ok) return board
  /* Accepting moves the column, and a held deal's column does not move. */
  if (found.held) return { ok: false, reason: DEAL_HELD_REFUSAL }
  return board.stage === 'new' ? { ok: true } : { ok: false, reason: alreadyAccepted(found) }
}

/** Past `new` already. A deal that reached `assigned` before ADR 0071 with no
 *  head on it has no acceptor to name, so it gets the sentence without one. */
function alreadyAccepted(found: OpportunityRead): string {
  const { acceptedBy } = found
  const at = found.row.acceptedAt
  return acceptedBy && at
    ? `Cơ hội đã được ${acceptedBy.name} nhận PIC ngày ${DAY_MONTH.format(at)}.`
    : `Cơ hội ${found.row.code} đã nhận PIC rồi.`
}
