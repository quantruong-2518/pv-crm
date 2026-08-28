import { Module } from '@nestjs/common'
import { ENV, type Env } from '@api/platform/config/env'
import { ConsoleMailDriver } from './console.driver'
import { MAIL_ENQUEUE, MAIL_LEDGER, MAIL_PORT, type MailPort } from './mail.contract'
import { MailHealthController, MailWebhookController } from './mail-webhook.controller'
import { MailRepository } from './mail.repository'
import { MailRunRepository } from './mail-run.repository'
import { MailRunSweeper } from './mail-run.sweeper'
import { MasMailComposer } from './mas.composer'
import { ResendMailDriver } from './resend.driver'
import { UnsubscribeController } from './unsubscribe.controller'

/** THE MAIL LEDGER AND THE ONE DOOR OUT.
 *
 *  What this module hands out is deliberately narrow, and the split matters:
 *
 *   · `MAIL_ENQUEUE` — "a mail is owed". A branch gets this one, and only
 *     inside its own transaction. It cannot send.
 *   · `MAIL_LEDGER`  — the full ledger. The worker and the webhook door.
 *   · `MAIL_PORT`    — the provider. Nothing outside the worker should ask.
 *
 *  Three tokens rather than one exported class is what keeps "the Sales branch
 *  may promise a mail" from quietly becoming "the Sales branch may send mail
 *  from inside a web request".
 *
 *  ------------------------------------------------------------------
 *  WHY THE DRIVER IS BUILT IN A FACTORY AND NOT DECLARED AS A PROVIDER
 *  ------------------------------------------------------------------
 *  `new Resend(key)` THROWS when the key is empty, and an empty key is the
 *  normal state of every development machine (`PV_EMAIL_ENABLED=false` by
 *  default). Declaring `ResendMailDriver` as a provider would have Nest
 *  construct it regardless of the flag, so a machine that was never meant to
 *  send would fail to boot at all. The factory constructs exactly one driver,
 *  the one the flag asked for.
 *
 *  The console driver is not a stub: it walks the same ledger, the same queue,
 *  the same claim/suppress/pace path, and stops only at the last inch. That is
 *  what makes it possible to rehearse the whole feature without a key.
 *
 *  ------------------------------------------------------------------
 *  THREE CLASSES ARE EXPORTED BY NAME, AND EACH IS AN EXCEPTION WITH A REASON
 *  ------------------------------------------------------------------
 *  `MailRunRepository` — a batch is a platform row (`platform.mail_run`) and
 *  the Sales service that opens one has to write it inside the SAME
 *  transaction as its `email_delivery` rows. There is no token narrow enough
 *  to wrap that: `create(tx, …)` IS the narrow shape, and hiding it behind a
 *  symbol would only rename it. What a branch still cannot do is send.
 *
 *  `MasMailComposer` — one entry of the `MAIL_COMPOSER` registry, exported as
 *  a class because the registry array is assembled by
 *  `QueueModule.forWorker({ composers: [...] })`; Nest cannot merge two
 *  providers of one token across two modules, and this composer's sibling lives
 *  in the Sales branch. See `mail-composer.ts`.
 *
 *  `MailRunSweeper` — the batch-level half of the worker's loop, resolved by
 *  name in `worker.ts` exactly as `MailRelay` is. A token would buy nothing
 *  here: there is one implementation, one caller, and no branch is ever meant
 *  to hold it — cancelling a run because its bounce rate is over the ceiling is
 *  a decision about the SENDING ACCOUNT, not about anybody's leads. */
@Module({
  controllers: [MailWebhookController, MailHealthController, UnsubscribeController],
  providers: [
    MailRepository,
    MailRunRepository,
    MailRunSweeper,
    MasMailComposer,
    { provide: MAIL_LEDGER, useExisting: MailRepository },
    { provide: MAIL_ENQUEUE, useExisting: MailRepository },
    {
      provide: MAIL_PORT,
      inject: [ENV],
      useFactory: (env: Env): MailPort =>
        env.PV_EMAIL_ENABLED ? new ResendMailDriver(env) : new ConsoleMailDriver(),
    },
  ],
  exports: [
    MAIL_LEDGER,
    MAIL_ENQUEUE,
    MAIL_PORT,
    MailRunRepository,
    MailRunSweeper,
    MasMailComposer,
  ],
})
export class MailModule {}
