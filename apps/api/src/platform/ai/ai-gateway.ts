import { Inject, Injectable, Logger } from '@nestjs/common'
import type { AiTask } from '@pv/contracts'
import { z, type ZodType } from 'zod'
import { DB, type Db } from '../db/db.module'
import {
  AiVendorError,
  providerOf,
  type AiAnswer,
  type AiClient,
  type AiProvider,
  type AiRequest,
} from './ai-client'
import { ModelBreaker } from './ai-breaker'
import { AiConversation, type AiTurnCaller } from './ai-converse'
import { AiOutputError, AiTransientError, AiUnavailableError, type AiAttempt } from './ai-errors'
import { AiLedger } from './ai-ledger'
import { ProviderLimiter } from './ai-limiter'
import { AiRouteRepository } from './ai-route.repository'
import type { AiRouteRowDb } from './ai-route.schema'
import { nextStep, type AiFailureKind } from './ai-policy'

/** The one door every AI feature calls (gateway spec, ADR 0102's successor).
 *
 *  Per call it reads the task's route (no cache), runs the pre-flight, sends to
 *  the primary model or its fallback under `ai-policy.ts` (skipping a model
 *  `ai-breaker.ts` has paused, within `ai-limiter.ts`'s per-vendor slots),
 *  writes one ledger row per attempt with its latency, and parses the answer by
 *  the caller's zod schema — the JSON schema sent is derived from the same one.
 *  Logs and errors carry model, vendor status and reason; never prompt, answer
 *  or file bytes. */

export const AI_CLIENTS = Symbol('pv.ai.clients')
export type AiClients = Record<AiProvider, AiClient>

/** `admitted`: the caller ran `check` when it accepted the work (a queued job),
 *  so `run` skips the quotas — work already accepted is never cut mid-batch.
 *  `deadlineAt` (epoch ms): a caller holding a request open stops before Fly's proxy
 *  drops it, so no attempt opens that could outlive this.
 *  `oneAttempt`: the first failure ends the call, for a request each attempt of
 *  which bills a whole recording again; quotas count first attempts only (ADR 0135). */
export type AiCaller = {
  actorId: string | null
  subjectCode: string | null
  admitted?: boolean
  deadlineAt?: number
  oneAttempt?: boolean
}
export type AiResult<T> = { value: T; model: string; attempts: readonly AiAttempt[] }

type Outcome<T> = { ok: true; value: T } | { ok: false; kind: AiFailureKind; message: string }
type Run<T> = {
  task: AiTask
  route: AiRouteRowDb
  request: AiRequest
  schema: ZodType<T>
  jsonSchema: object
  who: AiCaller
  attempts: AiAttempt[]
}

@Injectable()
export class AiGateway {
  private readonly log = new Logger('AiGateway')
  private readonly breaker = new ModelBreaker()
  private readonly limiter = new ProviderLimiter()

  constructor(
    private readonly routes: AiRouteRepository,
    private readonly ledger: AiLedger,
    @Inject(AI_CLIENTS) private readonly clients: AiClients,
    @Inject(DB) private readonly db: Db,
  ) {}

  /** Throws `AiUnavailableError` when `run` would refuse before calling.
   *  `db` lets a caller inside a transaction pass its `tx`. */
  async check(task: AiTask, actorId: string | null, db: Db = this.db): Promise<void> {
    await this.admit(task, actorId, db)
  }

  async run<T>(
    task: AiTask,
    request: AiRequest,
    schema: ZodType<T>,
    who: AiCaller,
  ): Promise<AiResult<T>> {
    const admitted = await this.admit(task, who.actorId, this.db, !who.admitted)
    const { route } = admitted
    const models = admitted.models.filter((m) => !this.breaker.paused(m))
    /* Every model paused: fail now, not after a timeout; a queued caller retries later. */
    if (models.length === 0) {
      throw new AiTransientError(`ai ${task}: every model is paused after repeated failures`, [])
    }
    /* `$schema` is dropped: neither vendor lists the dialect marker among its keywords. */
    const jsonSchema = { ...z.toJSONSchema(schema), $schema: undefined }
    const run: Run<T> = { task, route, request, schema, jsonSchema, who, attempts: [] }
    let index = 0
    let retried = false
    let sawTransient = false
    for (;;) {
      if (who.deadlineAt !== undefined && Date.now() + route.timeoutMs > who.deadlineAt) {
        const message = `ai ${task}: no attempt fits the deadline after ${run.attempts.length}`
        /* A route timeout past the deadline lands here with no attempt and no ledger row. */
        this.log.warn(message)
        throw new AiTransientError(message, run.attempts)
      }
      const model = models[index] as string
      const outcome = await this.attempt(run, model)
      if (outcome.ok) return { value: outcome.value, model, attempts: run.attempts }
      this.log.warn(`ai ${task}: ${model} ${outcome.kind} — ${outcome.message}`)
      /* Told it has nothing left, so `nextStep` ends the call under its usual classes. */
      const once = who.oneAttempt === true
      const step = nextStep(outcome.kind, {
        canFallback: !once && index + 1 < models.length,
        retried: once || retried,
        made: run.attempts.length,
        sawTransient,
      })
      sawTransient ||= outcome.kind === 'transient'
      if (step === 'retry') retried = true
      else if (step === 'fallback') index += 1
      else {
        const message = `ai ${task}: ${step} after ${run.attempts.length} attempt(s) — ${outcome.message}`
        throw step === 'transient'
          ? new AiTransientError(message, run.attempts)
          : new AiOutputError(message, run.attempts)
      }
    }
  }

  /** Admits one assistant turn: its quotas are read here and never again in it. */
  async conversation(
    task: 'assistant' | 'assistant-deep',
    who: AiTurnCaller,
  ): Promise<AiConversation> {
    const { models } = await this.admit(task, who.actorId, this.db, !who.admitted)
    const { routes, ledger, clients, breaker, limiter, log, db } = this
    return new AiConversation(task, who, models, {
      routes,
      ledger,
      clients,
      breaker,
      limiter,
      log,
      db,
    })
  }

  /** The route, and its models that have a key, primary first. */
  private async admit(task: AiTask, actorId: string | null, db: Db, quotas = true) {
    const route = await this.routes.get(task, db)
    if (!route?.enabled) throw new AiUnavailableError(task, 'disabled')
    const models = [route.primaryModel, route.fallbackModel].filter(
      (m): m is string => m !== null && this.clients[providerOf(m)].keyed,
    )
    if (models.length === 0) throw new AiUnavailableError(task, 'no-key')
    if (!quotas) return { route, models }
    const perUser = route.dailyCallsPerUser
    if (perUser > 0 && actorId && (await this.routes.callsLastDay(task, actorId, db)) >= perUser) {
      throw new AiUnavailableError(task, 'user-limit')
    }
    const budget = route.dailyTokenBudget
    if (budget > 0 && (await this.routes.tokensLastDay(task, db)) >= budget) {
      throw new AiUnavailableError(task, 'budget')
    }
    return { route, models }
  }

  /** One request to one model, after the input ceiling when the route sets one. */
  private async attempt<T>(run: Run<T>, model: string): Promise<Outcome<T>> {
    const provider = providerOf(model)
    const client = this.clients[provider]
    const over = await overCeiling(run, client, model)
    if (over) return over
    let answer: AiAnswer
    let started = 0
    try {
      answer = await this.limiter.run(provider, () => {
        started = Date.now()
        return client.generate(model, run.request, run.jsonSchema, run.route)
      })
    } catch (error) {
      if (!(error instanceof AiVendorError)) throw error
      if (error.kind === 'refused') this.breaker.answered(model)
      else this.breaker.failed(model)
      await this.record(run, model, error.spent ?? null, 'error', Date.now() - started)
      return failed(error)
    }
    this.breaker.answered(model)
    const latencyMs = Date.now() - started
    const outcome = parseAnswer(answer, run.schema)
    await this.record(run, model, answer, outcome.ok ? 'ok' : 'error', latencyMs)
    return outcome
  }

  /** `null` = nothing reported: the vendor refused, timed out or was unreachable.
   *  A stream that died reports what it had counted, and that much was billed. */
  private async record<T>(
    run: Run<T>,
    model: string,
    billed: Pick<AiAnswer, 'tokensIn' | 'tokensOut'> | null,
    outcome: AiAttempt['outcome'],
    latencyMs: number,
  ): Promise<void> {
    const call: AiAttempt = {
      model,
      tokensIn: billed?.tokensIn ?? 0,
      tokensOut: billed?.tokensOut ?? 0,
      outcome,
    }
    run.attempts.push(call)
    const row = {
      ...call,
      task: run.task,
      actorId: run.who.actorId,
      subjectCode: run.who.subjectCode,
      attempt: run.attempts.length,
      latencyMs,
      promptVersion: run.request.prompt ?? null,
    }
    /* The vendor has billed already: a failed insert must not fail the call, or
     *  the caller's retry would pay a second time. The log keeps the counts. */
    await this.ledger.record(this.db, row).catch((error: unknown) => {
      const { task, tokensIn, tokensOut, attempt } = row
      this.log.error(
        `ai ${task}: ledger write failed for ${model} attempt ${attempt} (in ${tokensIn}, out ${tokensOut}, ${outcome}) — ${String(error)}`,
      )
    })
  }
}

const failed = (error: AiVendorError): Outcome<never> => ({
  ok: false,
  kind: error.kind,
  message: error.message,
})

/** The vendor's count endpoint is free and bills nothing, so a count writes no
 *  ledger row and uses no attempt; its own failure is classed like a call's. */
async function overCeiling<T>(
  run: Run<T>,
  client: AiClient,
  model: string,
): Promise<Outcome<never> | null> {
  const cap = run.route.maxTokensIn
  if (cap === null) return null
  try {
    const tokens = await client.countTokens(model, run.request, run.route.timeoutMs)
    return tokens > cap ? { ok: false, kind: 'refused', message: `input ${tokens} > ${cap}` } : null
  } catch (error) {
    if (error instanceof AiVendorError) return failed(error)
    throw error
  }
}

/** The vendor's word that it followed the schema is not taken: parsed here. */
function parseAnswer<T>(answer: AiAnswer, schema: ZodType<T>): Outcome<T> {
  const bad = (why: string): Outcome<T> => ({
    ok: false,
    kind: 'bad-answer',
    message: `answer ${why} (finish ${answer.finish})`,
  })
  if (!answer.text) return bad('empty')
  if (!answer.complete) return bad('cut short')
  let raw: unknown
  try {
    raw = JSON.parse(answer.text)
  } catch {
    return bad('not JSON')
  }
  const parsed = schema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : bad(`off-schema at ${parsed.error.issues[0]?.path.join('.')}`)
}
