import { Injectable, Logger } from '@nestjs/common'
import { ContractCode, ObjectCode } from '@pv/contracts'
import { AiGateway } from '../ai/ai-gateway'
import { AiRouteRepository } from '../ai/ai-route.repository'
import { ASSISTANT_SUMMARY, AssistantSummaryOutput } from '../ai/prompts/assistant.prompts'
import { renderPrompt } from '../ai/prompts/prompt-spec'
import { AuditRepository } from '../audit/audit.repository'
import { fenced, newFence, tokensOf } from './assistant-context'
import { AssistantRepository, type WholeTurn } from './assistant.repository'

/** Folds a chat's oldest turns into its summary (ADR 0133, question 149).
 *
 *  It runs after a turn's `done`, and no failure reaches the turn: the session goes
 *  on with its old summary and the next turn's end tries again. No transaction spans
 *  the model call, so a turn can open during a fold and the write is a compare-and-set
 *  on `summary_through`. A fold sends customer text to a vendor, so its `ai-read` line
 *  lands first and a failed write stops it (question 143).
 *
 *  A summary is meant to hold what was asked, what was decided and record codes: a
 *  permission lost later must not leave stale data behind, and a summary must not copy
 *  the tool results that are deliberately not stored. `storable` catches digits, `@`
 *  and codes nobody wrote. It cannot see a figure in words or a name: those rest on
 *  the prompt.
 *
 *  Logs carry error classes and reasons, never text. */

const MARK_TURNS = 10
const MARK_TOKENS = 6_000
const FOLD_TURNS = 4
/* The token mark can fire on a short chat, and the newest turns are what it is about. */
const KEEP_TURNS = 2
const SUMMARY_MAX_CHARS = 2_000
/* The prompt's 20: at this many the records line cannot use up the ceiling. */
const SUMMARY_MAX_RECORDS = 20

const PROMPT = renderPrompt(ASSISTANT_SUMMARY)

/* `\p{N}`, not `\d`: a fullwidth digit is still a digit. */
const FIGURE = /[\p{N}@]/u
/* A break needs white space after it, so `a.b@c.vn` and `3.5` stay inside one sentence. */
const SENTENCE_BREAK = /(?<=[.!?…])\s+|[\r\n]+/u
/* Whole tokens, or `LD-001` would pass on the strength of `LD-0012`. */
const CODE_EDGE = /[^\p{L}\p{N}-]+/u
const ASKING_LINE = /^Asking: (.*)$/m

const textsOf = ({ question, answer }: WholeTurn): string[] => [question, answer]

const isCode = (code: string): boolean =>
  ObjectCode.safeParse(code).success || ContractCode.safeParse(code).success

/** How many of the oldest turns to fold now; 0 = leave the chat alone. */
export function foldCount(turns: readonly WholeTurn[]): number {
  const marked = turns.length >= MARK_TURNS || tokensOf(turns.flatMap(textsOf)) >= MARK_TOKENS
  return marked ? Math.max(0, Math.min(FOLD_TURNS, turns.length - KEEP_TURNS)) : 0
}

/** Clamped like `comm-report.judge`, for its reason, and in the prose only: `LD-0042`
 *  cut to `LD-004` still looks like a record, and the next fold would find it written. */
function renderSummary({ asking, decided, records }: AssistantSummaryOutput): string {
  const prose = [asking && `Asking: ${asking}`, decided && `Decided: ${decided}`]
    .filter(Boolean)
    .join('\n')
  const list = records.length > 0 ? `\nRecords: ${records.join(', ')}` : ''
  return `${prose.slice(0, SUMMARY_MAX_CHARS - list.length).trimEnd()}${list}`.trimStart()
}

/** The whole sentence goes: stripping the character leaves the rest of an email behind,
 *  and refusing would keep a chat about quarters and amounts from ever folding. */
const withoutFigures = (text: string): string =>
  text
    .split(SENTENCE_BREAK)
    .filter((sentence) => !FIGURE.test(sentence))
    .join(' ')
    .trim()

/** What of the answer is kept, rendered, so a digit never makes a fold loop: a blank
 *  `asking` takes the previous summary's line, or goes when there is none, and with
 *  nothing new the previous text stands while the mark moves on. `null` = nothing to
 *  store and no previous summary. A code outside what the model read was made up. */
function storable(
  output: AssistantSummaryOutput,
  previous: string | null,
  folded: readonly WholeTurn[],
): string | null {
  const fresh = withoutFigures(output.asking)
  const decided = withoutFigures(output.decided)
  const sources = [previous ?? '', ...folded.flatMap(textsOf)]
  const written = new Set(sources.flatMap((text) => text.split(CODE_EDGE)))
  const records = output.records
    .filter((code) => isCode(code) && written.has(code))
    .slice(0, SUMMARY_MAX_RECORDS)
  if (!fresh && !decided && records.length === 0) return previous
  const asking = fresh || (previous?.match(ASKING_LINE)?.[1] ?? '')
  return renderSummary({ asking, decided, records })
}

@Injectable()
export class AssistantSummarizer {
  private readonly log = new Logger('AssistantSummary')
  /** One fold per session in this process; `saveSummary` covers the other machines. */
  private readonly folding = new Map<string, Promise<void>>()

  constructor(
    private readonly gateway: AiGateway,
    private readonly routes: AiRouteRepository,
    private readonly repo: AssistantRepository,
    private readonly audit: AuditRepository,
  ) {}

  /** Never rejects, and a call during a fold joins it. The loop drops the promise;
   *  it is returned so a caller that must see the fold land can wait for it. */
  afterTurn(actorId: string, sessionId: string): Promise<void> {
    const running = this.folding.get(sessionId)
    if (running) return running
    const fold = this.fold(actorId, sessionId)
      .catch((error: unknown) => {
        const kind = error instanceof Error ? error.name : 'unknown'
        this.log.warn(`session ${sessionId}: fold failed: ${kind}`)
      })
      .finally(() => this.folding.delete(sessionId))
    this.folding.set(sessionId, fold)
    return fold
  }

  private async fold(actorId: string, sessionId: string): Promise<void> {
    const route = await this.routes.get('assistant-summary')
    if (!route?.enabled) return
    const open = await this.repo.unsummarised(sessionId, MARK_TURNS)
    const folded = open?.turns.slice(0, foldCount(open.turns)) ?? []
    const last = folded.at(-1)
    if (!open || !last) return

    const turns = folded.map(({ question, answer }) => ({ question, answer }))
    const text = fenced(newFence(), { previousSummary: open.summary, turns })
    const note = `assistant.summary · session ${sessionId} · ${turns.length} turn(s)`
    await this.audit.write({ actorId, action: 'ai-read', note })
    const { value } = await this.gateway.run(
      'assistant-summary',
      { ...PROMPT, parts: [{ text }], effort: 'low' },
      AssistantSummaryOutput,
      { actorId, subjectCode: null },
    )

    const summary = storable(value, open.summary, folded)
    if (!summary) return this.log.warn(`session ${sessionId}: summary refused: nothing left`)
    const saved = await this.repo.saveSummary(sessionId, open.through, summary, last.seq)
    if (!saved) this.log.warn(`session ${sessionId}: summary lost to another fold`)
  }
}
