import { Injectable } from '@nestjs/common'
import type { Db } from '@api/platform/db/db.module'
import type { MessageLogged, MessageLoggedHook } from '@api/platform/comms/message-logged.hook'
import { LeadStateWriter } from './lead-state'

/** A call or message logged by hand on a lead IS a real exchange, whatever the
 *  channel, direction or duration (ADR 0063 §2) — so it moves the lead to
 *  `working`. Lives here because it writes `sales.lead`; comms reaches it only
 *  through `MESSAGE_LOGGED_HOOK`, bound in `app.module.ts` (ADR 0049 shape). */
@Injectable()
export class LeadCommsHook implements MessageLoggedHook {
  constructor(private readonly state: LeadStateWriter) {}

  afterLogged(tx: Db, event: MessageLogged): Promise<void> {
    return this.state.exchanged(tx, [event.subjectCode], event.actorId)
  }
}
