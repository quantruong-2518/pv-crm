import type {
  AiClient,
  AiConverseRequest,
  AiLimits,
  AiMessage,
  AiRound,
} from '@api/platform/ai/ai-client'

/** A vendor that replays a script and records every request, the eval's stand-in
 *  for a model and the witness for "what left the process".
 *
 *  Text goes through `onText` one delta at a time, exactly as a real stream does,
 *  so the turn's body is built by the runner and not handed back whole. A request
 *  is recorded before its step runs, and `observe` reads the database at that same
 *  moment: a row the observer does not see had not landed when the request left. */

export type Said = {
  deltas?: readonly string[]
  calls?: readonly { name: string; input: Record<string, unknown> }[]
  stop?: AiRound['stop']
  tokensIn?: number
  tokensOut?: number
  tokensCached?: number
  /** Thrown after the deltas, the way a stream dies part-way. */
  fail?: Error
}

export type Seen = {
  model: string
  request: AiConverseRequest
  timeoutMs: number
  /** What `observe` read when the request went out. */
  landed: unknown
}

export type Step = Said | ((seen: Seen, nth: number) => Said | Promise<Said>)

export type Witness = { seen: Seen[]; deltas: string[] }

export const newWitness = (): Witness => ({ seen: [], deltas: [] })

export class ScriptedClient implements AiClient {
  readonly keyed = true
  private next = 0

  constructor(
    private readonly steps: readonly Step[],
    private readonly witness: Witness,
    private readonly observe?: () => Promise<unknown>,
    /** The last step repeats, for a model that never stops calling. */
    private readonly loopLast = false,
  ) {}

  generate(): never {
    throw new Error('ScriptedClient answers conversations only')
  }

  countTokens(): never {
    throw new Error('ScriptedClient answers conversations only')
  }

  async converse(
    model: string,
    request: AiConverseRequest,
    limits: AiLimits & { signal: AbortSignal },
    onText: (delta: string) => void,
  ): Promise<AiRound> {
    const landed = await this.observe?.()
    const seen = { model, request, timeoutMs: limits.timeoutMs, landed }
    this.witness.seen.push(seen)
    const nth = this.next++
    const step = this.steps[Math.min(nth, this.steps.length - 1)]
    if (!step || (nth >= this.steps.length && !this.loopLast)) {
      throw new Error(`the script ran out at request ${nth + 1}`)
    }
    const said = typeof step === 'function' ? await step(seen, nth) : step
    for (const delta of said.deltas ?? []) {
      this.witness.deltas.push(delta)
      onText(delta)
    }
    if (said.fail) throw said.fail
    const calls = (said.calls ?? []).map((call, i) => ({ id: `v-${nth}-${i}`, ...call }))
    const tokensIn = said.tokensIn ?? 100
    return {
      text: (said.deltas ?? []).join(''),
      calls,
      vendor: { model, raw: null },
      stop: said.stop ?? (calls.length > 0 ? 'tools' : 'end'),
      finish: 'scripted',
      tokensIn,
      tokensCached: said.tokensCached ?? 0,
      tokensCacheWrite: 0,
      tokensOut: said.tokensOut ?? 20,
    }
  }
}

/** The results the model has been given so far, as they were sent. */
export function toolOutputs(messages: readonly AiMessage[]): string[] {
  return messages.flatMap((m) =>
    m.role === 'tool' ? m.results.map((r) => (r.output as string) ?? '') : [],
  )
}

/** A model that repeats everything it read. Without it the deltas, the body and the
 *  message row would be canary-free by construction and those checks would prove
 *  nothing; with it, a value that reached the model reaches all three. */
export const parrot = (seen: Seen): Said => ({
  deltas: [toolOutputs(seen.request.messages).join('\n') || 'Không có dữ liệu.'],
})
