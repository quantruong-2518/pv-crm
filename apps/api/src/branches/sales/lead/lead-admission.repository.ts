import { and, eq, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { LeadState } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { account } from '../account/account.schema'
import { contact } from '../contact/contact.schema'
import { leadLive, leadScope } from './lead-scope'
import { lead } from './lead.schema'
import type { Needles } from './lead-admission.mapper'

/** Every lead, with all its people, of every account a batch reaches. */
export type BookSlice = {
  accounts: { code: string; name: string; taxCode: string | null }[]
  leads: {
    code: string
    accountCode: string
    state: LeadState
    contactName: string
    email: string
    phone: string | null
    /** Not switched off. */
    live: boolean
    inScope: boolean
    /** Outside the caller's scope — somebody else's or nobody's — live or not. */
    barred: boolean
  }[]
  contacts: { leadCode: string; name: string; email: string | null; phone: string | null }[]
}

const any = (column: SQL, values: readonly string[]): SQL | undefined =>
  values.length > 0 ? inArray(column, [...values]) : undefined

const mailbox = (column: AnyPgColumn): SQL => sql`lower(${column})`

/** Token for token the expression migration 0098 indexes — change one, change both. */
const domainOf = (column: AnyPgColumn): SQL => sql`split_part(lower(${column}), '@', 2)`

/** THE ADMISSION GATE'S SQL. Decides nothing, and issues the same number of
 *  statements for one item as for five thousand: three to learn which accounts
 *  a batch reaches (`reach`), three to load those accounts whole (`slice`).
 *  The caller pages its arguments past `BIND_BUDGET`, far above a full file.
 *
 *  Every read takes the caller's handle: a door re-reads inside its write
 *  transaction, and on PGlite the pool's one connection is held by that
 *  transaction. Disabled leads are loaded too: they keep their account
 *  reached, and the mapper counts them as not open. */
@Injectable()
export class LeadAdmissionRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The pool, for the read-only check door. */
  get readonlyHandle(): Db {
    return this.db
  }

  /** Round 1: the account codes any key of the batch points at. A lead with no
   *  account is not reached — the engine's book has no place for one. */
  async reach(db: Db, n: Needles): Promise<string[]> {
    const codes = new Set<string>()
    const byCompany = or(
      any(sql`${account.taxRoot}`, n.taxRoots),
      any(sql`${account.nameKey}`, n.nameKeys),
    )
    if (byCompany) {
      const rows = await db.select({ code: account.code }).from(account).where(byCompany)
      for (const r of rows) codes.add(r.code)
    }
    const onLead = or(
      any(mailbox(lead.email), n.emails),
      any(sql`${lead.phoneKey}`, n.phones),
      any(domainOf(lead.email), n.domains),
    )
    const onContact = or(
      any(mailbox(contact.email), n.emails),
      any(sql`${contact.phoneKey}`, n.phones),
      any(domainOf(contact.email), n.domains),
    )
    /* The two share their needles, so one is undefined exactly when the other is. */
    if (!onLead || !onContact) return [...codes]
    const leads = await db
      .select({ code: lead.accountCode })
      .from(lead)
      .where(and(isNotNull(lead.accountCode), onLead))
    const contacts = await db
      .select({ code: lead.accountCode })
      .from(contact)
      .innerJoin(lead, eq(lead.code, contact.leadCode))
      .where(and(isNotNull(lead.accountCode), onContact))
    for (const r of [...leads, ...contacts]) if (r.code) codes.add(r.code)
    return [...codes]
  }

  /** Round 2: those accounts whole. `inScope` = the caller's own, live leads;
   *  an anonymous caller holds none. */
  async slice(
    db: Db,
    who: Pick<Actor, 'id' | 'ownOnly'> | null,
    accountCodes: readonly string[],
  ): Promise<BookSlice> {
    if (accountCodes.length === 0) return { accounts: [], leads: [], contacts: [] }
    const codes = [...accountCodes]
    const accounts = await db
      .select({ code: account.code, name: account.name, taxCode: account.taxCode })
      .from(account)
      .where(inArray(account.code, codes))
    const leads = await db
      .select({
        code: lead.code,
        accountCode: sql<string>`${lead.accountCode}`,
        state: lead.state,
        contactName: lead.contactName,
        email: lead.email,
        phone: lead.phone,
        live: sql<boolean>`${leadLive}`,
        inScope: who
          ? sql<boolean>`COALESCE(${and(leadScope(who, true), leadLive)}, false)`
          : sql<boolean>`false`,
        /* An unowned lead is NULL on the scope test, and still not the caller's. */
        barred: who
          ? sql<boolean>`NOT COALESCE(${leadScope(who, true) ?? sql`true`}, false)`
          : sql<boolean>`true`,
      })
      .from(lead)
      .where(inArray(lead.accountCode, codes))
    const contacts = await db
      .select({
        leadCode: contact.leadCode,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
      })
      .from(contact)
      .innerJoin(lead, eq(lead.code, contact.leadCode))
      .where(inArray(lead.accountCode, codes))
    return { accounts, leads, contacts }
  }

  /** Held to the transaction's end. One statement; the VALUES rows are taken
   *  in the order given, which the caller has sorted. */
  async lock(tx: Db, keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return
    const rows = sql.join(
      keys.map((key) => sql`(${key}::text)`),
      sql`, `,
    )
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('lead-admission:' || k)) FROM (VALUES ${rows}) AS v(k)`,
    )
  }
}
