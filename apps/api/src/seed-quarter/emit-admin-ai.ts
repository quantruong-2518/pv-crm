import type { AiTask, LeadAiFillField, LeadAiJobResult } from '@pv/contracts'
import { sql } from 'drizzle-orm'
import { leadAiJob } from '@api/branches/sales/lead/lead-ai-job.schema'
import { aiCall } from '@api/platform/ai/ai-cost.schema'
import type { Db } from '@api/platform/db/db.module'
import { dayOf, vnAt } from './clock'
import { rowsOf } from './emit-admin-ring'
import { WINDOW_START } from './params'
import type { Rng } from './rng'
import type { AssistantLedger } from './emit-admin-assistant'
import type { Ctx } from './types'

/** The AI ledger. Jobs are terminal and finished inside the last 20 hours: the
 *  sweeper deletes a finished job after 24, and a seed older than that would
 *  be gone before anyone looked. Models come from `platform.ai_route`. */

const HOUR = 3_600_000

export type Routes = Map<string, string>

export async function readRoutes(tx: Db): Promise<Routes> {
  const rows = await rowsOf<{ task: string; model: string }>(
    tx,
    sql`SELECT task, primary_model AS model FROM platform.ai_route`,
  )
  return new Map(rows.map((r) => [r.task, r.model]))
}

export const modelOf = (routes: Routes, task: string): string => {
  const own = routes.get(task) ?? routes.get('lead-scan') ?? routes.get('assistant')
  if (!own) throw new Error(`admin: platform.ai_route has no row to take a model from for ${task}`)
  return own
}

type Job = typeof leadAiJob.$inferInsert
type Calls = (typeof aiCall.$inferInsert)[]

const FAILED = [
  { kind: 'busy', error: 'AI đang bận nên chưa điền gì.' },
  { kind: 'failed', error: 'Có lỗi nên chưa điền gì.' },
] as const

/** Only fields the lead row holds, so Undo has nothing to take back. */
function resultOf(lead: Ctx['plan']['lead'][number]): LeadAiJobResult {
  const domain = lead.email?.split('@')[1]
  const pairs: [LeadAiFillField, string | number | null | undefined, string][] = [
    ['legalName', lead.legalName, 'tax-registry'],
    ['address', lead.address, 'tax-registry'],
    ['province', lead.province, 'tax-registry'],
    ['mainProduct', lead.mainProduct, domain ? `https://${domain}/` : 'email-domain'],
    ['sizeBand', lead.sizeBand, 'email-domain'],
  ]
  const filled = pairs.flatMap(([field, value, source]) =>
    value ? [{ field, value, source, unsure: field === 'sizeBand' }] : [],
  )
  return { filled, conflicts: [], notFound: filled.length < 3 ? ['website'] : [] }
}

export function leadJobs(ctx: Ctx, rng: Rng, routes: Routes): { jobs: Job[]; calls: Calls } {
  const pool = ctx.plan.lead.filter((l) => l.ownerId && !l.disabledAt)
  const seen = new Set<string>()
  const jobs: Job[] = []
  const calls: Calls = []
  const make = (done: boolean): void => {
    const lead = rng.pick(pool)
    if (seen.has(lead.code)) return
    seen.add(lead.code)
    const finishedAt = new Date(ctx.now.getTime() - rng.real(0.5, 19.5) * HOUR)
    const stepMs = Array.from({ length: done ? 5 : rng.int(0, 3) }, () => rng.int(400, 9000))
    const total = stepMs.reduce((n, m) => n + m, 0) + rng.int(500, 3000)
    const createdAt = new Date(finishedAt.getTime() - total - rng.int(1, 4) * 1000)
    const fail = rng.pick(FAILED)
    jobs.push({
      id: rng.uuid(),
      leadCode: lead.code,
      actorId: lead.ownerId!,
      state: done ? 'DONE' : 'FAILED',
      step: stepMs.length,
      stepMs: sql`${JSON.stringify(stepMs)}::jsonb` as never,
      result: done ? resultOf(lead) : null,
      errorKind: done ? null : fail.kind,
      error: done ? null : fail.error,
      createdAt,
      startedAt: new Date(createdAt.getTime() + rng.int(1, 3) * 1000),
      finishedAt,
    })
    calls.push({
      at: finishedAt,
      task: 'lead-enrich',
      model: modelOf(routes, 'lead-enrich'),
      tokensIn: rng.int(2500, 9000),
      tokensOut: done ? rng.int(300, 1200) : 0,
      outcome: done ? 'ok' : 'error',
      actorId: lead.ownerId,
      subjectCode: lead.code,
      latencyMs: total,
      promptVersion: 'lead-enrich@v2',
    })
  }
  const want = (n: number, done: boolean): void => {
    for (
      let guard = 0;
      guard < n * 20 && jobs.filter((j) => (j.state === 'DONE') === done).length < n;
      guard++
    )
      make(done)
  }
  want(10, true)
  want(2, false)
  return { jobs, calls }
}

const TASKS = [
  ['lead-scan', 18],
  ['lead-enrich', 12],
  ['comm-report', 22],
  ['comm-audio-report', 5],
] as const

const SIZE: Record<string, [number, number, number, number]> = {
  'lead-scan': [1500, 6000, 200, 900],
  'lead-enrich': [2500, 9000, 300, 1200],
  'comm-report': [3000, 14000, 400, 1500],
  'comm-audio-report': [4000, 16000, 500, 1600],
}

/** `room` more rows spread over the window: what `ADMIN.aiCalls` leaves after the chats and jobs. */
export function spreadCalls(ctx: Ctx, rng: Rng, routes: Routes, room: number): Calls {
  const seats = [...ctx.world.actors.keys()]
  const codes = ctx.plan.lead.map((l) => l.code)
  const first = Date.parse(`${WINDOW_START}T01:00:00Z`)
  const out: Calls = []
  for (let i = 0; i < room; i++) {
    const task = rng.weighted(TASKS) as AiTask
    const [inLo, inHi, outLo, outHi] = SIZE[task]!
    const day = dayOf(new Date(rng.real(first, ctx.now.getTime() - 2 * HOUR)))
    const at = new Date(
      Math.min(vnAt(day, rng.int(8, 18), rng.int(0, 59)).getTime(), ctx.now.getTime() - HOUR),
    )
    const tokensIn = Math.round(rng.logUniform(inLo, inHi))
    const bad = rng.chance(0.04)
    out.push({
      at,
      task,
      model: modelOf(routes, task),
      tokensIn,
      tokensOut: bad ? 0 : Math.round(rng.logUniform(outLo, outHi)),
      outcome: bad ? 'error' : 'ok',
      actorId: rng.pick(seats),
      subjectCode: rng.pick(codes),
      attempt: bad ? rng.int(1, 2) : 1,
      latencyMs: Math.round(rng.logUniform(900, 24000)),
      promptVersion: `${task}@v${rng.int(1, 3)}`,
      tokensCached: 0,
    })
  }
  return out
}

/** One row per round of a chat turn, tied to its message by `turn_id`. */
export function turnCalls(ledger: AssistantLedger, rng: Rng): Calls {
  return ledger.turns.flatMap((t) =>
    Array.from({ length: t.rounds }, (_, r) => {
      const tokensIn = rng.int(2200, 8000)
      const failed = t.failed
      return {
        at: t.at,
        task: 'assistant' as const,
        model: t.model,
        tokensIn,
        tokensOut: failed ? 0 : rng.int(120, 800),
        outcome: failed ? ('error' as const) : ('ok' as const),
        actorId: t.actorId,
        latencyMs: rng.int(1200, 9000),
        promptVersion: 'assistant@v14',
        turnId: t.messageId,
        round: r + 1,
        tokensCached: Math.round(tokensIn * rng.real(0, 0.6)),
      }
    }),
  )
}

export async function writeCalls(tx: Db, rows: Calls): Promise<void> {
  for (let i = 0; i < rows.length; i += 300) await tx.insert(aiCall).values(rows.slice(i, i + 300))
}

export async function writeJobs(tx: Db, rows: Job[]): Promise<void> {
  if (rows.length > 0) await tx.insert(leadAiJob).values(rows)
}
