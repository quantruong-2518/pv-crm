import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl } from '@pv/engines'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import type { MessageLogged, MessageLoggedHook } from '@api/platform/comms/message-logged.hook'
import { LeadCommsHook } from '../lead/lead-comms.hook'
import { dealAtOf, OpportunityLifecycle } from './opportunity-lifecycle'
import { scopeRefOf } from './opportunity.mapper'
import { OpportunityRepository } from './opportunity.repository'

/** The one `MESSAGE_LOGGED_HOOK` binding for sales: a lead's turn goes to the
 *  lead hook, a deal's turn moves the deal `assigned` → `engaged` (ADR 0126).
 *  The deal's side asks E2 with the deal's own scope, so only someone who may
 *  edit THIS deal moves it. */
@Injectable()
export class SalesCommsHook implements MessageLoggedHook {
  constructor(
    private readonly lead: LeadCommsHook,
    private readonly deals: OpportunityRepository,
    private readonly lifecycle: OpportunityLifecycle,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async afterLogged(tx: Db, event: MessageLogged): Promise<void> {
    if (event.subjectKind !== 'OP') return this.lead.afterLogged(tx, event)
    const read = await this.deals.lockedByCode(null, event.subjectCode, tx)
    if (!read) return
    const ref = scopeRefOf(read.row, read.owners, event.actor)
    const verdict = this.access.check(event.actor, {
      branch: 'Sales',
      permission: 'opportunity.edit',
      ref,
    })
    if (!verdict.ok) return
    await this.lifecycle.contacted(tx, dealAtOf(read, read.pendingSign), event.actor, new Date())
  }
}
