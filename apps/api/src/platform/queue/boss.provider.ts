import { Logger } from '@nestjs/common'
import { PgBoss, fromPglite } from 'pg-boss'
import type { ConstructorOptions, PGliteLike, Queue } from 'pg-boss'
import type { Env } from '../config/env'
import type { DbHandle } from '../db/create-db'
import { EMAIL_QUEUE, EMAIL_QUEUE_DEAD } from '../mail/mail.contract'

/** THE ONE pg-boss INSTANCE, AND THE TWO SHAPES IT COMES IN.
 *
 *  Registered as a bare value under a symbol, the same way `EnginesModule`
 *  registers `ACCESS`: pg-boss is already a well-formed object with its own
 *  lifecycle, and an `@Injectable()` wrapper around it would be a fork waiting
 *  to happen. */
export const BOSS = Symbol('pv.queue.boss')

/** Which process this instance belongs to.
 *
 *  `sender` is the HTTP process: it enqueues and nothing else. `worker` is the
 *  second entrypoint: it consumes, and it is the only one that runs
 *  maintenance and holds a LISTEN connection.
 *
 *  The split is not a comment for people to remember — `QueueModule.forSender()`
 *  simply never provides `MailConsumer`, so the HTTP process has no object that
 *  could call `boss.work` even if someone tried. */
export type QueueRole = 'sender' | 'worker'

const DAY_SECONDS = 24 * 60 * 60

export async function createBoss(role: QueueRole, env: Env, handle: DbHandle): Promise<PgBoss> {
  const log = new Logger('queue')
  const worker = role === 'worker'

  /* ------------------------------------------------------------------
     WHICH CONNECTION THE QUEUE TAKES — NOT THE APP'S POOLED ONE
     ------------------------------------------------------------------
     `PV_QUEUE_DATABASE_URL` exists so the queue can take Neon's DIRECT
     endpoint while the app keeps the pooled one. Through pgbouncer in
     transaction pooling mode a LISTEN never sees its NOTIFY — the connection
     that issued LISTEN is handed to somebody else between statements — and
     anything else that is session state (advisory locks, `SET`, prepared
     statements) is just as untrustworthy. pg-boss uses all of it.

     Empty falls back to `DATABASE_URL`: polling alone is correct, only
     slower, so a deployment that has not split its endpoints still works. */
  const url = env.PV_QUEUE_DATABASE_URL || env.DATABASE_URL
  const direct = env.PV_QUEUE_DATABASE_URL.length > 0

  const options: ConstructorOptions = {
    /* Shows up in `pg_stat_activity`. When Neon reports a connection that
       will not go away, the first thing anyone wants is its name. */
    application_name: `pv-one-queue-${role}`,

    /* Both roles migrate. pg-boss takes an advisory lock around its own
       install/migration, so two processes racing at deploy time is safe —
       and an HTTP machine that boots first must still find its queues. */
    migrate: true,
    createSchema: true,

    /* Maintenance is the worker's job alone. Archiving, expiry and monitoring
       are one-writer work; running them on every HTTP machine multiplies the
       queries without changing the outcome. */
    supervise: worker,
    /* No cron jobs on this queue. The clock monitor is pure cost until there
       are. */
    schedule: false,
  }

  if (handle.kind === 'pglite') {
    /* PGlite serves ONE connection at a time, so pg-boss cannot open its own —
       it has to ride the connection the app already built. `fromPglite` is the
       adapter that fits: it routes parameterised statements through `query()`
       and pg-boss's concatenated DDL through `exec()`, which is the same
       simple-vs-extended protocol split the pooled driver gets for free.
       `fromDrizzle` looks closer to hand but only offers the parameterised
       half, so the install script fails on the first multi-statement block.

       The raw client is reached through drizzle's `$client`. `Db` is
       deliberately typed as the driver-agnostic `PgDatabase`, so this is the
       one cast — and it is guarded by `handle.kind`, which is the driver
       `create-db.ts` actually chose. */
    const client = (handle.db as unknown as { $client?: PGliteLike }).$client
    if (!client) throw new Error('pglite driver without a $client — cannot start the queue')

    options.db = fromPglite(client)
    /* Not a distributed backend: plain PostgreSQL semantics, plus in-process
       LISTEN/NOTIFY. Saying so turns off compatibility gates pg-boss would
       otherwise have to guess at. */
    options.backend = 'pglite'

    if (direct) {
      log.warn(
        'PV_QUEUE_DATABASE_URL bị bỏ qua trên đường PGlite — hàng đợi dùng chung kết nối của app.',
      )
    }
  } else {
    options.connectionString = url
    /* One connection per worker slot plus headroom for maintenance and the
       listener. The sender only ever inserts, so it needs almost nothing —
       and on Neon every idle connection is a compute that will not sleep. */
    options.max = worker ? env.PV_EMAIL_WORKER_CONCURRENCY + 3 : 2
  }

  /* Wake on NOTIFY instead of waiting out the poll — but only in the worker,
     which is the only process that fetches, and only where a session-pinned
     connection is actually believable: in-process PGlite, or the direct
     endpoint `PV_QUEUE_DATABASE_URL` was introduced for. Everywhere else this
     would hold a dedicated connection that silently never delivers.

     Polling stays on underneath in every case; NOTIFY only removes latency,
     it is never the reason a job runs. */
  options.useListenNotify = worker && (handle.kind === 'pglite' || direct)

  const boss = new PgBoss(options)

  /* An EventEmitter with no 'error' listener throws on the process. pg-boss
     emits here for background failures that belong to nobody's await — a
     maintenance query, the listener dropping — so without these two lines a
     blip in archiving takes the whole worker down.

     Reached through `NodeJS.EventEmitter` rather than `boss.on` because
     `PgBoss extends EventEmitter<PgBossEventMap>` and the typed `EventEmitter`
     is a DEFAULT export of `node:events`, which needs `esModuleInterop` —
     `tsconfig.base.json` leaves it off for the whole repo. `skipLibCheck` then
     swallows the resolution failure inside pg-boss's own `.d.ts` and the base
     class arrives here with no members. Nothing is wrong with either package;
     this is the seam between two module systems, and one cast is a smaller
     price than flipping an interop flag under three other packages. */
  const events = boss as unknown as NodeJS.EventEmitter
  events.on('error', (error: Error) => log.error(`pg-boss: ${error.message}`, error.stack))
  events.on('warning', (warning: { message: string }) => log.warn(`pg-boss: ${warning.message}`))

  await boss.start()
  await ensureQueues(boss, env, options.useListenNotify === true)
  log.log(
    `pg-boss lên · vai ${role} · driver ${handle.kind}${options.useListenNotify ? ' · notify' : ''}`,
  )

  return boss
}

/** Both queues, declared by whoever starts first.
 *
 *  `createQueue` is `ON CONFLICT DO NOTHING` under an advisory lock, so it is
 *  safe to call from every process on every boot — but for the same reason it
 *  will NOT move an existing queue onto new settings. `updateQueue` after it is
 *  what makes a changed retry policy take effect on the next deploy instead of
 *  on the next database reset.
 *
 *  `policy` is added only on the way into `createQueue`, and `QueueSettings`
 *  below has no room for it, because `updateQueue` REJECTS a `policy` key
 *  outright — a queue's policy cannot change after creation, and pg-boss says
 *  so by throwing. Types do not catch it: `Omit<Queue, 'name'>` is assignable
 *  to `UpdateQueueOptions`, since an extra property only fails the freshness
 *  check on an inline literal. A crash on every boot, found by reading
 *  pg-boss's source rather than its types — worth remembering the next time a
 *  queue option looks safe because it compiled. */
type QueueSettings = Omit<Queue, 'name' | 'policy' | 'partition'>
async function ensureQueues(boss: PgBoss, env: Env, notify: boolean): Promise<void> {
  const policy: Pick<Queue, 'policy'> = { policy: 'standard' }

  /* The dead letter queue FIRST. `createQueue` resolves the `deadLetter` name
     while creating the queue that points at it and throws if it is missing. */
  const dead: QueueSettings = {
    /* A parking lot never retries — a human decides. */
    retryLimit: 0,
    /* Kept far longer than the live queue. These are the mails somebody has to
       look at, and 14 days is short for "somebody was on leave". */
    retentionSeconds: 30 * DAY_SECONDS,
  }
  await boss.createQueue(EMAIL_QUEUE_DEAD, { ...policy, ...dead })
  await boss.updateQueue(EMAIL_QUEUE_DEAD, dead)

  const live: QueueSettings = {
    retryLimit: env.PV_EMAIL_RETRY_LIMIT,
    retryDelay: env.PV_EMAIL_RETRY_DELAY_SECONDS,
    retryBackoff: true,
    retryDelayMax: env.PV_EMAIL_RETRY_DELAY_MAX_SECONDS,
    /* A job that has been active this long is not running any more — the
       worker holding it died. Short, because the ledger row is parked in
       `sending` for exactly this long before the redelivery can move it, and
       every second of that is a mail nobody is sending. Deliberately far above
       the handler's own worst case (one claim, one provider call, at most one
       rate-window wait). */
    expireInSeconds: 60,
    retentionSeconds: 14 * DAY_SECONDS,

    /* The consumer routes to the dead queue itself, on the same pass that
       writes `dead` to the ledger — see `mail.consumer.ts`. This setting is
       the floor under that: if the worker is killed hard enough that the
       handler never returns, pg-boss still parks the job here instead of
       dropping it. */
    deadLetter: EMAIL_QUEUE_DEAD,

    /* Only meaningful while some worker is listening; harmless otherwise. */
    notify,
  }
  await boss.createQueue(EMAIL_QUEUE, { ...policy, ...live })
  await boss.updateQueue(EMAIL_QUEUE, live)
}
