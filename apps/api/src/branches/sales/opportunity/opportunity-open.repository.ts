import { Inject, Injectable } from '@nestjs/common'
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  ne,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Actor } from '@pv/engines'
import type { OpportunityContactPick, StageKey } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { account } from '../account/account.schema'
import { configEntry } from '../config/config.schema'
import { contact } from '../contact/contact.schema'
import { lead } from '../lead/lead.schema'
import { leadLive, leadScope } from '../lead/lead-scope'
import { dealOpen, dealStoodBy } from '../open-deal'
import { runBefore } from '../workstream/workstream.repository'
import { workstream } from '../workstream/workstream.schema'
import { ACCEPTOR_NAME } from './opportunity.repository'
import { opportunity, opportunityContact } from './opportunity.schema'

export type OpenLead = {
  ownerId: string | null
  accountCode: string | null
  workstreamCode: string | null
}

export type OpenContact = {
  code: string
  name: string
  title: string | null
  source: 'lead' | 'account'
  /** The primary contact of the lead ITSELF — the import's blank-cell pick. */
  primary: boolean
}

/** WON runs at `accountCode` other than `current` — the one reading of "this
 *  account has won with us before". The drawer asks as of now; a deal row
 *  passes its own run as `openedBefore`, so a later win cannot rewrite an older
 *  run as returning (ADR 0076). */
export const wonElsewhere = (
  run: { accountCode: AnyColumn; closeReason: AnyColumn; code: AnyColumn; openedAt: AnyColumn },
  accountCode: AnyColumn | string,
  current: AnyColumn | string | null,
  openedBefore?: { openedAt: AnyColumn; code: AnyColumn },
): SQL | undefined =>
  and(
    eq(run.accountCode, accountCode),
    eq(run.closeReason, 'WON'),
    current === null ? undefined : ne(run.code, current),
    openedBefore ? runBefore(run, { accountCode, ...openedBefore }, false) : undefined,
  )

/** Reads behind the "open an opportunity" drawer, and the contact rows the
 *  create door writes. One class because both halves answer the same question:
 *  which people may a deal opened on THIS lead name. */
@Injectable()
export class OpportunityOpenRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  get readonlyHandle(): Db {
    return this.db
  }

  async leadFacts(db: Db, code: string): Promise<OpenLead | null> {
    const [row] = await db
      .select({
        ownerId: lead.ownerId,
        accountCode: lead.accountCode,
        workstreamCode: lead.workstreamCode,
      })
      .from(lead)
      .where(and(eq(lead.code, code), leadLive))
      .limit(1)
    return row ?? null
  }

  /** Every RUNNING deal of these leads (`dealOpen`: not lost, not signed),
   *  oldest first, whatever the reader's scope — the list a second deal must
   *  acknowledge (ADR 0088 §9). `code` only breaks ties. Takes the caller's
   *  handle so the create door reads it under its lead lock. */
  async runningRows(db: Db, leadCodes: readonly string[]) {
    if (leadCodes.length === 0) return []
    return db
      .select({
        leadCode: opportunity.leadCode,
        code: opportunity.code,
        name: opportunity.name,
        stage: opportunity.stage,
        acceptedById: opportunity.acceptedById,
        acceptorName: ACCEPTOR_NAME,
      })
      .from(opportunity)
      .where(
        and(
          inArray(opportunity.leadCode, [...leadCodes]),
          dealOpen(opportunity.code, opportunity.state),
        ),
      )
      .orderBy(asc(opportunity.createdAt), asc(opportunity.code))
  }

  /** Ids of the PRODUCT catalogue still switched on — what a file may name. */
  async liveProducts(db: Db): Promise<Set<string>> {
    const rows = await db
      .select({ id: configEntry.id })
      .from(configEntry)
      .where(and(eq(configEntry.list, 'PRODUCT'), eq(configEntry.active, true)))
    return new Set(rows.map((r) => r.id))
  }

  /** Per lead: its own contacts, then those of OTHER leads at the same account.
   *
   *  The account half takes the lead book's scope (`leadScope`) on the SIBLING
   *  lead: an `ownOnly` reader sees account contacts only from leads they hold.
   *  Both deal doors check picks against this same list, so the picker, the
   *  file and the server cannot disagree about who may be named. */
  async reachByLead(
    db: Db,
    who: Actor,
    leadCodes: readonly string[],
  ): Promise<Map<string, OpenContact[]>> {
    const byLead = new Map<string, OpenContact[]>()
    if (leadCodes.length === 0) return byLead
    const mine = alias(lead, 'mine')
    const own = sql<boolean>`${contact.leadCode} = ${mine.code}`
    const sibling = and(
      isNotNull(mine.accountCode),
      eq(lead.accountCode, mine.accountCode),
      leadScope(who, true),
    )
    const rows = await db
      .select({
        leadCode: mine.code,
        code: contact.code,
        name: contact.name,
        title: contact.title,
        own,
        isPrimary: contact.isPrimary,
      })
      .from(contact)
      .innerJoin(lead, eq(lead.code, contact.leadCode))
      .innerJoin(mine, and(inArray(mine.code, [...leadCodes]), or(own, sibling)))
      .where(leadLive)
      .orderBy(desc(own), desc(contact.isPrimary), asc(contact.name), asc(contact.code))
    for (const r of rows) {
      const list = byLead.get(r.leadCode) ?? []
      list.push({
        code: r.code,
        name: r.name,
        title: r.title,
        source: r.own ? 'lead' : 'account',
        primary: r.own && r.isPrimary,
      })
      byLead.set(r.leadCode, list)
    }
    return byLead
  }

  async reachableContacts(db: Db, who: Actor, leadCode: string): Promise<OpenContact[]> {
    return (await this.reachByLead(db, who, [leadCode])).get(leadCode) ?? []
  }

  async insertContacts(
    tx: Db,
    picks: readonly (OpportunityContactPick & { opportunityCode: string })[],
  ): Promise<void> {
    if (picks.length === 0) return
    await tx.insert(opportunityContact).values(
      picks.map((p) => ({
        opportunityCode: p.opportunityCode,
        contactCode: p.contactCode,
        role: p.role,
        isPrimary: p.primary,
      })),
    )
  }

  /** The deal's contact rows as stored, with names, for the replace door. */
  async contactsOf(tx: Db, code: string): Promise<(OpportunityContactPick & { name: string })[]> {
    const rows = await tx
      .select({
        contactCode: opportunityContact.contactCode,
        role: opportunityContact.role,
        primary: opportunityContact.isPrimary,
        name: contact.name,
      })
      .from(opportunityContact)
      .innerJoin(contact, eq(contact.code, opportunityContact.contactCode))
      .where(eq(opportunityContact.opportunityCode, code))
    return rows.map((r) => ({ ...r, role: r.role ?? null }))
  }

  async deleteContacts(tx: Db, code: string): Promise<void> {
    await tx.delete(opportunityContact).where(eq(opportunityContact.opportunityCode, code))
  }

  async accountWithOwner(db: Db, code: string) {
    const [row] = await db
      .select({ code: account.code, name: account.name, ownerId: actor.id, ownerName: actor.name })
      .from(account)
      .leftJoin(actor, eq(actor.id, account.ownerId))
      .where(eq(account.code, code))
      .limit(1)
    return row ?? null
  }

  /** Latest WON run at the account other than the lead's own, newest close
   *  first, with the reader's verdict on it: the run's anchoring lead under the
   *  lead book's scope, the axis `workstream.view` applies (`inScope`). */
  async previousWon(
    db: Db,
    who: Actor,
    accountCode: string,
    current: string | null,
  ): Promise<{ code: string; inScope: boolean } | null> {
    const scope = leadScope(who, true)
    const [row] = await db
      .select({
        code: workstream.code,
        inScope: scope ? sql<boolean>`COALESCE(${scope}, false)` : sql<boolean>`true`,
      })
      .from(workstream)
      .leftJoin(lead, eq(lead.workstreamCode, workstream.code))
      /* LEFT join: a run with no lead keeps its row, `disabled_at` being NULL. */
      .where(and(wonElsewhere(workstream, accountCode, current), leadLive))
      .orderBy(sql`${workstream.closedAt} DESC NULLS LAST`, desc(workstream.code))
      .limit(1)
    return row ?? null
  }

  /** The deal the run's `stand_*` columns point at — read, never recomputed:
   *  `sales.workstream_stand()` is the only definition of where a run stands.
   *  `inScope` is the deal book's own predicate (`dealStoodBy`), so a deal the
   *  reader could not open from the book is not named here either. */
  async standingDeal(
    db: Db,
    who: Actor,
    runCode: string,
  ): Promise<{ code: string; name: string; stage: StageKey; inScope: boolean } | null> {
    const [row] = await db
      .select({
        code: opportunity.code,
        name: opportunity.name,
        stage: opportunity.stage,
        inScope: who.ownOnly
          ? sql<boolean>`COALESCE(${dealStoodBy(opportunity.code, who.id)}, false)`
          : sql<boolean>`true`,
      })
      .from(workstream)
      .innerJoin(opportunity, eq(opportunity.code, workstream.standCode))
      .where(and(eq(workstream.code, runCode), eq(workstream.standKind, 'OP')))
      .limit(1)
    return row && row.stage ? { ...row, stage: row.stage } : null
  }
}
