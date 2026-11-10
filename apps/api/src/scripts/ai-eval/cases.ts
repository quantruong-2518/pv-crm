import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AssistantToolOutcome } from '@pv/contracts'
import { z } from 'zod'
import { CANARY, NAMED_SEATS, PLANT_FIELDS, type NamedSeat } from './seed-data'

/** `assistant-cases.json`: the questions of ADR 0133 D10, then the gaps and the chained
 *  reads. Written against made-up records only: templates like `{cases-rival.lead}`
 *  name a seeded chain, so a case never holds a code of its own and cannot drift from
 *  the seed.
 *
 *  A case has two lives. `plan` is what a scripted model does, so a keyless run
 *  exercises the plumbing; `expect` is the rule for an answer, so a live run can
 *  score a real model. `want` belongs to the plan and a live run never reads it. */

export const CASE_GROUPS = [
  'scope',
  'injection',
  'off-topic',
  'lookup',
  'coverage',
  'linked',
  'history',
] as const
export type CaseGroup = (typeof CASE_GROUPS)[number]

export const CASE_COUNTS: Record<CaseGroup, number> = {
  scope: 20,
  injection: 15,
  'off-topic': 10,
  lookup: 5,
  coverage: 10,
  linked: 6,
  history: 5,
}

const Call = z.strictObject({
  call: z.string(),
  input: z.record(z.string(), z.unknown()),
  want: AssistantToolOutcome,
  /** Rows the call must return, when the count is the point of the step. A lead read
   *  counts its deals too: one seeded deal makes 2. */
  rows: z.number().int().nonnegative().optional(),
})

const Saying = z.strictObject({ say: z.string().min(1) })

export const EvalCase = z.strictObject({
  id: z.string().regex(/^[a-z]+-\d{2}$/),
  group: z.enum(CASE_GROUPS),
  actor: z.enum(Object.keys(NAMED_SEATS) as [NamedSeat, ...NamedSeat[]]),
  question: z.string().min(1),
  plant: z.strictObject({ field: z.enum(PLANT_FIELDS), text: z.string().min(1) }).optional(),
  plan: z.array(z.union([Call, Saying])).min(1),
  expect: z.strictObject({
    /** Chains whose canaries and codes may reach nothing. */
    forbid: z.array(z.string()),
    /** Words a compliant answer never prints. */
    forbidText: z.array(z.string()),
    mustContain: z.array(z.string()),
    /** Asked of the grader, a different vendor from the model under test. */
    grade: z.string().nullable(),
  }),
})
export type EvalCase = z.infer<typeof EvalCase>

const FILE = resolve(__dirname, 'assistant-cases.json')

type Named = { word: string; lead: string; opportunity: string; contract: string | null }

/** `{chain.field}`; an unknown name throws, because a typo must not reach a model. */
export function fill(text: string, chains: ReadonlyMap<string, Named>, self?: string): string {
  return text.replace(/\{([a-z-]+)\.([a-z]+)\}/g, (_, key: string, field: keyof Named) => {
    const value = chains.get(key === 'self' ? (self ?? '') : key)?.[field]
    if (typeof value !== 'string') throw new Error(`case template: no ${key}.${field}`)
    return value
  })
}

/** The same fill over a plan step or an input, by way of its JSON. */
export const filled = <T>(value: T, chains: ReadonlyMap<string, Named>, self?: string): T =>
  JSON.parse(fill(JSON.stringify(value), chains, self)) as T

export function loadCases(): EvalCase[] {
  return z.array(EvalCase).parse(JSON.parse(readFileSync(FILE, 'utf8')))
}

/** Faults of the set itself, so one dropped or duplicated case is a red run. */
export function caseSetFaults(cases: readonly EvalCase[]): string[] {
  const faults: string[] = []
  for (const group of CASE_GROUPS) {
    const n = cases.filter((c) => c.group === group).length
    if (n !== CASE_COUNTS[group]) faults.push(`${group}: ${n} cases, want ${CASE_COUNTS[group]}`)
  }
  if (new Set(cases.map((c) => c.id)).size !== cases.length) faults.push('repeated case id')
  for (const c of cases) {
    if (!/[àáảãạăâđèéẻẽẹêìíỉĩịòóỏõọôơùúủũụưỳýỷỹỵ]/i.test(c.question)) {
      faults.push(`${c.id}: the question is not Vietnamese`)
    }
    if (c.question.match(CANARY)) faults.push(`${c.id}: the question holds a canary`)
  }
  return faults
}
