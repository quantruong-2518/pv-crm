import type { AiCallOutcome, AiTask, AiUnavailableReason } from '@pv/contracts'

/** What a feature catches from `AiGateway` — three classes, no vendor shapes.
 *
 *  Messages name the task, the model and the vendor's status only. Prompt,
 *  answer and file bytes are customer data and never reach an error, which
 *  may land in a log or in `pgboss.job.output`. */

/** One attempt that reached a vendor, as its ledger row records it. */
export type AiAttempt = {
  model: string
  tokensIn: number
  tokensOut: number
  outcome: AiCallOutcome
}

/** Refused before any call: route off, no key, or a daily limit reached. Final. */
export class AiUnavailableError extends Error {
  constructor(
    readonly task: AiTask,
    readonly reason: AiUnavailableReason,
  ) {
    super(`ai ${task}: unavailable (${reason})`)
    this.name = 'AiUnavailableError'
  }
}

/** A call that spent attempts and got no value; `attempts` lets the caller
 *  show what it cost — the ledger already holds one row per attempt. */
export abstract class AiCallError extends Error {
  constructor(
    message: string,
    readonly attempts: readonly AiAttempt[],
  ) {
    super(message)
  }
}

/** No usable answer and another try will not change that: the vendor refused
 *  the request, the input is over the route's ceiling, or the answer stayed
 *  empty, cut or off-schema after its one retry. */
export class AiOutputError extends AiCallError {
  override readonly name = 'AiOutputError'
}

/** Every model the route allows timed out or was down; a later try may pass. */
export class AiTransientError extends AiCallError {
  override readonly name = 'AiTransientError'
}

/** Tokens over every attempt — what the call cost, success or not. */
export function spentOf(attempts: readonly AiAttempt[]): { tokensIn: number; tokensOut: number } {
  return {
    tokensIn: attempts.reduce((n, a) => n + a.tokensIn, 0),
    tokensOut: attempts.reduce((n, a) => n + a.tokensOut, 0),
  }
}
