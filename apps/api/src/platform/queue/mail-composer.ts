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
 *  The implementations are registered at the wiring step — see `MAIL_COMPOSER`
 *  below and the `composers` parameter of `QueueModule.forWorker()`. Until at
 *  least one exists the worker refuses to boot for want of the token, which is
 *  the loud failure this deserves.
 *
 *  ------------------------------------------------------------------
 *  A REGISTRY, NOT ONE PROVIDER — AND `supports` IS WHY IT STAYS HONEST
 *  ------------------------------------------------------------------
 *  This started as a single provider that threw on any template but its own,
 *  with a note saying the second sender would turn it into a registry keyed by
 *  `delivery.template`. That day arrived with MAS. The lookup lives on the
 *  interface rather than in a `Record<string, MailComposer>` held by the
 *  consumer for one reason: the composer is the only thing that knows which
 *  templates it can actually render, and a map assembled at wiring time is a
 *  second declaration of that fact — one that agrees on the day it is written
 *  and drifts the first time a composer learns a new template.
 *
 *  `supports` must be a pure predicate over the template name. It runs for
 *  every job, before anything is loaded. */
export interface MailComposer {
  /** True when `compose` can render this `delivery.template`. */
  supports(template: string): boolean
  compose(delivery: DeliveryToSend): Promise<MailMessage>
}

/** Resolves to `MailComposer[]` — the whole registry, in registration order.
 *
 *  An ARRAY under one token rather than Angular-style `multi: true` providers,
 *  because Nest has no such thing: `Provider` is `useClass | useValue |
 *  useFactory | useExisting` and nothing merges two providers of one token
 *  across modules. `QueueModule.forWorker({ composers: [...] })` builds the
 *  array in a factory instead — see that file. First match wins, so order is
 *  meaningful and is the wiring file's to decide. */
export const MAIL_COMPOSER = Symbol('pv.mail.composer')
