import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationShutdown,
} from '@nestjs/common'
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

/** `changed`: this person's rows moved. `up`: the line is listening from now
 *  on, re-read. `drop`: stop relying on this stream and close it. */
export type StreamSink = { changed(): void; up(): void; drop(): void }

type PgliteLike = {
  listen(channel: string, cb: (payload: string) => void): Promise<() => Promise<void>>
}

/** One LISTEN on `pv_notification`, fanned out to in-process subscribers.
 *
 *  The connection opens on the FIRST subscriber, so the worker process (which
 *  imports this module and has no HTTP) never opens it. A trigger (migration
 *  0103) notifies with the recipient id as payload, so every writer — API,
 *  worker, sweeper — reaches the same bus without knowing it exists.
 *
 *  Postgres road uses a dedicated `pg.Client` on the DIRECT endpoint: a pooled
 *  or pgbouncer-transaction connection hands the session to somebody else and
 *  the LISTEN silently stops delivering. Hence `available`: without that
 *  endpoint there is no push at all, the same rule the queue follows. */
@Injectable()
export class NotificationListener implements BeforeApplicationShutdown, OnApplicationShutdown {
  private readonly log = new Logger('notification')
  private readonly subscribers = new Map<string, Set<StreamSink>>()
  private backoffMs = BACKOFF_FIRST_MS
  private up = false
  private started = false
  private stopped = false
  private client: Client | null = null
  private unlisten: (() => Promise<void>) | null = null
  private retryTimer: NodeJS.Timeout | null = null
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

  /** True while the line is listening: only then may a stream say `ready`. */
  get healthy(): boolean {
    return this.up
  }

  subscribe(actorId: string, sink: StreamSink): () => void {
    const set = this.subscribers.get(actorId) ?? new Set<StreamSink>()
    if (set.size >= MAX_PER_ACTOR) set.values().next().value?.drop()
    set.add(sink)
    this.subscribers.set(actorId, set)
    if (!this.started) {
      this.started = true
      void this.open()
    }
    return () => {
      set.delete(sink)
      if (set.size === 0 && this.subscribers.get(actorId) === set) this.subscribers.delete(actorId)
    }
  }

  /** Before the HTTP server closes: it waits for open responses, and a stream
   *  never ends by itself, so shutdown would hang until the platform kills it. */
  beforeApplicationShutdown(): void {
    this.stopped = true
    this.dropAll()
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    const client = this.client
    this.client = null
    await Promise.allSettled([client?.end(), this.unlisten?.()])
  }

  private emit(actorId: string): void {
    for (const sink of this.subscribers.get(actorId) ?? []) sink.changed()
  }

  private all(): StreamSink[] {
    return [...this.subscribers.values()].flatMap((set) => [...set])
  }

  /** A dropped stream makes its browser fall back to polling and reconnect;
   *  the new stream then waits for `up` instead of claiming to be live. */
  private dropAll(): void {
    for (const sink of this.all()) sink.drop()
  }

  private async open(): Promise<void> {
    try {
      if (this.handle.kind === 'pglite') await this.openPglite()
      else await this.openPostgres()
      if (this.outage) this.log.log('Notification listener reconnected')
      this.outage = false
      this.backoffMs = BACKOFF_FIRST_MS
      this.up = true
      for (const sink of this.all()) sink.up()
    } catch (error) {
      this.lost(error)
    }
  }

  private async openPglite(): Promise<void> {
    const client = (this.handle.db as unknown as { $client?: PgliteLike }).$client
    if (!client) throw new Error('pglite driver without a $client')
    this.unlisten = await client.listen(CHANNEL, (payload) => this.emit(payload))
  }

  private async openPostgres(): Promise<void> {
    const client = new Client({
      connectionString: this.env.PV_QUEUE_DATABASE_URL,
      application_name: 'pv-one-notify',
      connectionTimeoutMillis: 5_000,
      keepAlive: true,
    })
    /* An 'error' with no listener takes the process down; 'end' follows it. */
    const current = (): boolean => this.client === client
    client.on('error', (error) => current() && this.lost(error))
    client.on('end', () => current() && this.lost(new Error('connection ended')))
    client.on('notification', (m) => {
      if (m.channel === CHANNEL && m.payload) this.emit(m.payload)
    })
    this.client = client
    await client.connect()
    await client.query(`LISTEN ${CHANNEL}`)
  }

  /** Called from several events for one failure, so the first call wins: it
   *  drops the client and arms the single retry timer. */
  private lost(error: unknown): void {
    if (this.stopped || this.retryTimer) return
    const dead = this.client
    this.client = null
    void dead?.end().catch(() => undefined)
    this.up = false
    this.dropAll()
    if (!this.outage) {
      this.outage = true
      this.log.error(`Notification listener lost: ${String(error)} - retrying`)
    }
    const wait = this.backoffMs
    this.backoffMs = Math.min(wait * 2, BACKOFF_MAX_MS)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.open()
    }, wait)
  }
}
