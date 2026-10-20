/** Whether the notification stream is connected right now.
 *
 *  Its own file with no imports: `app/query-client.ts` must read it, and
 *  `data/notification-stream.ts` imports `app/api`, which reaches back into
 *  `query-client` through `server-down.tsx`. The stream sets it; everything
 *  else only reads or subscribes. */

let live = false
const listeners = new Set<() => void>()

export const streamIsLive = () => live

export const setStreamLive = (next: boolean) => {
  if (live === next) return
  live = next
  listeners.forEach((listener) => listener())
}

export const subscribeStreamLive = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
