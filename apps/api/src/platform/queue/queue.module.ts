import {
  Inject,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type OnApplicationShutdown,
} from '@nestjs/common'
import type { PgBoss } from 'pg-boss'
import { ENV, type Env } from '../config/env'
import { DB_HANDLE } from '../db/db.module'
import type { DbHandle } from '../db/create-db'
import { BOSS, createBoss, type QueueRole } from './boss.provider'
import { MailConsumer } from './mail.consumer'
import { MailQueue } from './mail-queue'
import { MailRateGate } from './mail-rate'
import { MailRelay } from './mail-relay'

export { BOSS } from './boss.provider'
export { MailQueue } from './mail-queue'
export { MailConsumer } from './mail.consumer'
export { MailRateGate } from './mail-rate'
export { MailRelay } from './mail-relay'
export { MAIL_COMPOSER, type MailComposer } from './mail-composer'

type Wiring = { imports?: ModuleMetadata['imports'] }

/** THE QUEUE, IN TWO SHAPES THAT ARE NOT THE SAME MODULE.
 *
 *  ------------------------------------------------------------------
 *  THE HTTP PROCESS CANNOT CONSUME, AND NOT BECAUSE ANYONE REMEMBERED
 *  ------------------------------------------------------------------
 *  `main.ts` must enqueue and must never `boss.work` — a consumer inside the
 *  web process puts a five-thousand-row import and a batch of provider calls
 *  on the same event loop as everybody's requests, which is the entire reason
 *  `worker.ts` exists.
 *
 *  "Remember not to call `work()`" is not a mechanism. So `forSender()` simply
 *  does not provide `MailConsumer`: nothing in that container knows how to
 *  consume, and `worker.ts` is the only file in the repository that calls
 *  `boss.work`. Getting it wrong is a resolution error at boot, not a surprise
 *  under load. As it stands the HTTP process imports neither shape — see
 *  `forSender()` below and `MailRelay`.
 *
 *  The two shapes differ elsewhere too, all of it in `boss.provider.ts`: only
 *  the worker supervises, only the worker listens, and only the worker asks
 *  for more than a couple of connections.
 *
 *  ------------------------------------------------------------------
 *  WHY `imports` IS A PARAMETER
 *  ------------------------------------------------------------------
 *  `MailConsumer` resolves `MAIL_LEDGER`, `MAIL_PORT` and `MAIL_COMPOSER` —
 *  tokens declared in `platform/mail/mail.contract.ts` and provided by the
 *  mail module, which this module deliberately does not import by name. The
 *  queue depends on the CONTRACT, not on whoever satisfies it: that is what
 *  lets the console driver stand in for Resend in development, and it keeps
 *  this file from having to change when the mail module is reorganised.
 *
 *      QueueModule.forWorker({ imports: [MailModule] })
 *
 *  is the whole handover. */
@Module({})
export class QueueModule implements OnApplicationShutdown {
  constructor(@Inject(BOSS) private readonly boss: PgBoss) {}

  /** Enqueue-only shape — and NOBODY IMPORTS IT TODAY.
   *
   *  The HTTP process does not touch pg-boss at all: a branch writes a ledger
   *  row inside its own transaction and `MailRelay` in the worker turns due
   *  rows into jobs. That keeps every queue connection, and every install
   *  check, on the one machine that consumes — on Neon a connection that never
   *  idles is a compute that never sleeps.
   *
   *  Kept, not deleted, because the day something needs a job the instant a
   *  request commits — rather than within `PV_QUEUE_POLL_SECONDS` — this is
   *  the shape to import, and the reasoning above is the trade it costs. */
  static forSender(wiring: Wiring = {}): DynamicModule {
    return build('sender', wiring, [])
  }

  /** For `worker.ts`. Everything the sender has, plus the consumer. */
  static forWorker(wiring: Wiring = {}): DynamicModule {
    return build('worker', wiring, [MailConsumer, MailRelay])
  }

  /** Leaves no connection behind on the way out — the same reason
   *  `DbModule` closes its pool.
   *
   *  `worker.ts` has already stopped the queue by hand before closing the
   *  context, because a graceful drain has to finish BEFORE the database
   *  handle goes away and Nest does not order sibling modules' hooks. This is
   *  therefore usually a no-op: `PgBoss.stop()` returns the in-flight promise
   *  if one exists and returns immediately once stopped. It earns its place in
   *  the HTTP process, which has no drain to sequence and never calls it. */
  async onApplicationShutdown(): Promise<void> {
    await this.boss.stop({ graceful: true, close: true })
  }
}

function build(
  role: QueueRole,
  wiring: Wiring,
  consumers: NonNullable<ModuleMetadata['providers']>,
): DynamicModule {
  return {
    module: QueueModule,
    imports: wiring.imports ?? [],
    providers: [
      {
        provide: BOSS,
        /* ENV and DB_HANDLE come from the two @Global modules; `DbHandle` is
           needed rather than `DB` because the PGlite path has to reach the
           driver underneath — see `boss.provider.ts`. */
        useFactory: (env: Env, handle: DbHandle) => createBoss(role, env, handle),
        inject: [ENV, DB_HANDLE],
      },
      MailRateGate,
      MailQueue,
      ...consumers,
    ],
    /* `BOSS` is exported so `worker.ts` can start and stop it by hand. The
       rate gate is exported because `/healthz/email` has a fair claim on
       "is the gate parked, and until when". */
    exports: [BOSS, MailQueue, MailRateGate, ...consumers],
  }
}
