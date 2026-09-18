import type { ObjectKind } from '@pv/engines'
import type { Db } from '@api/platform/db/db.module'

/** THE SEAM BETWEEN A LOGGED TURN AND THE BRANCH THAT OWNS ITS SUBJECT.
 *
 *  Logging a call is the PIC's most common first action on a lead, and that
 *  moves the lead's stored state (ADR 0058) — a `sales.lead` write that
 *  `platform/` may not import. So the dependency runs backward exactly as
 *  `MAIL_COMPOSER` does (ADR 0049): comms asks through this token, the Sales
 *  branch answers, and `app.module.ts` is the one file that names both.
 *
 *  Called inside the message's own transaction so the state move commits or
 *  rolls back with the turn. Only the manual log door fires it: a captured
 *  inbound message is the customer acting, not the PIC. */
export interface MessageLoggedHook {
  afterLogged(tx: Db, event: MessageLogged): Promise<void>
}

export type MessageLogged = { subjectKind: ObjectKind; subjectCode: string; actorId: string }

/** Optional: with no branch bound, comms still logs turns and nothing moves. */
export const MESSAGE_LOGGED_HOOK = Symbol('pv.comms.message-logged')
