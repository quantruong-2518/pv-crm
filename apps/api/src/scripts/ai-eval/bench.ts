import type { AssistantEvent } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { eq, sql } from 'drizzle-orm'
import { aiCall } from '@api/platform/ai/ai-cost.schema'
import type { AiClient } from '@api/platform/ai/ai-client'
import { AiGateway } from '@api/platform/ai/ai-gateway'
import { AiLedger } from '@api/platform/ai/ai-ledger'
import { AiRouteRepository } from '@api/platform/ai/ai-route.repository'
import { AssistantRunner } from '@api/platform/assistant/assistant-loop'
import { AssistantToolGate, type AssistantTool } from '@api/platform/assistant/assistant-tools'
import { AssistantRepository } from '@api/platform/assistant/assistant.repository'
import {
  assistantMessage,
  assistantSession,
  assistantToolCall,
} from '@api/platform/assistant/assistant.schema'
import type { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { audit } from '@api/platform/db/platform.schema'
import { newWitness, ScriptedClient, type Step, type Witness } from './scripted-client'
import type { World } from './world'

/** One turn through the real runner, gateway, ledger, repository and audit, with a
 *  scripted vendor, and everything the turn left behind gathered into one trail.
 *
 *  A fresh gateway each time: its breaker and limiter are per instance, and one
 *  failure scenario must not pause a model for the next. */

export type Bench = {
  who: Actor
  /** Primary vendor's script; `fallback` is the second model's. */
  script: readonly Step[]
  fallback?: readonly Step[]
  loopLast?: boolean
  question?: string
  /** Added to the world's real tools. */
  extraTools?: readonly AssistantTool[]
  audits?: AuditRepository
  clock?: () => number
  signal?: AbortSignal
  sessionId?: string
  observe?: (db: Db) => Promise<unknown>
  onEvent?: (event: AssistantEvent) => void
}

export type Trail = {
  turnId: string | null
  sessionId: string
  witness: Witness
  events: AssistantEvent[]
  turn: typeof assistantMessage.$inferSelect | null
  messages: (typeof assistantMessage.$inferSelect)[]
  toolRows: (typeof assistantToolCall.$inferSelect)[]
  audits: (typeof audit.$inferSelect)[]
  ledger: (typeof aiCall.$inferSelect)[]
}

export async function newSession(db: Db, ownerId: string): Promise<string> {
  const [row] = await db
    .insert(assistantSession)
    .values({ ownerId })
    .returning({ id: assistantSession.id })
  if (!row) throw new Error('assistant_session: no row returned')
  return row.id
}

export function gatewayOf(world: World, clients: { gemini: AiClient; anthropic: AiClient }) {
  return new AiGateway(new AiRouteRepository(world.db), new AiLedger(), clients, world.db)
}

export function runnerOf(world: World, bench: Bench, gateway: AiGateway): AssistantRunner {
  const tools = [...world.tools, ...(bench.extraTools ?? [])]
  const gate = new AssistantToolGate({ tools: () => tools }, world.gateAccess)
  const repo = new AssistantRepository(world.db)
  return new AssistantRunner(gateway, repo, bench.audits ?? world.audits, gate, bench.clock)
}

export async function trailOf(
  world: World,
  sessionId: string,
  witness: Witness,
  events: AssistantEvent[],
): Promise<Trail> {
  const { db } = world
  const messages = await db
    .select()
    .from(assistantMessage)
    .where(eq(assistantMessage.sessionId, sessionId))
    .orderBy(assistantMessage.seq)
  const turn =
    [...messages].reverse().find((m) => m.role === 'assistant' && m.state !== 'running') ??
    [...messages].reverse().find((m) => m.role === 'assistant') ??
    null
  const turnId = turn?.id ?? null
  if (!turnId) {
    return {
      turnId,
      sessionId,
      witness,
      events,
      turn,
      messages,
      toolRows: [],
      audits: [],
      ledger: [],
    }
  }
  const toolRows = await db
    .select()
    .from(assistantToolCall)
    .where(eq(assistantToolCall.messageId, turnId))
    .orderBy(assistantToolCall.round, assistantToolCall.position)
  const audits = await db
    .select()
    .from(audit)
    .where(sql`${audit.note} LIKE ${`%turn ${turnId}%`}`)
  const ledger = await db
    .select()
    .from(aiCall)
    .where(eq(aiCall.turnId, turnId))
    .orderBy(aiCall.round, aiCall.attempt)
  return { turnId, sessionId, witness, events, turn, messages, toolRows, audits, ledger }
}

/** Sends a turn with `bench`'s script and returns its trail. */
export async function runTurn(world: World, bench: Bench): Promise<Trail> {
  const witness = newWitness()
  const { observe: read } = bench
  const observe = read ? () => read(world.db) : undefined
  const primary = new ScriptedClient(bench.script, witness, observe, bench.loopLast)
  const second = new ScriptedClient(bench.fallback ?? [], witness, observe)
  const gateway = gatewayOf(world, { gemini: primary, anthropic: second })
  const sessionId = bench.sessionId ?? (await newSession(world.db, bench.who.id))
  const events: AssistantEvent[] = []
  const sink = (event: AssistantEvent): void => {
    events.push(event)
    bench.onEvent?.(event)
  }
  await runnerOf(world, bench, gateway).runTurn(
    {
      who: bench.who,
      sessionId,
      question: bench.question ?? 'Cho tôi xem hồ sơ này.',
      screen: null,
      task: 'assistant',
    },
    sink,
    bench.signal ?? new AbortController().signal,
  )
  return trailOf(world, sessionId, witness, events)
}

/** Everything the turn left, as one string: the outbound requests, the stream, the
 *  answer, every row of the turn and its audit lines. */
export function trailText(trail: Trail): string {
  return JSON.stringify({
    requests: trail.witness.seen.map((s) => s.request),
    deltas: trail.witness.deltas,
    events: trail.events,
    messages: trail.messages,
    toolRows: trail.toolRows,
    audits: trail.audits,
    ledger: trail.ledger,
  })
}
