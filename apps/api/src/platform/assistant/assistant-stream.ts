import type { OutgoingHttpHeaders } from 'node:http'
import type { FastifyReply } from 'fastify'
import type { AssistantEvent } from '@pv/contracts'

const HEARTBEAT_MS = 25_000

export type TurnStream = { send: (event: AssistantEvent) => void; end: () => void }

/** One `POST /assistant/turns` answer as server-sent events: each frame is
 *  `event: <type>` then `data: <AssistantEvent as JSON>` and a blank line.
 *
 *  Written like `notification.stream.ts`: the reply is hijacked, so the headers
 *  Fastify queued (CORS, `Vary`) are copied by hand or the browser refuses the
 *  stream. A closed socket only drops frames: the turn's sink is not this
 *  connection, so the turn runs on and is saved. `end` is called when the turn
 *  has run, not on `done`. */
export function openTurnStream(reply: FastifyReply): TurnStream {
  reply.hijack()
  const raw = reply.raw
  raw.writeHead(200, {
    ...(reply.getHeaders() as OutgoingHttpHeaders),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  })
  const open = (): boolean => !raw.writableEnded && !raw.destroyed
  const send = (event: AssistantEvent): void => {
    if (open()) raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  }
  const heartbeat = setInterval(() => send({ type: 'heartbeat' }), HEARTBEAT_MS)
  /* The timer goes BEFORE `end()`: a write after end raises 'error' on the response. */
  const stop = (): void => clearInterval(heartbeat)
  raw.on('error', stop)
  raw.once('close', stop)
  return {
    send,
    end: () => {
      stop()
      if (open()) raw.end()
    },
  }
}
