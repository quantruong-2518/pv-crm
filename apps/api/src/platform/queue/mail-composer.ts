import type { DeliveryToSend, MailMessage } from '../mail/mail.contract'

/** THE SEAM BETWEEN THE WORKER AND THE TEMPLATES.
 *
 *  Bodies are built by `@pv/mail-templates`, which is React Email — and
 *  `apps/api` is forbidden to know React at all (`eslint.config.js` block 3b;
 *  `tsconfig.api.json` explains why the exception is granted to the templates
 *  package and to nothing else). So the worker does not import it. It asks for
 *  a `MailMessage` and is told one.
 *
 *  That is not only a lint dodge. `delivery.template` and
 *  `delivery.templateVersion` name a body that may be re-rendered, corrected
 *  or A/B'd without the queue noticing, and the queue's correctness — claim,
 *  suppress, pace, idempotency key — has nothing to do with what the mail
 *  says.
 *
 *  The implementation is registered at the wiring step: a provider under
 *  `MAIL_COMPOSER` that calls into `@pv/mail-templates` and fills `from` /
 *  `replyTo` from `PV_EMAIL_FROM` / `PV_EMAIL_REPLY_TO`. Until then
 *  `QueueModule.forWorker()` will refuse to boot for want of the token, which
 *  is the loud failure this deserves. */
export interface MailComposer {
  compose(delivery: DeliveryToSend): Promise<MailMessage>
}

export const MAIL_COMPOSER = Symbol('pv.mail.composer')
