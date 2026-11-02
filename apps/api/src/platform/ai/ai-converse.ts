import type { Logger } from '@nestjs/common'
import type { AiTask } from '@pv/contracts'
import type { Db } from '../db/db.module'
import type { ModelBreaker } from './ai-breaker'
import {
  AiVendorError,
  providerOf,
  type AiConverseRequest,
  type AiRound,
  type AiSpent,
} from './ai-client'
import { AiOutputError, AiTransientError, AiUnavailableError, type AiAttempt } from './ai-errors'
import type { AiCaller, AiClients } from './ai-gateway'
import type { AiLedger } from './ai-ledger'
import type { ProviderLimiter } from './ai-limiter'
import { nextStep, type AiFailureKind } from './ai-policy'
import type { AiRouteRepository } from './ai-route.repository'
import type { AiRouteRowDb } from './ai-route.schema'

/** One assistant turn on one model (ADR 0133 D6). `AiGateway.conversation`
 *  admits the turn; each `round` is one model request and its attempts.
 *
 *  The first round that answers pins the model: a vendor turn carries signatures
 *  no other model can read. So fallback exists only on round 1 before any text
 *  reached the caller; later a failure ends the turn and the caller keeps its
 *  deltas. A retry repeats an empty answer only, so it cannot repeat text.
 *
 *  A route switched off between rounds throws `AiUnavailableError('disabled')`;
 *  a route edit changes limits, never the pinned model. A failed round throws
 *  `AiCallError`, a fired `signal` too (after the attempt's ledger row), so the
 *  caller reads `signal.aborted` to tell a stop from a failure. Quotas were
 *  checked once at admission. The route's input ceiling is not applied here:
 *  `countTokens` takes no tools or replayed turns. */

export type AiTurnCaller = AiCaller & {
  turnId: string
  deadlineAt: number
  /** Kept back from a round that may call tools, for the writing round after it. */
  reserveMs: number
}

export type AiConversationDeps = {
  routes: AiRouteRepository
  ledger: AiLedger
  clients: AiClients
  breaker: ModelBreaker
  limiter: ProviderLimiter
  log: Logger
  db: Db
}

/** `queueMs`: time spent waiting for a vendor slot, outside `latency_ms`. */
export type AiConversedRound = AiRound & { model: string; queueMs: number }

type Pass = {
  request: AiConverseRequest
  route: AiRouteRowDb
  onText: (delta: string) => void
  signal: AbortSignal
  attempts: AiAttempt[]
  sawText: boolean
  queueMs: number
}
type Outcome = { ok: true; round: AiRound } | { ok: false; kind: AiFailureKind; message: string }

export class AiConversation {
  private number = 0

  constructor(
    private readonly task: AiTask,
    private readonly who: AiTurnCaller,
    /** Primary first; only the answering model once pinned. */
    private models: readonly string[],
    private readonly deps: AiConversationDeps,
  ) {}

  async round(
    r: AiConverseRequest,
    onText: (delta: string) => void,
    signal: AbortSignal,
  ): Promise<AiConversedRound> {
    this.number += 1
    const route = await this.deps.routes.get(this.task)
    if (!route?.enabled) throw new AiUnavailableError(this.task, 'disabled')
    const pass: Pass = {
      request: r,
      route,
      onText,
      signal,
      attempts: [],
      sawText: false,
      queueMs: 0,
    }
    try {
      return await this.attempts(pass)
    } finally {
      if (pass.queueMs > 0) {
        const { turnId } = this.who
        this.deps.log.log(
          `ai ${this.task}: turn ${turnId} round ${this.number} waited ${pass.queueMs} ms for a slot`,
        )
      }
    }
  }

  private async attempts(pass: Pass): Promise<AiConversedRound> {
    let index = 0
    let retried = false
    let sawTransient = false
    for (;;) {
      const model = this.models[index] as string
      if (this.deps.breaker.paused(model)) {
        if (!this.mayFallBack(pass, index)) {
          throw new AiTransientError(`ai ${this.task}: ${model} is paused`, pass.attempts)
        }
        index += 1
        continue
      }
      const outcome = await this.attempt(pass, model)
      if (outcome.ok) {
        this.models = [model]
        return { ...outcome.round, model, queueMs: pass.queueMs }
      }
      this.deps.log.warn(`ai ${this.task}: ${model} ${outcome.kind} — ${outcome.message}`)
      if (pass.signal.aborted) {
        throw new AiTransientError(`ai ${this.task}: stopped by the caller`, pass.attempts)
      }
      const step = nextStep(outcome.kind, {
        canFallback: this.mayFallBack(pass, index),
        retried,
        made: pass.attempts.length,
        sawTransient,
      })
      sawTransient ||= outcome.kind === 'transient'
      if (step === 'retry') retried = true
      else if (step === 'fallback') index += 1
      else {
        const message = `ai ${this.task}: ${step} on round ${this.number} after ${pass.attempts.length} attempt(s) — ${outcome.message}`
        throw step === 'transient'
          ? new AiTransientError(message, pass.attempts)
          : new AiOutputError(message, pass.attempts)
      }
    }
  }

  private mayFallBack(pass: Pass, index: number): boolean {
    return this.number === 1 && !pass.sawText && index + 1 < this.models.length
  }

  /** One request to one model. The slot covers the request alone, so tools never hold one. */
  private async attempt(pass: Pass, model: string): Promise<Outcome> {
    const { breaker, limiter, clients } = this.deps
    const provider = providerOf(model)
    const queuedAt = Date.now()
    const queue = AbortSignal.timeout(Math.max(0, this.remaining(pass)))
    let started = 0
    let clipped = false
    const send = async (queuedMs: number): Promise<AiRound> => {
      pass.queueMs += queuedMs
      const timeoutMs = Math.min(pass.route.timeoutMs, this.remaining(pass))
      if (timeoutMs <= 0) {
        throw new AiTransientError(`ai ${this.task}: no attempt fits the deadline`, pass.attempts)
      }
      started = Date.now()
      /* Ours, not the SDKs': Anthropic's `timeout` is disarmed once headers arrive. */
      const timer = new AbortController()
      const arm = (budgetMs: number) =>
        setTimeout(
          () => {
            clipped = budgetMs < pass.route.timeoutMs
            timer.abort()
          },
          budgetMs - (Date.now() - started),
        )
      let timeout = arm(timeoutMs)
      const limits = {
        maxTokensOut: pass.route.maxTokensOut,
        timeoutMs,
        signal: AbortSignal.any([pass.signal, timer.signal]),
      }
      try {
        return await clients[provider].converse(model, pass.request, limits, (delta) => {
          if (!delta) return
          /* A round already answering may use the reserve; a stall still ends at
             the route's limit, counted from the last word. */
          clearTimeout(timeout)
          const lastWordAt = Date.now() - started
          timeout = arm(Math.min(lastWordAt + pass.route.timeoutMs, this.who.deadlineAt - started))
          pass.sawText = true
          pass.onText(delta)
        })
      } finally {
        clearTimeout(timeout)
      }
    }
    let round: AiRound
    try {
      round = await limiter.run(provider, send, AbortSignal.any([pass.signal, queue]))
    } catch (error) {
      /* Fired in the queue: nothing reached a vendor, so no ledger row. */
      if (started === 0 && (pass.signal.aborted || queue.aborted)) {
        pass.queueMs += Date.now() - queuedAt
        const message = pass.signal.aborted ? 'stopped in the queue' : 'no slot before the deadline'
        return { ok: false, kind: 'transient', message }
      }
      if (!(error instanceof AiVendorError)) throw error
      if (error.kind === 'refused') breaker.answered(model)
      /* A timer the turn clipped says the turn ran out, and other tasks share this breaker. */
      else if (!pass.signal.aborted && !clipped) breaker.failed(model)
      await this.record(pass, model, error.spent, 'error', Date.now() - started)
      return { ok: false, kind: error.kind, message: error.message }
    }
    breaker.answered(model)
    const usable = round.stop === 'end' || round.stop === 'tools'
    const empty = round.stop === 'end' && !round.text && !pass.sawText
    await this.record(pass, model, round, usable && !empty ? 'ok' : 'error', Date.now() - started)
    if (empty) return { ok: false, kind: 'bad-answer', message: `answer empty (${round.finish})` }
    return { ok: true, round }
  }

  /** A round that may call tools leaves room for the answer; a writing round gets all that is left. */
  private remaining({ request }: Pass): number {
    const { deadlineAt, reserveMs } = this.who
    return deadlineAt - Date.now() - (request.toolChoice === 'auto' ? reserveMs : 0)
  }

  /** The vendor billed whether or not this insert lands, so a failure only logs, as in `run`. */
  private async record(
    pass: Pass,
    model: string,
    spent: AiSpent | undefined,
    outcome: AiAttempt['outcome'],
    latencyMs: number,
  ): Promise<void> {
    const { actorId, subjectCode, turnId } = this.who
    const tokensIn = spent?.tokensIn ?? 0
    const tokensOut = spent?.tokensOut ?? 0
    pass.attempts.push({ model, tokensIn, tokensOut, outcome })
    const attempt = pass.attempts.length
    await this.deps.ledger
      .record(this.deps.db, {
        task: this.task,
        model,
        tokensIn,
        tokensOut,
        tokensCached: spent?.tokensCached ?? 0,
        tokensCacheWrite: spent?.tokensCacheWrite ?? 0,
        outcome,
        actorId,
        subjectCode,
        attempt,
        latencyMs,
        promptVersion: pass.request.prompt ?? null,
        turnId,
        round: this.number,
      })
      .catch((error: unknown) => {
        this.deps.log.error(
          `ai ${this.task}: ledger write failed for ${model} round ${this.number} attempt ${attempt} (in ${tokensIn}, out ${tokensOut}, ${outcome}) — ${String(error)}`,
        )
      })
  }
}
