import { useSyncExternalStore } from 'react'

/** The reader's clock, floored to the minute and re-read on each wall-clock
 *  minute — meetings start on the minute, so a countdown or an overdue mark
 *  turns over exactly when the minute does. One timer for every reader: it is
 *  armed while anybody subscribes and cleared when the last one leaves. */

const MINUTE_MS = 60_000

const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | undefined

const minuteNow = () => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS

function arm() {
  timer = setTimeout(
    () => {
      for (const listener of listeners) listener()
      arm()
    },
    MINUTE_MS - (Date.now() % MINUTE_MS),
  )
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) arm()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) clearTimeout(timer)
  }
}

export const useMinuteClock = (): number => useSyncExternalStore(subscribe, minuteNow)
