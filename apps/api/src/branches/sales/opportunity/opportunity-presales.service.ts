import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  OpportunitySaleOwnersResponse,
  type ObjectCode,
  type OpportunityPresalesOwnersBody,
} from '@pv/contracts'
import { conflict, notFound } from '@api/platform/http/problem'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { TouchService } from '../touch/touch.service'
import { boardVerdict, dealAtOf } from './opportunity-lifecycle'
import { announceOwners } from './opportunity-bell'
import { actorsByIds, assertPresalesIn } from './opportunity-owners'
import { NOTE } from './opportunity.mapper'
import { OpportunityFacts } from './opportunity-facts'
import { OpportunityRepository } from './opportunity.repository'

/** The Presales door (ADR 0160 §5): replaces the PRESALES lane of an accepted
 *  deal. It mirrors the sale-owners door; its body has no primary, since Presales
 *  never holds one.
 *
 *  Writes that lane only. The holder, the primary and the next step cannot move,
 *  so no hand-over or mirror row follows. Refused while a sign request waits:
 *  the signing snapshot copies this lane, and it decides who gets the credit. */
@Injectable()
export class OpportunityPresales {
  constructor(
    private readonly deals: OpportunityRepository,
    private readonly touch: TouchService,
    private readonly facts: OpportunityFacts,
    private readonly hub: NotificationHub,
  ) {}

  async assign(
    who: Actor,
    code: ObjectCode,
    body: OpportunityPresalesOwnersBody,
  ): Promise<OpportunitySaleOwnersResponse> {
    const at = new Date()

    const read = await this.deals.run(async (tx) => {
      const found = await this.deals.lockedByCode(who, code, tx)
      if (!found || !found.inScope) throw notFound('cơ hội', code)
      const verdict = boardVerdict(dealAtOf(found, found.pendingSign), 'giao Presales')
      if (!verdict.ok) throw conflict(verdict.reason)
      if (verdict.stage === 'new') {
        throw conflict('Cơ hội chưa nhận PIC. Nhận PIC trước rồi giao Presales.')
      }

      const before = found.owners.filter((o) => o.role === 'PRESALES')
      const removed = before.filter((o) => !body.presalesOwners.includes(o.id))
      const addedIds = body.presalesOwners.filter((id) => !before.some((o) => o.id === id))
      if (removed.length === 0 && addedIds.length === 0) return found
      assertPresalesIn(await actorsByIds(tx, addedIds), addedIds)

      await this.deals.replacePresales(tx, code, body.presalesOwners)
      const fresh = await this.deals.byCode(null, code, tx)
      if (!fresh) throw notFound('cơ hội', code)
      const names = (ids: readonly string[]) =>
        fresh.owners.filter((o) => o.role === 'PRESALES' && ids.includes(o.id)).map((o) => o.name)
      const [occurrence] = await this.touch.record(tx, [
        {
          subjectCode: code,
          subjectKind: 'opportunity',
          kind: 'field-filled',
          by: who.name,
          actorId: who.id,
          note: NOTE.presalesLane(
            names(addedIds),
            removed.map((o) => o.name),
          ),
          at,
        },
      ])
      await announceOwners(tx, this.hub, {
        code,
        label: fresh.row.name,
        actorId: who.id,
        before: found.owners.map((o) => o.id),
        after: fresh.owners.map((o) => o.id),
        occurrence,
      })
      return fresh
    })

    return OpportunitySaleOwnersResponse.parse(await this.facts.row(read))
  }
}
