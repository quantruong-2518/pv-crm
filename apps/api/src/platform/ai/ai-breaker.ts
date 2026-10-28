/** Pauses a model that keeps failing, so a vendor outage costs each call nothing
 *  instead of a full timeout before the fallback (ADR 0127).
 *
 *  Per process and in memory: the api and each worker learn on their own, and a
 *  restart forgets — both are fine for a two-minute pause. A model trips after
 *  `TRIP_AFTER` failures in a row that say the vendor or our setup with it is
 *  broken (`transient`, `vendor`); any answer, even a bad one, resets it. After
 *  the pause it is tried again, and one more failure pauses it at once. The two
 *  numbers are starting values, to be tuned from `ai_call.latency_ms`. */

const TRIP_AFTER = 3
const PAUSE_MS = 120_000

type State = { failures: number; pausedUntil: number }

export class ModelBreaker {
  private readonly states = new Map<string, State>()

  constructor(private readonly now: () => number = Date.now) {}

  paused(model: string): boolean {
    return (this.states.get(model)?.pausedUntil ?? 0) > this.now()
  }

  answered(model: string): void {
    this.states.delete(model)
  }

  failed(model: string): void {
    const state = this.states.get(model) ?? { failures: 0, pausedUntil: 0 }
    state.failures += 1
    if (state.failures >= TRIP_AFTER) state.pausedUntil = this.now() + PAUSE_MS
    this.states.set(model, state)
  }
}
