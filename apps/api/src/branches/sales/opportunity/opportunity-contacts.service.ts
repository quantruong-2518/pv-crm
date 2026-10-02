import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  OpportunityContactsResponse,
  type ObjectCode,
  type OpportunityContactsBody,
} from '@pv/contracts'
import { conflict, notFound } from '@api/platform/http/problem'
import { byOf, TouchService } from '../touch/touch.service'
import { editDetailsVerdict } from './opportunity-acts'
import { OpportunityFacts } from './opportunity-facts'
import { OpportunityOpening } from './opportunity-opening.service'
import { NOTE } from './opportunity.mapper'
import { OpportunityRepository } from './opportunity.repository'

/** `PUT /sales/opportunities/:code/contacts` — replace the deal's contact list.
 *
 *  Gated by `editDetailsVerdict` (`acts.editDetails`, ADR 0077 §5); the
 *  picks pass the create door's own check (`OpportunityOpening`). One
 *  transaction under the deal's row lock — so a stop racing it waits — and one
 *  `field-filled` touch naming the new list. An unchanged list writes nothing. */
@Injectable()
export class OpportunityContacts {
  constructor(
    private readonly deals: OpportunityRepository,
    private readonly opening: OpportunityOpening,
    private readonly touch: TouchService,
    private readonly facts: OpportunityFacts,
  ) {}

  async replace(
    who: Actor,
    code: ObjectCode,
    body: OpportunityContactsBody,
  ): Promise<OpportunityContactsResponse> {
    await this.deals.run(async (tx) => {
      const lock = await this.deals.lockDeal(tx, code)
      const found = lock ? await this.deals.byCode(who, code, tx) : null
      if (!found || !found.inScope) throw notFound('cơ hội', code)
      const verdict = editDetailsVerdict(found.row)
      if (!verdict.ok) throw conflict(verdict.reason)

      const names = await this.opening.replaceContacts(
        tx,
        who,
        code,
        found.row.leadCode,
        body.contacts,
      )
      if (names === null) return
      await this.touch.record(tx, [
        {
          subjectCode: code,
          subjectKind: 'opportunity',
          kind: 'field-filled',
          ...byOf(who),
          note: NOTE.contacts(names),
        },
      ])
    })

    const read = await this.deals.byCode(null, code)
    if (!read) throw notFound('cơ hội', code)
    return OpportunityContactsResponse.parse(await this.facts.row(read))
  }
}
