import type { Branch, Permission } from '@pv/engines'
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
  afterSent(tx: Db, sent: MailAccepted): Promise<void>
  /** A letter that will never arrive, or one that arrived without its state
   *  move. The branch writes its trail on the caller's `tx` and names the
   *  subject's people for the bell; `null` = not this branch's letter. */
  afterTrouble(tx: Db, sent: MailSent, trouble: MailTrouble): Promise<MailSubjectPeople | null>
  /** A counterparty answered this letter. Called once per NEW reply, on the
   *  transaction that records it; `null` = not this branch's letter. */
  afterReply(tx: Db, sent: MailSent): Promise<MailSubjectPeople | null>
  /** Read-only: who this letter is about, and nothing written. For a bounce
   *  reported after the provider took the letter, a road that leaves no trail
   *  row; `null` = not this branch's letter. */
  peopleOf(tx: Db, sent: MailSent): Promise<MailSubjectPeople | null>
}

/** What the branch needs to tell a customer letter from an internal one. */
export type MailSent = Pick<DeliveryToSend, 'aggregateType' | 'aggregateId' | 'mailRunId' | 'role'>

/** `afterSent` gets the whole accepted delivery: a hook that files the letter
 *  somewhere needs its sender, subject and addresses, not just whose it is. */
export type MailAccepted = MailSent &
  Pick<DeliveryToSend, 'id' | 'addresses' | 'sender' | 'run' | 'runKind' | 'merge'>

export type MailTrouble =
  /** `unknown`: given up past the resend window, so it may have arrived. */
  { kind: 'failed'; address: string; unknown: boolean } | { kind: 'sync-failed' }

/** Whose subject a letter was about, as only the branch knows it (ADR 0085).
 *  `watchers` names a role audience without resolving it: which permission
 *  watches an unheld subject is branch knowledge, reading the matrix is not. */
export type MailSubjectPeople = {
  subject: { kind: 'lead' | 'opportunity'; code: string; label: string }
  holders: string[]
  watchers?: { permission: Permission; branch: Branch }
}

/** Resolves to `MailSentHook[]` — a registry, because more than one branch
 *  owns subjects (lead, opportunity) and Nest cannot merge two bindings of one
 *  token. `QueueModule.forWorker({ sentHooks: [...] })` assembles it, so a hook
 *  whose module is missing fails at boot instead of moving nothing. */
export const MAIL_SENT_HOOK = Symbol('pv.mail.sent')
