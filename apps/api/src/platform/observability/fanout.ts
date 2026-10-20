/** Counters for the `pv_change` broadcast (ADR 0104, review finding 5).
 *
 *  Module-level on purpose: the listener only increments and the metrics tick
 *  reads, so neither needs the other injected. Counting never touches the SSE
 *  `entity` payload. */
let events = 0
let deliveries = 0

/** One entity event reached `sinks` open streams. */
export function countFanout(sinks: number): void {
  events += 1
  deliveries += sinks
}

/** Counts since the last call; resets. */
export function takeFanout(): { events: number; deliveries: number } {
  const out = { events, deliveries }
  events = 0
  deliveries = 0
  return out
}
