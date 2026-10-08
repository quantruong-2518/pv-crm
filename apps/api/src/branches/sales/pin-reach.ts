import { and, eq, inArray } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { PinSubject } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import type { PinReach } from '@api/platform/pin/pin-reach'
import { lead } from './lead/lead.schema'
import { leadLive, leadScope } from './lead/lead-scope'
import { dealScope } from './opportunity/opportunity-book.sql'
import { opportunity } from './opportunity/opportunity.schema'

/** Sales' answer to `PinReach`: a code may be pinned when the book would list
 *  it to this reader — the books' own scope predicates, scoped as the book
 *  routes are, plus `leadLive` (a switched-off lead and its deals are absent,
 *  not hidden). Bound in `app.module.ts` through `PinModule.withReach`. */
@Injectable()
export class SalesPinReach implements PinReach {
  constructor(@Inject(DB) private readonly db: Db) {}

  async visible(who: Actor, subject: PinSubject, codes: readonly string[]): Promise<string[]> {
    const rows =
      subject === 'lead'
        ? await this.db
            .select({ code: lead.code })
            .from(lead)
            .where(and(inArray(lead.code, [...codes]), leadLive, leadScope(who, true)))
        : await this.db
            .select({ code: opportunity.code })
            .from(opportunity)
            .innerJoin(lead, eq(lead.code, opportunity.leadCode))
            .where(and(inArray(opportunity.code, [...codes]), leadLive, dealScope(who, true)))
    return rows.map((r) => r.code)
  }
}
