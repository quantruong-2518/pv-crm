/** The gateway's attempt policy, as a pure function so it reads as the table
 *  it is (ADR 0127).
 *
 *  - `transient` (timeout, network, 408, 429, 5xx): the vendor may be down,
 *    so the other model is tried; with none left the caller retries later.
 *  - `vendor` (401, 403, 404, or a file type that vendor does not take): our
 *    setup with that vendor is wrong, so the other model is tried.
 *  - `bad-answer` (empty, cut short, not JSON, off-schema): models wobble, so
 *    the same model gets one more try per call.
 *  - `refused` (any other 4xx, or input over the route's ceiling): final.
 *  Once any attempt was transient the call ends transient, so the caller's
 *  retry can reach the vendor that was down. At most three attempts per call;
 *  the ledger's CHECK copies that cap. */

export const MAX_ATTEMPTS = 3

export type AiFailureKind = 'transient' | 'vendor' | 'bad-answer' | 'refused'
export type AiStep = 'retry' | 'fallback' | 'transient' | 'output'

export function nextStep(
  kind: AiFailureKind,
  at: { canFallback: boolean; retried: boolean; made: number; sawTransient: boolean },
): AiStep {
  const end: AiStep = kind === 'transient' || at.sawTransient ? 'transient' : 'output'
  if (kind === 'refused' || at.made >= MAX_ATTEMPTS) return end
  if (kind === 'bad-answer') return at.retried ? end : 'retry'
  return at.canFallback ? 'fallback' : end
}
