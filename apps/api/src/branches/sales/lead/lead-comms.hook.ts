import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl } from '@pv/engines'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import type { MessageLogged, MessageLoggedHook } from '@api/platform/comms/message-logged.hook'
import { LeadStateWriter } from './lead-state'

/** A call or message logged by hand on a lead IS a real exchange, whatever the
 *  channel, direction or duration (ADR 0063 §2) — so it moves the lead to
 *  `working`. Lives here because it writes `sales.lead`; comms reaches it only
 *  through `MESSAGE_LOGGED_HOOK`, bound in `app.module.ts` (ADR 0049 shape).
 *
 *  The turn itself is a comms write on `comm.view`; moving the lead is a lead
 *  write, so it needs `lead.edit` — asked here, where lead rules live. Scope is
 *  by id inside the writer (`owner_id = actorId`): only the holder's turn moves. */
@Injectable()
export class LeadCommsHook implements MessageLoggedHook {
  constructor(
    private readonly state: LeadStateWriter,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async afterLogged(tx: Db, event: MessageLogged): Promise<void> {
    if (!this.access.allows(event.actor, 'lead.edit')) return
    await this.state.exchanged(tx, [event.subjectCode], event.actor.id)
  }
}
