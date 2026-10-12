import type { OutgoingHttpHeaders } from 'node:http'
import type { FastifyReply } from 'fastify'
import type { NotificationStreamEvent } from '@pv/contracts'
import type { NotificationListener } from './notification.listener'

const HEARTBEAT_MS = 25_000
const MAX_AGE_MS = 15 * 60_000
const COALESCE_MS = 250

/** Writes one SSE response for `actorId` until the client leaves or MAX_AGE_MS
 *  passes. Returns once the stream is hijacked; teardown runs on 'close'.
 *
 *  Raw writes skip Fastify's header hooks, so the headers already queued on the
 *  reply (CORS, `Vary`) are copied into `writeHead` by hand - without that the
 *  cross-origin EventSource is refused. The forced close at MAX_AGE_MS makes
 *  the browser reconnect, which re-runs the session check. */
export function openStream(reply: FastifyReply, listener: NotificationListener, actorId: string) {
  reply.hijack()
  const raw = reply.raw
  raw.writeHead(200, {
    ...(reply.getHeaders() as OutgoingHttpHeaders),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  })

  const send = (event: NotificationStreamEvent): void => {
    if (!raw.writableEnded) raw.write(`event: ${event}\ndata: {}\n\n`)
  }

  let burst: NodeJS.Timeout | null = null
  let heartbeat: NodeJS.Timeout | null = null
  /* Timers go BEFORE `end()`: a write after end raises 'error' on the response,
     and with nobody listening that takes the process down. */
  const finish = (): void => {
    if (heartbeat) clearInterval(heartbeat)
    if (burst) clearTimeout(burst)
    clearTimeout(expiry)
    unsubscribe()
    if (!raw.writableEnded) raw.end()
  }
  const unsubscribe = listener.subscribe(actorId, {
    changed: () => {
      burst ??= setTimeout(() => {
        burst = null
        send('changed')
      }, COALESCE_MS)
    },
    up: () => send('ready'),
    drop: finish,
  })
  heartbeat = setInterval(() => !raw.writableEnded && raw.write(': ping\n\n'), HEARTBEAT_MS)
  const expiry = setTimeout(finish, MAX_AGE_MS)

  raw.on('error', finish)
  raw.once('close', finish)
  /* `ready` promises the line is listening; while it is not, the stream stays
     quiet and the browser keeps polling until `up` says otherwise. */
  if (listener.healthy) send('ready')
}
