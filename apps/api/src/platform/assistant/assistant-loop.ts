import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import type {
  AiUnavailableReason,
  AssistantEndedBy,
  AssistantErrorCode,
  AssistantEvent,
  AssistantMessageState,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import type { AiMessage, AiRound, AiToolCall } from '../ai/ai-client'
import { AiCallError, AiTransientError, AiUnavailableError } from '../ai/ai-errors'
import { AiGateway } from '../ai/ai-gateway'
import { AuditRepository, type AuditEntry } from '../audit/audit.repository'
import {
  ASSISTANT_PROMPT_VERSION,
  CUT_SHORT,
  fenced,
  newFence,
  openingMessages,
  requestOf,
  tokensOf,
} from './assistant-context'
import { TurnBinding } from './assistant-bind'
import { recheck } from './assistant-refs'
import { AssistantSummarizer } from './assistant-summary'
import { AssistantToolGate, inPool, notRun, type ToolVerdict } from './assistant-tools'
import { footerOf, newReads, noteReads, suggestionsOf, type TurnReads } from './assistant-turn-read'
import {
  AssistantRepository,
  type TurnBegun,
  type TurnFinish,
  type TurnLine,
  type TurnRefused,
} from './assistant.repository'
import type { AssistantToolCallValues } from './assistant.schema'

/** One turn of the assistant: the capped loop over the gateway's conversation
 *  (ADR 0133 D7). Agent policy lives here so the gateway stays free of it.
 *
 *  Per round: model call, parse and gate each input, run under a semaphore, write
 *  the audit, and only then build the next request. A failed write ends the turn
 *  with nothing sent, and no transaction spans a model call.
 *
 *  The sink is not a connection: a closed socket drops events and the turn runs
 *  on. Logs carry counts and error classes, never a question, argument or result. */

const MAX_ROUNDS = 8
const TURN_MS = 60_000
/* Past this no tool round starts: the rest of the turn is the writing round. */
const LAST_TOOL_ROUND_MS = 48_000
const TOOL_TOKEN_CAP = 40_000
const CALLS_PER_ROUND = 6
const PARALLEL_TOOLS = 3

const WRITE_NOW = 'No more tool calls in this turn. Answer now from what you already have.'

type Refusal = { code: AssistantErrorCode; message: string }

/** `failed` is what nothing more precise names; the screen branches on the code. */
export const FAILED: Refusal = { code: 'failed', message: 'Trợ lý chưa trả lời được. Thử lại.' }
export const OFF: Refusal = { code: 'off', message: 'Trợ lý đang tắt.' }
const INTERRUPTED: Refusal = {
  code: 'interrupted',
  message: 'Câu trả lời bị ngắt giữa chừng. Hãy hỏi lại.',
}

const REFUSED: Record<TurnRefused['reason'], Refusal> = {
  'no-session': { code: 'failed', message: 'Không tìm thấy cuộc trò chuyện này.' },
  'hourly-limit': { code: 'limit', message: 'Bạn đã hết lượt hỏi trong giờ này. Thử lại sau.' },
  running: { code: 'busy', message: 'Câu trước chưa trả lời xong. Chờ một chút rồi hỏi lại.' },
}

export const UNAVAILABLE: Record<AiUnavailableReason, Refusal> = {
  disabled: OFF,
  'no-key': OFF,
  'user-limit': {
    code: 'limit',
    message: 'Bạn đã hết lượt Trợ lý trong 24 giờ qua. Thử lại sau.',
  },
  budget: { code: 'limit', message: 'Trợ lý đã hết lượt dùng trong 24 giờ qua. Thử lại sau.' },
}

const STATE_OF: Record<AssistantEndedBy, Exclude<AssistantMessageState, 'running'>> = {
  answer: 'done',
  'cap-rounds': 'done',
  'cap-time': 'done',
  'cap-tokens': 'done',
  vendor: 'failed',
  disabled: 'failed',
  crash: 'failed',
  stopped: 'stopped',
}

export type TurnContext = {
  who: Actor
  sessionId: string
  question: string
  /** Sent by the screen; the model reads it as context, nothing is decided on it. */
  screen: string | null
  task: 'assistant' | 'assistant-deep'
  /** Once the running row stands: the caller can stop the turn by this id from now. */
  onBegun?: (turnId: string) => void
}

type Cap = Extract<AssistantEndedBy, `cap-${string}`>

type Turn = {
  id: string
  who: Actor
  signal: AbortSignal
  startedAt: number
  emit: (event: AssistantEvent) => void
  messages: AiMessage[]
  text: string
  rounds: number
  toolTokens: number
  firstTextMs: number | null
  model: string | null
  /** The cap that ran out: the next round writes and calls no tool. */
  cap: Cap | null
  /** Made once per turn, after the first data is read (D5). */
  fence: string | null
  /** Tool and code pairs with an `ai-read` line this turn: a search hit and an
   *  opened record are two lines, so the trail tells a skim from a read of contacts. */
  audited: Set<string>
  reads: TurnReads
  /** D3: what the model writes reaches `text` and the wire only through this. */
  binding: TurnBinding
  /** Characters the model wrote, round breaks included; `text` lags it by a held word. */
  wrote: number
}

/** A call on its way to the audit and to `assistant_tool_call`. `id` is ours, not
 *  the vendor's: it joins the audit note to the row and no model string reaches it. */
type RoundCall = ToolVerdict & {
  id: string
  call: AiToolCall
  tokens: number
  truncated: boolean
}

/** Set only by whoever needs to move time; production reads the real clock. */
export const ASSISTANT_CLOCK = Symbol('pv.assistant.clock')

const SHAPE = /[^a-z_]/g

/** A model can invent a name, and the table's CHECK would turn that into a crash. */
const storableName = (name: string): string =>
  name.toLowerCase().replace(SHAPE, '_').slice(0, 64) || 'unknown'

/* Postgres stores \u0000 in neither `text` nor `jsonb`, keys included. */
const withoutNul = (text: string): string => text.replaceAll('\u0000', '')

const storableJson = (value: unknown): unknown => {
  if (typeof value === 'string') return withoutNul(value)
  if (Array.isArray(value)) return value.map(storableJson)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [withoutNul(key), storableJson(item)]),
  )
}

/** The token cap, in call order: an over-cap result reaches neither the model nor
 *  the audit, because nothing of it was read. */
function capped(
  turn: Turn,
  calls: readonly AiToolCall[],
  verdicts: readonly ToolVerdict[],
): RoundCall[] {
  return verdicts.map((verdict, i) => {
    const base = { ...verdict, id: randomUUID(), call: calls[i] as AiToolCall }
    const ok = verdict.outcome === 'ok'
    const draft = ok ? turn.binding.draft(verdict.output, verdict.rowCount) : null
    const tokens = tokensOf(draft?.output ?? verdict.output)
    if (turn.toolTokens + tokens <= TOOL_TOKEN_CAP) {
      turn.toolTokens += tokens
      if (draft) turn.binding.keep(draft)
      return { ...base, output: draft?.output ?? verdict.output, tokens, truncated: false }
    }
    turn.cap ??= 'cap-tokens'
    const output = { truncated: true }
    return { ...base, outcome: 'over-cap', output, codes: [], tokens: 0, truncated: true }
  })
}

/** D4, plus the refusal line `AccessGuard` writes at the same fence. */
function auditLines(turn: Turn, calls: readonly RoundCall[]): AuditEntry[] {
  const actorId = turn.who.id
  return calls.flatMap((c): AuditEntry[] => {
    const note = `assistant.${c.call.name} · turn ${turn.id} · call ${c.id}`
    if (c.denied) return [{ actorId, action: 'view', note: `chặn ${note} · ${c.denied}` }]
    const refusals = c.skipped.map(({ door, reason }): AuditEntry => ({
      actorId,
      action: 'view',
      note: `chặn ${note} · ${door} · ${reason}`,
    }))
    if (c.outcome !== 'ok') return refusals
    const read = (code: string) => `${c.call.name} ${code}`
    const fresh = c.codes.filter((code) => !turn.audited.has(read(code)))
    for (const code of fresh) turn.audited.add(read(code))
    const lines: AuditEntry[] = [...refusals]
    for (const code of new Set(fresh)) lines.push({ actorId, action: 'ai-read', code, note })
    const rowCount = c.rowCount ?? 0
    const hidden = c.hidden ?? 0
    if (hidden > 0 || (c.codes.length === 0 && rowCount > 0)) {
      lines.push({
        actorId,
        action: 'ai-read',
        note: `${note} · ${rowCount} row(s) · ${hidden} hidden`,
      })
    }
    return lines
  })
}

const toolCallRow = (turn: Turn, c: RoundCall, position: number): AssistantToolCallValues => ({
  id: c.id,
  messageId: turn.id,
  round: turn.rounds,
  position,
  name: storableName(c.call.name),
  input: storableJson(c.call.input) as AssistantToolCallValues['input'],
  codes: [...c.codes],
  rowCount: c.rowCount,
  hidden: c.hidden,
  truncated: c.truncated,
  toolTokens: c.tokens,
  outcome: c.outcome,
  latencyMs: c.latencyMs,
})

/** The vendor's turn first, then one result per call: both vendors refuse a
 *  request whose calls lack results. The results go in only after the writes. */
function appendRound(turn: Turn, round: AiRound, calls: readonly RoundCall[]): void {
  const fence = (turn.fence ??= newFence())
  turn.messages.push(
    { role: 'assistant-round', text: round.text, calls: round.calls, vendor: round.vendor },
    {
      role: 'tool',
      results: calls.map((c) => ({
        callId: c.call.id,
        name: c.call.name,
        output: fenced(fence, c.output),
        isError: c.outcome !== 'ok',
      })),
      ...(turn.cap ? { note: WRITE_NOW } : {}),
    },
  )
}

/** The end of a round that does not go on; `null` = run its tools and go on. */
function endOfRound(turn: Turn, round: AiRound): AssistantEndedBy | null {
  if (round.stop === 'tools' && round.calls.length > 0 && !turn.cap) return null
  if (round.stop === 'end' && turn.text !== '') return turn.cap ?? 'answer'
  addCutShort(turn)
  return round.stop === 'tools' && turn.cap ? turn.cap : 'vendor'
}

/** D7: the writing round failed, so a fixed sentence follows the partial text. */
function addCutShort(turn: Turn): void {
  say(turn, turn.binding.flush())
  say(turn, turn.text === '' ? CUT_SHORT : `\n\n${CUT_SHORT}`)
}

/** The one way out for answer text, so the row and the wire hold the same string. */
function say(turn: Turn, text: string): void {
  if (text === '') return
  turn.text += text
  turn.emit({ type: 'text', delta: text })
}

@Injectable()
export class AssistantRunner {
  private readonly log = new Logger('Assistant')

  constructor(
    private readonly gateway: AiGateway,
    private readonly repo: AssistantRepository,
    private readonly audit: AuditRepository,
    private readonly tools: AssistantToolGate,
    @Optional() @Inject(ASSISTANT_CLOCK) private readonly now: () => number = Date.now,
    @Optional() private readonly summarizer?: AssistantSummarizer,
  ) {}

  /** Rejects only when the turn cannot be opened at all, and then no row stands. */
  async runTurn(
    ctx: TurnContext,
    sink: (event: AssistantEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const emit = (event: AssistantEvent): void => {
      try {
        sink(event)
      } catch {
        /* A dead connection is the client's loss, never the turn's. */
      }
    }
    const begun = await this.repo.beginTurn(ctx.who.id, ctx.sessionId, ctx.question)
    if (!begun.ok) return emit({ type: 'error', ...REFUSED[begun.reason] })
    ctx.onBegun?.(begun.turnId)

    const history = await this.replayable(ctx.who, ctx.sessionId, begun.history)
    const turn = this.open(ctx, { ...begun, history }, emit, signal)
    const endedBy = await this.drive(turn, ctx, begun).catch((error: unknown) =>
      this.endOfError(turn, error),
    )
    await this.close(turn, endedBy)
    /* Not awaited: `done` is out, and a fold holds neither the caller nor the next turn. */
    void this.summarizer?.afterTurn(ctx.who.id, ctx.sessionId)
  }

  private open(ctx: TurnContext, begun: TurnBegun, emit: Turn['emit'], signal: AbortSignal): Turn {
    const startedAt = this.now()
    const messages = openingMessages(begun, { ...ctx, at: new Date(startedAt) })
    return {
      id: begun.turnId,
      who: ctx.who,
      signal,
      startedAt,
      emit,
      messages,
      binding: new TurnBinding(ctx.question, begun.subject?.code ?? null),
      wrote: 0,
      text: '',
      rounds: 0,
      toolTokens: 0,
      firstTextMs: null,
      model: null,
      cap: null,
      fence: null,
      audited: new Set(),
      reads: newReads(),
    }
  }

  /** Outside `beginTurn`'s transaction, which holds PGlite's one connection. The
   *  whole chat is checked, since a shut answer shuts every later one. A failed
   *  check replays nothing rather than everything. */
  private async replayable(
    who: Actor,
    sessionId: string,
    history: readonly TurnLine[],
  ): Promise<TurnLine[]> {
    try {
      const ids = await this.repo.answersOf(sessionId)
      const calls = await this.repo.callsOf(ids)
      const chat = ids.map((id) => ({ id, codes: (calls.get(id) ?? []).flatMap((c) => c.codes) }))
      const { shut } = await recheck(this.tools, who, chat)
      return history
        .filter((line) => !shut.has(line.turnId))
        .map((line) =>
          line.role === 'assistant'
            ? { ...line, body: this.tools.contactText(who, line.body) }
            : line,
        )
    } catch (error) {
      this.log.error(`replay check failed: ${error instanceof Error ? error.name : 'unknown'}`)
      return []
    }
  }

  private async drive(turn: Turn, ctx: TurnContext, begun: TurnBegun): Promise<AssistantEndedBy> {
    const conversation = await this.gateway.conversation(ctx.task, {
      actorId: turn.who.id,
      subjectCode: begun.subject?.code ?? null,
      turnId: turn.id,
      deadlineAt: turn.startedAt + TURN_MS,
      reserveMs: TURN_MS - LAST_TOOL_ROUND_MS,
    })
    const effort = ctx.task === 'assistant-deep' ? 'medium' : 'low'
    let before = 0
    const onText = (delta: string): void => {
      turn.firstTextMs ??= this.now() - turn.startedAt
      /* Each round writes on its own: run together they read as one broken sentence.
         `text` holds the earlier rounds whole here, flushed as each one ended. */
      const text = turn.text !== '' && turn.wrote === before ? `\n\n${delta}` : delta
      turn.wrote += text.length
      say(turn, turn.binding.push(text))
    }
    for (;;) {
      if (turn.signal.aborted) return 'stopped'
      this.noteLate(turn)
      turn.emit({ type: 'step', round: turn.rounds + 1 })
      const choice = turn.cap ? 'none' : 'auto'
      /* A copy: a request must stay what was sent while the turn grows past it. */
      const messages = [...turn.messages]
      const request = requestOf(turn.who, this.tools.declarations(), choice, messages, effort)
      before = turn.wrote
      const round = await conversation
        .round(request, onText, turn.signal)
        .catch((error: unknown) => {
          this.noteLate(turn)
          const holds = turn.messages.some((m) => m.role === 'tool')
          const wrote = turn.wrote > before
          const transient = error instanceof AiTransientError && !turn.signal.aborted
          /* The reserve timer killed a tool round: what was read still gets its answer. */
          if (choice === 'auto' && turn.cap && holds && !wrote && transient) return null
          throw error
        })
      say(turn, turn.binding.flush())
      if (!round) continue
      turn.rounds += 1
      turn.model = round.model
      const end = endOfRound(turn, round)
      if (end) return end
      await this.runTools(turn, round)
    }
  }

  private noteLate(turn: Turn): void {
    if (this.now() - turn.startedAt >= LAST_TOOL_ROUND_MS) turn.cap ??= 'cap-time'
  }

  /** The order is the safety: nothing enters `turn.messages` until both writes
   *  have landed, so a failed audit leaves the model with nothing to read. */
  private async runTools(turn: Turn, round: AiRound): Promise<void> {
    /* A slow model can return past the mark: its calls still need results. */
    this.noteLate(turn)
    const late = turn.cap !== null
    const verdicts = await inPool(round.calls, PARALLEL_TOOLS, (call, index) => {
      if (late || index >= CALLS_PER_ROUND) {
        return Promise.resolve(notRun('over-cap', { error: 'over-cap' }))
      }
      turn.emit({ type: 'step', round: turn.rounds, tool: storableName(call.name) })
      return this.tools.call(turn.who, call)
    })
    const calls = capped(turn, round.calls, verdicts)
    await this.audit.writeMany(auditLines(turn, calls))
    await this.repo.recordToolCalls(calls.map((c, i) => toolCallRow(turn, c, i)))
    if (turn.rounds + 1 >= MAX_ROUNDS) turn.cap ??= 'cap-rounds'
    appendRound(turn, round, calls)
    noteReads(turn.reads, calls)
    for (const c of calls) {
      turn.emit({
        type: 'tool-result',
        result: {
          tool: storableName(c.call.name),
          outcome: c.outcome,
          rowCount: c.rowCount,
          hidden: c.hidden,
          truncated: c.truncated,
        },
      })
    }
  }

  private endOfError(turn: Turn, error: unknown): AssistantEndedBy {
    if (turn.signal.aborted) return 'stopped'
    if (error instanceof AiUnavailableError) {
      turn.emit({ type: 'error', ...UNAVAILABLE[error.reason] })
      return 'disabled'
    }
    if (error instanceof AiCallError) {
      addCutShort(turn)
      return this.now() - turn.startedAt >= TURN_MS ? 'cap-time' : 'vendor'
    }
    this.log.error(`turn ${turn.id} crashed: ${error instanceof Error ? error.name : 'unknown'}`)
    turn.emit({ type: 'error', ...FAILED })
    return 'crash'
  }

  /** A row the sweep closed first, or one two writes could not close, is not this
   *  answer: the client is told `interrupted`, and the sweep calls it a crash. */
  private async close(turn: Turn, endedBy: AssistantEndedBy): Promise<void> {
    /* A stop or a crash can leave a word held; the stored body is the filled text. */
    say(turn, turn.binding.flush())
    const body = withoutNul(turn.text)
    /* The fixed sentence is not an answer: a cap that left only that failed the turn. */
    const unanswered = endedBy.startsWith('cap-') && body.replace(CUT_SHORT, '').trim() === ''
    const state = unanswered ? 'failed' : STATE_OF[endedBy]
    const swept = await this.lost(turn.id, {
      state,
      endedBy,
      body,
      model: turn.model,
      rounds: turn.rounds,
      toolTokens: turn.toolTokens,
      firstTextMs: turn.firstTextMs,
      promptVersion: ASSISTANT_PROMPT_VERSION,
    })
    if (swept) turn.emit({ type: 'error', ...INTERRUPTED })
    const { reads } = turn
    if (reads.refs.size > 0) turn.emit({ type: 'refs', refs: [...reads.refs.values()] })
    const items = !swept && state === 'done' ? suggestionsOf(reads) : []
    if (items.length > 0) turn.emit({ type: 'suggestions', items })
    const footer = footerOf(reads, new Date(this.now()))
    turn.emit({ type: 'done', messageId: turn.id, endedBy: swept ? 'crash' : endedBy, footer })
  }

  /** One retry. A write that committed and then threw finds the row closed on the
   *  retry, so a closed row is read back: it is ours if it holds this end. */
  private async lost(turnId: string, end: TurnFinish): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        if (await this.repo.finishTurn(turnId, end)) return false
        const row = await this.repo.endOf(turnId)
        return row?.state !== end.state || row.endedBy !== end.endedBy
      } catch (error) {
        const kind = error instanceof Error ? error.name : 'unknown'
        this.log.error(`turn ${turnId} finish failed: ${kind}`)
      }
    }
    return true
  }
}
