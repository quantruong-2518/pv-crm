import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  OpportunityOpenContext,
  type ObjectCode,
  type OpportunityContactPick,
  type OpportunityRunningDeal,
  type WorkstreamCustomer,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, denied, invalid, notFound, type PvError } from '@api/platform/http/problem'
import { stageConfigOf } from '../ladder'
import { LeadStateWriter } from '../lead/lead-state'
import { OpportunityOpenRepository } from './opportunity-open.repository'
import { peopleOf } from './opportunity.mapper'
import { OpportunityRepository } from './opportunity.repository'

/** Who may open a deal on a lead: its holder, a reader the scope does not cut,
 *  and anyone when nobody holds it — the opener then takes it (ADR 0088 §17).
 *  A lead somebody else holds stays closed to an `ownOnly` caller. */
export const opens = (who: Actor, ownerId: string | null): boolean =>
  !who.ownOnly || ownerId === null || ownerId === who.id

export const foreignLead = (code: string) =>
  denied('out-of-scope', `Lead ${code} không do bạn phụ trách.`)

export const STRANGER = 'Người liên hệ phải thuộc lead này hoặc một lead khác của cùng công ty.'

/** `acknowledged` names exactly the running deals — the one rule of a second
 *  deal on a lead, and of a double submit (ADR 0088 §9). */
export const acknowledges = (
  running: readonly { code: string }[],
  acknowledged: readonly string[],
): boolean =>
  running.length === new Set(acknowledged).size &&
  running.every((d) => acknowledged.includes(d.code))

/** The 409 of `OpportunityOpenRefusal`: the Problem filter spreads `extra`
 *  into the body, so the list as it stands travels with the refusal. */
export const runningChanged = (leadCode: string, running: readonly unknown[]): PvError =>
  Object.assign(
    conflict(`Cơ hội đang chạy của lead ${leadCode} đã thay đổi. Xem lại rồi xác nhận.`),
    { extra: { runningDeals: running } },
  )

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
    private readonly leadStates: LeadStateWriter,
  ) {}

  /** `GET /sales/opportunities/open-context`. Same two answers as the create
   *  door: no such lead is 404, a lead somebody else holds is 403. */
  async context(who: Actor, leadCode: ObjectCode): Promise<OpportunityOpenContext> {
    const db = this.repo.readonlyHandle
    const found = await this.repo.leadFacts(db, leadCode)
    if (!found) throw notFound('lead', leadCode)
    if (!opens(who, found.ownerId)) throw foreignLead(leadCode)
    const { accountCode, workstreamCode } = found

    const [owningAccount, previousWon, standing, contacts, ladder, running] = await Promise.all([
      accountCode ? this.repo.accountWithOwner(db, accountCode) : null,
      accountCode ? this.repo.previousWon(db, who, accountCode, workstreamCode) : null,
      workstreamCode ? this.repo.standingDeal(db, who, workstreamCode) : null,
      this.repo.reachableContacts(db, who, leadCode),
      this.deals.stageRows(),
      this.running(db, [leadCode]),
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
      runningDeals: running.get(leadCode) ?? [],
      contacts,
      newStageLimitDays: stageConfigOf(ladder).get('new')?.limitDays ?? null,
    })
  }

  /** Lead code → its running deals as the wire names them, oldest first. The
   *  holder is the book row's (`peopleOf`), so both screens name one person.
   *  "Running" is `runningRows`' `dealOpen` alone — open, not lost, not signed. */
  async running(
    db: Db,
    leadCodes: readonly string[],
  ): Promise<Map<string, OpportunityRunningDeal[]>> {
    const rows = await this.repo.runningRows(db, leadCodes)
    const owners = await this.deals.ownersOf(
      db,
      rows.map((r) => r.code),
    )
    const byLead = new Map<string, OpportunityRunningDeal[]>()
    for (const r of rows) {
      /* Narrows the type, drops nothing: only a stop or a signature nulls
         `stage`, and `dealOpen` has already left both out. */
      if (!r.stage) continue
      const { holder } = peopleOf(r, r.acceptorName, owners.get(r.code))
      const deal = { code: r.code, name: r.name, stage: r.stage, holder }
      byLead.set(r.leadCode, [...(byLead.get(r.leadCode) ?? []), deal])
    }
    return byLead
  }

  /** Lock the leads a deal write lands on (`lockLeads`), so a park or a
   *  hand-over racing it waits, then re-check scope and liveness on the locked
   *  rows — the pre-reads ran outside the tx — and hand the opener every lead
   *  nobody holds (ADR 0088 §17). Returns each lead's company, read under that
   *  lock: the deal copies it, a body never names one. */
  async lockLeads(
    tx: Db,
    who: Actor,
    leadCodes: readonly string[],
  ): Promise<ReadonlyMap<string, string | null>> {
    const rows = await this.deals.lockLeads(tx, leadCodes)
    /* Absent under the lock = switched off (or never there): a 404, to anyone. */
    const live = new Set(rows.map((r) => r.code))
    const gone = leadCodes.find((code) => !live.has(code))
    if (gone) throw notFound('lead', gone)
    const foreign = rows.find((r) => !opens(who, r.ownerId))
    if (foreign) throw foreignLead(foreign.code)
    await this.leadStates.claimed(
      tx,
      rows.filter((r) => r.ownerId === null),
      who,
    )
    return new Map(rows.map((r) => [r.code, r.accountCode]))
  }

  /** Under the lead lock: the body must name exactly the lead's running deals,
   *  else 409 with the list as it stands. A repeated submit carries a list
   *  without the deal the first one minted, so it stops here too. */
  async assertAcknowledged(
    tx: Db,
    leadCode: string,
    acknowledged: readonly string[],
  ): Promise<void> {
    const running = (await this.running(tx, [leadCode])).get(leadCode) ?? []
    if (!acknowledges(running, acknowledged)) throw runningChanged(leadCode, running)
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
    await this.repo.insertContacts(
      tx,
      picks.map((p) => ({ ...p, opportunityCode: code })),
    )
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
