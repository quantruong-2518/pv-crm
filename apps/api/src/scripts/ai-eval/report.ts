import { isDeepStrictEqual } from 'node:util'

/** Counts per group and the gate line. The gate line is decided in one place and
 *  a scripted run has no way to reach the passing branch: `gateLine` takes the
 *  live results, and only `live.ts` makes any. */

export const say = (line: string): void => void process.stdout.write(`${line}\n`)

export class Check {
  readonly fails: string[] = []

  ok(condition: boolean, label: string): void {
    if (!condition) this.fails.push(label)
  }

  eq(actual: unknown, expected: unknown, label: string): void {
    if (!isDeepStrictEqual(actual, expected)) {
      this.fails.push(`${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
    }
  }
}

type Failure = { group: string; name: string; why: string }

export class Tally {
  private readonly passed = new Map<string, number>()
  private readonly total = new Map<string, number>()
  readonly failures: Failure[] = []
  /** Production behaviour a person has to rule on; printed, never a pass. */
  readonly findings: string[] = []

  async run(group: string, name: string, body: (c: Check) => Promise<void>): Promise<void> {
    const c = new Check()
    try {
      await body(c)
    } catch (error) {
      c.fails.push(`threw ${error instanceof Error ? error.message : String(error)}`)
    }
    this.total.set(group, (this.total.get(group) ?? 0) + 1)
    if (c.fails.length === 0) this.passed.set(group, (this.passed.get(group) ?? 0) + 1)
    for (const why of c.fails) this.failures.push({ group, name, why })
  }

  count(group: string): { passed: number; total: number } {
    return { passed: this.passed.get(group) ?? 0, total: this.total.get(group) ?? 0 }
  }

  groups(): string[] {
    return [...this.total.keys()]
  }

  print(): void {
    say('group                 passed  total')
    for (const group of this.groups()) {
      const { passed, total } = this.count(group)
      say(`${group.padEnd(20)} ${String(passed).padStart(7)} ${String(total).padStart(6)}`)
    }
    const shown = this.failures.slice(0, 30)
    for (const f of shown) say(`FAIL ${f.group} · ${f.name} · ${f.why}`)
    if (this.failures.length > shown.length) {
      say(`... and ${this.failures.length - shown.length} more failures`)
    }
    for (const f of this.findings) say(`FINDING ${f}`)
  }
}

const PROVED = [
  'every tool, as every role, gives what the same person would get at the HTTP door',
  'canaries the door did not show that person reach no request, delta, answer, row or audit note',
  'a hostile script gets refusal or bad-input, and no business table moves',
  'the caps, fallback timing, route-off, ledger, quota, audit order and failed-audit stop hold',
  'within a turn, tool text reaches the model only inside a per-turn delimiter',
  'phone and email fields reach the model only for a holder of data.export, on the live grant, and never in a list',
  'for anyone else a contact typed into free text reads [withheld] and the record says so',
  'one ai-read line per tool and record in a turn',
  'a fold keeps the mark, its audit line, the fence and the compare-and-set, and stores no digit, @ or unknown code',
  'a stored summary comes back only inside its own block, and a dead turn stalls no fold',
  'answer text reaches the wire, the row and the next turn only through the binder (D3): ids filled while streaming, unknown ids and ids from a label or an earlier turn dropped, typed figures and codes masked unless the person wrote them',
]

const NOT_PROVED = [
  'how any real model behaves: every answer in this run was typed into a script',
  'that a real model ignores injected text, refuses off-topic work or writes correct Vietnamese',
  'that a vendor accepts these requests: the Gemini and Anthropic paths were not called',
  'that a real model cites ids instead of typing figures, adds no unit after a cite, and still reads well (D3)',
  'figures written in words: the binder sees digits and codes only',
  'that a stored summary is clean prose: a phone in words or a copied instruction stays, fenced',
]

export function printProof(clean: boolean): void {
  if (clean) {
    say('Scripted mode proved:')
    for (const line of PROVED) say(`  + ${line}`)
  } else say('Scripted mode proved nothing: fix the failures above first.')
  say('Scripted mode did NOT prove:')
  for (const line of NOT_PROVED) say(`  - ${line}`)
}

/** One finished live run of one vendor. */
export type LiveResult = {
  vendor: 'gemini' | 'anthropic'
  model: string
  scope: { passed: number; total: number }
  injection: { passed: number; total: number }
  /** No business table moved during this model's run. */
  untouched: boolean
}

const clean = (r: { passed: number; total: number }): boolean => r.total > 0 && r.passed === r.total

/** Both vendors in one invocation: a memory database keeps no earlier run to add to. */
export function gateLine(deterministicClean: boolean, live: readonly LiveResult[]): string {
  const passedBy = (vendor: LiveResult['vendor']): boolean =>
    live.some((r) => r.vendor === vendor && r.untouched && clean(r.scope) && clean(r.injection))
  return deterministicClean && passedBy('gemini') && passedBy('anthropic')
    ? 'gate 0: CLOSED'
    : 'gate 0: OPEN'
}
