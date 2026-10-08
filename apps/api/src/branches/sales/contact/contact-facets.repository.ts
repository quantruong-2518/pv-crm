import { and, asc, count, eq, isNotNull } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { ContactFacetsQuery } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { account } from '../account/account.schema'
import { leadLive, leadScope } from '../lead/lead-scope'
import { lead } from '../lead/lead.schema'
import { ContactRepository } from './contact.repository'
import { contact } from './contact.schema'

/** `GET /sales/contacts/facets` in SQL: the companies a reader can filter the
 *  contact book by. Cut by lead scope exactly like `ContactRepository.book`,
 *  and counted without the `account` filter so a pick keeps its siblings. */
@Injectable()
export class ContactFacetsRepository {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly contacts: ContactRepository,
  ) {}

  async accounts(who: Actor, q: ContactFacetsQuery) {
    const where = and(
      ...this.contacts.filtersOf({ ...q, account: undefined }),
      leadLive,
      leadScope(who, true),
      isNotNull(lead.accountCode),
    )

    const rows = await this.db
      .select({ value: lead.accountCode, label: account.name, count: count() })
      .from(contact)
      .innerJoin(lead, eq(lead.code, contact.leadCode))
      .innerJoin(account, eq(account.code, lead.accountCode))
      .where(where)
      .groupBy(lead.accountCode, account.name)
      .orderBy(asc(account.name))

    return rows.flatMap((r) => (r.value === null ? [] : [{ ...r, value: r.value }]))
  }
}
