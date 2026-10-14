import { randomUUID } from 'node:crypto'
import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { Client } from 'pg'
import { ENV, type Env } from '../config/env'
import { DB_HANDLE } from '../db/db.module'
import type { DbHandle } from '../db/create-db'

const CHANNEL = 'pv_notification'
const BACKOFF_FIRST_MS = 1_000
const BACKOFF_MAX_MS = 30_000
/** Streams one person may hold; past it the oldest is dropped. A browser tab
 *  holds one, so this only stops one account from filling the proxy's limit. */
const MAX_PER_ACTOR = 8
/** Covers EventSource's own reconnect after the 15-minute close or a drop, and
 *  a quick tab switch; the same 30s `create-db.ts` gives an idle pool client
 *  before letting it go so Neon can suspend. */
const IDLE_CLOSE_MS = 30_000
/** Payloads are recipient ids; a colon never appears in one. Other API
 *  machines' probes arrive here too, so the prefix alone decides "not a person". */
const PROBE_PREFIX = 'probe:'
/** One budget for the LISTEN client's connect and for a sent probe's way
 *  back: on a live line both take milliseconds. */
const ROUND_TRIP_MS = 5_000

/** `changed`: this person's rows moved. `up`: the line is listening from now
 *  on, re-read. `drop`: stop relying on this stream and close it. */
export type StreamSink = { changed(): void; up(): void; drop(): void }

type PgliteLike = {
  listen(channel: string, cb: (payload: string) => void): Promise<() => Promise<void>>
}

/** One LISTEN on `pv_notification`, fanned out to in-process subscribers.
 *
 *  The line opens on the first subscriber and closes `IDLE_CLOSE_MS` after the
 *  last one leaves, so the worker never opens it and an API with no open bell
 *  holds no connection. A trigger (migration 0103) notifies with the recipient
 *  id, so every writer reaches the same bus without knowing it exists. Each
 *  open proves the trigger exists and a NOTIFY from the pool arrives before it
 *  says `up`; a failed proof keeps the browsers polling while the line retries.
 *
 *  Postgres road uses a dedicated `pg.Client` on the DIRECT endpoint: a pooled
 *  or pgbouncer-transaction connection hands the session to somebody else and
 *  the LISTEN silently stops delivering. Hence `available`. */
@Injectable()
export class NotificationListener implements BeforeApplicationShutdown, OnApplicationShutdown {
  private readonly log = new Logger('notification')
  private readonly subscribers = new Map<string, Set<StreamSink>>()
  private backoffMs = BACKOFF_FIRST_MS
  private up = false
  private started = false
  private stopped = false
  /** Bumped on every teardown, so an `open` still awaiting knows its line is gone. */
  private gen = 0
  private client: Client | null = null
  private unlisten: (() => Promise<void>) | null = null
  private retryTimer: NodeJS.Timeout | null = null
  private idleTimer: NodeJS.Timeout | null = null
  private probe: { nonce: string; arrived: () => void } | null = null
  private outage = false

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB_HANDLE) private readonly handle: DbHandle,
  ) {}

  get size(): number {
    let n = 0
    for (const set of this.subscribers.values()) n += set.size
    return n
  }

  /** False where a LISTEN would be held and never hear anything. */
  get available(): boolean {
    return this.handle.kind === 'pglite' || this.env.PV_QUEUE_DATABASE_URL.length > 0
  }

  /** True once a probe went round the line: only then may a stream say `ready`. */
  get healthy(): boolean {
    return this.up
  }

  subscribe(actorId: string, sink: StreamSink): () => void {
    const set = this.subscribers.get(actorId) ?? new Set<StreamSink>()
    if (set.size >= MAX_PER_ACTOR) set.values().next().value?.drop()
    set.add(sink)
    this.subscribers.set(actorId, set)
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    if (!this.started) {
      this.started = true
      void this.open()
    }
    return () => {
      set.delete(sink)
      if (set.size === 0 && this.subscribers.get(actorId) === set) this.subscribers.delete(actorId)
      if (this.size === 0) this.armIdle()
    }
  }

  /** Before the HTTP server closes: it waits for open responses, and a stream
   *  never ends by itself, so shutdown would hang until the platform kills it. */
  beforeApplicationShutdown(): void {
    this.stopped = true
    this.dropAll()
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close()
  }

  private emit(actorId: string): void {
    for (const sink of this.subscribers.get(actorId) ?? []) sink.changed()
  }

  private dispatch(payload: string): void {
    if (!payload.startsWith(PROBE_PREFIX)) return this.emit(payload)
    if (payload === this.probe?.nonce) this.probe.arrived()
  }

  private all(): StreamSink[] {
    return [...this.subscribers.values()].flatMap((set) => [...set])
  }

  /** A dropped stream makes its browser fall back to polling and reconnect;
   *  the new stream then waits for `up` instead of claiming to be live. */
  private dropAll(): void {
    for (const sink of this.all()) sink.drop()
  }

  /** The retry loop keeps running through the grace on purpose: `lost` drops
   *  every stream, and their reconnects land inside it. */
  private armIdle(): void {
    if (this.stopped || this.idleTimer || !this.started) return
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      if (this.size === 0) void this.close()
    }, IDLE_CLOSE_MS)
    this.idleTimer.unref()
  }

  /** Back to "not started"; the next subscriber opens a fresh line. */
  private async close(): Promise<void> {
    this.gen += 1
    this.started = false
    this.up = false
    this.outage = false
    this.backoffMs = BACKOFF_FIRST_MS
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.retryTimer = null
    this.idleTimer = null
    await this.release()
  }

  /** Nulls the fields BEFORE ending, so the dying client's 'end' is not `current`.
   *  PGlite only unlistens: its client is the app's one database connection. */
  private async release(): Promise<void> {
    const client = this.client
    const unlisten = this.unlisten
    this.client = null
    this.unlisten = null
    await Promise.allSettled([client?.end(), unlisten?.()])
  }

  private async open(): Promise<void> {
    if (this.stopped) return
    const gen = this.gen
    try {
      if (this.handle.kind === 'pglite') {
        const unlisten = await this.listenPglite()
        if (gen !== this.gen) return void unlisten().catch(() => undefined)
        this.unlisten = unlisten
      } else await this.openPostgres()
      if (gen !== this.gen) return
      const failure = await this.verify()
      if (gen !== this.gen) return
      if (failure) return this.lost(failure, false)
      if (this.outage) this.log.log('Notification listener reconnected')
      this.outage = false
      this.backoffMs = BACKOFF_FIRST_MS
      this.up = true
      for (const sink of this.all()) sink.up()
    } catch (error) {
      if (gen === this.gen) this.lost(error)
    }
  }

  private async listenPglite(): Promise<() => Promise<void>> {
    const client = (this.handle.db as unknown as { $client?: PgliteLike }).$client
    if (!client) throw new Error('pglite driver without a $client')
    return client.listen(CHANNEL, (payload) => this.dispatch(payload))
  }

  private async openPostgres(): Promise<void> {
    const client = new Client({
      connectionString: this.env.PV_QUEUE_DATABASE_URL,
      application_name: 'pv-one-notify',
      connectionTimeoutMillis: ROUND_TRIP_MS,
      keepAlive: true,
    })
    /* An 'error' with no listener takes the process down; 'end' follows it. */
    const current = (): boolean => this.client === client
    client.on('error', (error) => current() && this.lost(error))
    client.on('end', () => current() && this.lost(new Error('connection ended')))
    client.on('notification', (m) => {
      if (m.channel === CHANNEL && m.payload) this.dispatch(m.payload)
    })
    this.client = client
    await client.connect()
    await client.query(`LISTEN ${CHANNEL}`)
  }

  /** Returns why push cannot be trusted, or null. Both checks go through the
   *  app's pool, the road real writers take: a self-NOTIFY on the LISTEN client
   *  could pass on a pooler, or on a database nobody writes to. */
  private async verify(): Promise<string | null> {
    const found = (await this.handle.db.execute(sql`
      SELECT count(*)::int AS n FROM pg_trigger
      WHERE tgrelid = to_regclass('platform.notification')
        AND tgname IN ('notification_push_insert', 'notification_push_read')
        AND tgenabled <> 'D'
    `)) as { rows: { n: number }[] }
    if (found.rows[0]?.n !== 2) return 'triggers from migration 0103 are missing or disabled'

    const nonce = `${PROBE_PREFIX}${randomUUID()}`
    let settle: (ok: boolean) => void = () => undefined
    const arrived = new Promise<boolean>((resolve) => {
      settle = resolve
    })
    this.probe = { nonce, arrived: () => settle(true) }
    let timer: NodeJS.Timeout | undefined
    try {
      await this.handle.db.execute(sql`SELECT pg_notify(${CHANNEL}, ${nonce})`)
      /* The clock starts once the pool has answered: a slow checkout is not a lost NOTIFY. */
      timer = setTimeout(() => settle(false), ROUND_TRIP_MS)
      timer.unref()
      if (await arrived) return null
      return `probe NOTIFY did not arrive within ${ROUND_TRIP_MS}ms - is PV_QUEUE_DATABASE_URL a pooler?`
    } finally {
      clearTimeout(timer)
      if (this.probe?.nonce === nonce) this.probe = null
    }
  }

  /** Called from several events for one failure, so the first call wins: it
   *  drops the client and arms the single retry timer. A line that failed its
   *  proof (`proven` false) never said `ready`, so its streams are left alone. */
  private lost(error: unknown, proven = true): void {
    if (this.stopped || this.retryTimer || !this.started) return
    this.gen += 1
    void this.release()
    this.up = false
    if (proven) this.dropAll()
    if (!this.outage) {
      this.outage = true
      if (proven) this.log.error(`Notification listener lost: ${String(error)} - retrying`)
      else
        this.log.warn(`Notification push off, browsers keep polling: ${String(error)} - retrying`)
    }
    const wait = this.backoffMs
    this.backoffMs = Math.min(wait * 2, BACKOFF_MAX_MS)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.open()
    }, wait)
  }
}
