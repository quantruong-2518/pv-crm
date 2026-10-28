import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { foldText } from '@pv/engines'
import { LeadAiFillField, type LeadAiFillValue } from '@pv/contracts'
import { LeadAiFillRepository } from '@api/branches/sales/lead/lead-ai-fill.repository'
import {
  LeadEnricher,
  type IndustryLists,
  type LeadDraft,
} from '@api/branches/sales/lead/lead-enrich'
import { TAX_REGISTRY, VietQrTaxRegistry } from '@api/branches/sales/lead/lead-enrich.tax-registry'
import * as M from '@api/branches/sales/lead/lead-enrich.merge'
import { aiCall, aiPrice } from '@api/platform/ai/ai-cost.schema'
import { AiModule } from '@api/platform/ai/ai.module'
import { aiRoute } from '@api/platform/ai/ai-route.schema'
import { LEAD_IDENTIFY, LEAD_SITE } from '@api/platform/ai/prompts/lead-enrich.prompts'
import { renderPrompt } from '@api/platform/ai/prompts/prompt-spec'
import { ConfigModule } from '@api/platform/config/config.module'
import type { DbHandle } from '@api/platform/db/create-db'
import { DB, DB_HANDLE, DbModule, type Db } from '@api/platform/db/db.module'

/** Runs the REAL lead enricher (two paid web-search calls per lead, plus the
 *  VietQR registry) over real leads with known answers, and prints per-field
 *  accuracy, unsure rate, latency and the prompt versions. Costs money: it prints
 *  an estimate and calls nothing without `--yes`. Writes `ai_call` rows only
 *  (subject `ai-eval`) to `DATABASE_URL`, and refuses a non-PGlite one without `--prod`.
 *  The data file is real customer data: keep it under `apps/api/.ai-eval/`
 *  (gitignored), never commit it. Shape — an array of
 *    { "draft": LeadDraft (company, contactName, email, contactTitle, legalName,
 *               taxCode, province, website, categoryId — all but the first two optional),
 *      "expected": { [LeadAiFillField]: value } }
 *  where category and industries are NAMES as listed in config; only the fields in
 *  `expected` are asked. A value counts as right when it folds (case, diacritics,
 *  punctuation) to the expected one; arrays compare as sets.
 *
 *      DATABASE_URL=pglite://… pnpm --filter @pv/api ai:eval -- [--file path] [--yes] [--prod] */

const args = process.argv.slice(2)
const YES = args.includes('--yes')
const PROD = args.includes('--prod')
const at = args.indexOf('--file')
const FILE = (at >= 0 && args[at + 1]) || '.ai-eval/leads.json'
const say = (line: string): void => void process.stdout.write(`${line}\n`)

/** A guess, not a measure: search results ride in as input tokens. */
const GROUNDING_TOKENS_IN = 4_000

type Case = { draft: LeadDraft; expected: Partial<Record<LeadAiFillField, unknown>> }
type Tally = { asked: number; filled: number; right: number; unsure: number; sureWrong: number }

@Module({
  imports: [ConfigModule, DbModule, AiModule],
  providers: [
    LeadEnricher,
    LeadAiFillRepository,
    { provide: TAX_REGISTRY, useValue: new VietQrTaxRegistry() },
  ],
})
class AiEvalModule {}

const norm = (v: unknown): string =>
  Array.isArray(v) ? v.map(norm).sort().join('|') : foldText(String(v ?? ''))

/** Ids back to the names the data file is written in. */
function named(field: LeadAiFillField, value: LeadAiFillValue, lists: IndustryLists): unknown {
  const name = (id: string) =>
    [...lists.categories, ...lists.industries].find((e) => e.id === id)?.name ?? id
  if (field === 'category') return name(value as string)
  return field === 'industries' ? (value as string[]).map(name) : value
}

/** Estimate: both prompts and each case's two user messages (lists included) at
 *  ~4 chars a token, plus a grounding guess; out = the route's ceiling. */
async function estimate(db: Db, cases: Case[], lists: IndustryLists): Promise<void> {
  const leads = cases.length
  const [route] = await db.select().from(aiRoute).where(eq(aiRoute.task, 'lead-enrich'))
  if (!route) throw new Error('no lead-enrich route: migrate this database first')
  const [price] = await db
    .select()
    .from(aiPrice)
    .where(eq(aiPrice.model, route.primaryModel))
    .orderBy(desc(aiPrice.effectiveFrom))
    .limit(1)
  const system = renderPrompt(LEAD_IDENTIFY).system.length + renderPrompt(LEAD_SITE).system.length
  const user = cases.reduce((n, { draft: d }) => {
    const all = [...LeadAiFillField.options]
    const identify = M.identifyInput(d, M.mailDomain(d.email), all)
    return n + identify.length + M.siteInput(d, 'example.vn', null, all, lists).length
  }, 0)
  const tokensIn = (system + user / Math.max(leads, 1)) / 4 + 2 * GROUNDING_TOKENS_IN
  const tokensOut = 2 * route.maxTokensOut
  say(
    `${leads} lead(s) × 2 calls on ${route.primaryModel} (fallback ${route.fallbackModel ?? 'none'})`,
  )
  say(
    `Estimate per lead: ~${Math.round(tokensIn)} tokens in, up to ${tokensOut} out, before retries.`,
  )
  if (!price) return say('No ai_price row for that model: cost unknown.')
  const usd =
    (leads *
      (tokensIn * Number(price.inputUsdPerMTok) + tokensOut * Number(price.outputUsdPerMTok))) /
    1e6
  say(
    `Estimate ~$${usd.toFixed(2)} in tokens, plus each vendor's per-search fee (not in the ledger).`,
  )
}

/** What the ledger recorded for this run, by prompt and model. */
async function spent(db: Db, since: Date): Promise<void> {
  const rows = await db
    .select({
      prompt: aiCall.promptVersion,
      model: aiCall.model,
      calls: sql<number>`count(*)::int`,
      tokensIn: sql<number>`sum(${aiCall.tokensIn})::int`,
      tokensOut: sql<number>`sum(${aiCall.tokensOut})::int`,
    })
    .from(aiCall)
    .where(and(eq(aiCall.subjectCode, 'ai-eval'), gte(aiCall.at, since)))
    .groupBy(aiCall.promptVersion, aiCall.model)
  for (const r of rows) {
    say(`ledger ${r.prompt} ${r.model}: ${r.calls} call(s), ${r.tokensIn} in, ${r.tokensOut} out`)
  }
}

async function main(): Promise<void> {
  const cases = JSON.parse(readFileSync(FILE, 'utf8')) as Case[]
  const app = await NestFactory.createApplicationContext(AiEvalModule, {
    logger: ['error', 'warn'],
  })
  try {
    const kind = app.get<DbHandle>(DB_HANDLE).kind
    say(`Target: ${kind} · ${cases.length} case(s) from ${FILE}`)
    if (kind !== 'pglite' && !PROD) {
      process.exitCode = 1
      return say(
        'Refused: DATABASE_URL is not PGlite. The run writes ai_call rows; add --prod to mean it.',
      )
    }
    say(`Prompts: ${[LEAD_IDENTIFY, LEAD_SITE].map((p) => renderPrompt(p).prompt).join(', ')}`)
    const db = app.get<Db>(DB)
    const lists = await app.get(LeadAiFillRepository).industryLists()
    await estimate(db, cases, lists)
    if (!YES) return say('Nothing called. Add --yes to run.')

    const since = new Date()
    const enricher = app.get(LeadEnricher)
    const tally = new Map<LeadAiFillField, Tally>()
    const latency: number[] = []
    for (const [i, c] of cases.entries()) {
      const wanted = LeadAiFillField.options.filter((f) => f in c.expected)
      const started = Date.now()
      const found = await enricher.suggest(
        c.draft,
        wanted,
        { actorId: null, subjectCode: 'ai-eval', admitted: true },
        lists,
      )
      latency.push(Date.now() - started)
      for (const field of wanted) {
        const t = tally.get(field) ?? { asked: 0, filled: 0, right: 0, unsure: 0, sureWrong: 0 }
        const s = found[field]
        const right = !!s && norm(named(field, s.value, lists)) === norm(c.expected[field])
        t.asked += 1
        t.filled += s ? 1 : 0
        t.right += right ? 1 : 0
        t.unsure += s?.unsure ? 1 : 0
        t.sureWrong += s && !s.unsure && !right ? 1 : 0
        tally.set(field, t)
      }
      say(`  ${i + 1}/${cases.length} ${latency.at(-1)} ms`)
    }
    say('field          asked filled right  accuracy unsure  sure-but-wrong')
    for (const [field, t] of tally) {
      const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '-')
      say(
        `${field.padEnd(14)} ${String(t.asked).padStart(5)} ${String(t.filled).padStart(6)} ${String(t.right).padStart(5)}  ${pct(t.right, t.asked).padStart(8)} ${pct(t.unsure, t.filled).padStart(6)}  ${t.sureWrong}`,
      )
    }
    const sorted = [...latency].sort((a, b) => a - b)
    say(
      `latency ms: median ${sorted[Math.floor(sorted.length / 2)] ?? 0}, max ${sorted.at(-1) ?? 0}`,
    )
    await spent(db, since)
  } finally {
    await app.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
