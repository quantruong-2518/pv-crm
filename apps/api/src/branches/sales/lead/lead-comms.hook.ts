import { Injectable } from '@nestjs/common'
import type { Db } from '@api/platform/db/db.module'
import type { MessageLogged, MessageLoggedHook } from '@api/platform/comms/message-logged.hook'
import { LeadStateWriter } from './lead-state'

/** A call or message logged by hand on a lead counts as the PIC's first action
 *  (ADR 0058). Lives here because it writes `sales.lead`; comms reaches it only
 *  through `MESSAGE_LOGGED_HOOK`, bound in `app.module.ts` (ADR 0049 shape). */
@Injectable()
export class LeadCommsHook implements MessageLoggedHook {
  constructor(private readonly state: LeadStateWriter) {}

  afterLogged(tx: Db, event: MessageLogged): Promise<void> {
    return this.state.firstAction(tx, [event.subjectCode], event.actorId)
  }
}
