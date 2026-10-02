import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  OpportunityOpenContext,
  type ObjectCode,
  type OpportunityContactPick,
  type WorkstreamCustomer,
} from '@pv/contracts'
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

/** New or returning: a run with no account cannot say; one whose account won
 *  another run before (`wonElsewhere`) is returning. The drawer and the deal row
 *  both answer through here. */
export const customerOf = (hasAccount: boolean, wonBefore: boolean): WorkstreamCustomer | null =>
  hasAccount ? (wonBefore ? 'returning' : 'new') : null

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
            customer: customerOf(accountCode !== null, previousWon !== null),
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

  /** Refuse any pick outside `reachableContacts` unless `kept` (already on the
   *  deal: code → name) holds it, then write the rows. Inside the deal's own
   *  transaction, so a refusal leaves no deal behind. Returns the picked
   *  people's names, primary first, for the caller's touch. */
  async writeContacts(
    tx: Db,
    who: Actor,
    code: string,
    leadCode: string,
    picks: readonly OpportunityContactPick[],
    kept: ReadonlyMap<string, string> = new Map(),
  ): Promise<string[]> {
    const reach = new Map([
      ...(await this.repo.reachableContacts(tx, who, leadCode)).map(
        (c) => [c.code, c.name] as const,
      ),
      ...kept,
    ])
    if (picks.some((p) => !reach.has(p.contactCode)))
      throw invalid({ contacts: [STRANGER] }, STRANGER)
    await this.repo.insertContacts(tx, code, picks)
    return [...picks]
      .sort((a, b) => Number(b.primary) - Number(a.primary))
      .map((p) => reach.get(p.contactCode) ?? p.contactCode)
  }

  /** `PUT …/:code/contacts`: the create door's check and write over a cleared
   *  list. A person already on the deal stays nameable whatever the editor's
   *  reach — only ADDED picks are checked. `null` = nothing changed. */
  async replaceContacts(
    tx: Db,
    who: Actor,
    code: string,
    leadCode: string,
    picks: readonly OpportunityContactPick[],
  ): Promise<string[] | null> {
    const key = (p: OpportunityContactPick) => `${p.contactCode}|${p.role ?? ''}|${p.primary}`
    const stored = await this.repo.contactsOf(tx, code)
    const before = new Set(stored.map(key))
    if (before.size === picks.length && picks.every((p) => before.has(key(p)))) return null
    await this.repo.deleteContacts(tx, code)
    const kept = new Map(stored.map((c) => [c.contactCode, c.name]))
    return this.writeContacts(tx, who, code, leadCode, picks, kept)
  }
}
