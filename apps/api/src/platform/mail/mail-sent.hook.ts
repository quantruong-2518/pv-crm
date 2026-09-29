import type { Db } from '@api/platform/db/db.module'
import type { DeliveryToSend } from './mail.contract'

/** THE SEAM BETWEEN A LETTER THE PROVIDER TOOK AND THE BRANCH THAT OWNS ITS
 *  SUBJECT. A mail that really went out is a touch on a lead (ADR 0068 §1),
 *  which is a `sales.lead` write `platform/` may not import — so the worker
 *  asks through this token, the branch answers (same shape as
 *  `MESSAGE_LOGGED_HOOK`, ADR 0049).
 *
 *  Called inside the accept's own transaction, under a savepoint: the fact is
 *  known only there, and a branch that fails must not un-accept a sent mail. */
export interface MailSentHook {
  afterSent(tx: Db, sent: MailSent): Promise<void>
  /** A letter that will never arrive, or one that arrived without its state
   *  move — told to the subject's people in the branch's own transaction. */
  afterTrouble(sent: MailSent, trouble: MailTrouble): Promise<void>
}

/** What the branch needs to tell a customer letter from an internal one. */
export type MailSent = Pick<DeliveryToSend, 'aggregateType' | 'aggregateId' | 'mailRunId' | 'role'>

export type MailTrouble =
  /** `unknown`: given up past the resend window, so it may have arrived. */
  { kind: 'failed'; address: string; unknown: boolean } | { kind: 'sync-failed' }

/** Bound by the module that owns the subject; the worker's `QueueModule`
 *  imports it, so a worker without it fails at boot instead of moving nothing. */
export const MAIL_SENT_HOOK = Symbol('pv.mail.sent')
