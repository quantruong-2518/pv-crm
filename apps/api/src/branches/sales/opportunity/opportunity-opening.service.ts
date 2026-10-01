import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { OpportunityOpenContext, type ObjectCode, type OpportunityContactPick } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { denied, invalid, notFound } from '@api/platform/http/problem'
import { stageConfigOf } from '../ladder'
import { OpportunityOpenRepository } from './opportunity-open.repository'
import { OpportunityRepository } from './opportunity.repository'

/** Lead scope by id, the lead doors' rule (`LeadExitService.lockRow`): an
 *  `ownOnly` caller converts only a lead they hold — never a pool lead. */
export const holds = (who: Actor, ownerId: string | null): boolean =>
  !who.ownOnly || ownerId === who.id

export const foreignLead = (code: string) =>
  denied('out-of-scope', `Lead ${code} không đứng tên bạn — hỏi người đang giữ nó.`)

const STRANGER = 'Người liên hệ phải thuộc lead này hoặc một lead khác của cùng công ty.'

/** The door's two halves around the people a deal names: what the drawer shows
 *  before the first keystroke, and the check that a create body names only
 *  people from that same list. Separate from `OpportunityService`, which is
 *  already past the length ceiling. */
@Injectable()
export class OpportunityOpening {
  constructor(
    private readonly repo: OpportunityOpenRepository,
    private readonly deals: OpportunityRepository,
  ) {}

  /** `GET /sales/opportunities/open-context`. Same two answers as the create
   *  door: no such lead is 404, a lead somebody else holds is 403. */
  async context(who: Actor, leadCode: ObjectCode): Promise<OpportunityOpenContext> {
    const db = this.repo.readonlyHandle
    const found = await this.repo.leadFacts(db, leadCode)
    if (!found) throw notFound('lead', leadCode)
    if (!holds(who, found.ownerId)) throw foreignLead(leadCode)
    const { accountCode, workstreamCode } = found

    const [owningAccount, previousWon, standing, contacts, ladder] = await Promise.all([
      accountCode ? this.repo.accountWithOwner(db, accountCode) : null,
      accountCode ? this.repo.previousWon(db, who, accountCode, workstreamCode) : null,
      workstreamCode ? this.repo.standingDeal(db, who, workstreamCode) : null,
      this.repo.reachableContacts(db, who, leadCode),
      this.deals.stageRows(),
    ])

    return OpportunityOpenContext.parse({
      leadCode,
      workstream: workstreamCode
        ? {
            code: workstreamCode,
            customer: accountCode ? (previousWon ? 'returning' : 'new') : null,
            previousWonCode: previousWon?.inScope ? previousWon.code : null,
          }
        : null,
      account: owningAccount && {
        code: owningAccount.code,
        name: owningAccount.name,
        owner: owningAccount.ownerId
          ? { id: owningAccount.ownerId, name: owningAccount.ownerName }
          : null,
      },
      standingDeal: standing && {
        code: standing.inScope ? standing.code : null,
        name: standing.inScope ? standing.name : null,
        stage: standing.stage,
      },
      contacts,
      newStageLimitDays: stageConfigOf(ladder).get('new')?.limitDays ?? null,
    })
  }

  /** Refuse any pick outside `reachableContacts`, then write the rows. Inside
   *  the deal's own transaction, so a refusal leaves no deal behind. */
  async writeContacts(
    tx: Db,
    who: Actor,
    code: string,
    leadCode: string,
    picks: readonly OpportunityContactPick[],
  ): Promise<void> {
    const reach = new Set((await this.repo.reachableContacts(tx, who, leadCode)).map((c) => c.code))
    if (picks.some((p) => !reach.has(p.contactCode)))
      throw invalid({ contacts: [STRANGER] }, STRANGER)
    await this.repo.insertContacts(tx, code, picks)
  }
}
