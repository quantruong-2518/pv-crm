import { fxRate } from '@api/platform/fx/fx-rate.schema'
import type { Db } from '@api/platform/db/db.module'
import { addDays, dayOf, daysBetween } from './clock'
import { writeAssistant } from './emit-admin-assistant'
import {
  leadJobs,
  modelOf,
  readRoutes,
  spreadCalls,
  turnCalls,
  writeCalls,
  writeJobs,
} from './emit-admin-ai'
import { approvalBells, contractBells, dealBells } from './emit-admin-bells'
import { assertQuiet, markerBells } from './emit-admin-markers'
import { readAt, thin, writeBells, type Cand } from './emit-admin-ring'
import { holdBells, kpiBells, mailBells, stepBells } from './emit-admin-side'
import { ADMIN, CAST, WINDOW_START } from './params'
import type { AfterWrite, Ctx } from './types'

/** Bell history, worker markers, the AI ledger and the manual USD rates.
 *
 *  Nothing goes in the plan: every bell is read back from the rows the other
 *  emitters wrote, so serial ids and post-close edits are already settled. All
 *  of it is written in `afterWrite`, last, and ends by asking the worker's own
 *  selectors whether anything is left to ring. */

export function emitAdmin(_ctx: Ctx): void {}

/** One row per day up to YESTERDAY, a bounded walk inside the director's range.
 *  A manual row for today would make `FxRateSweeper` skip today's real fetch. */
async function writeFx(tx: Db, ctx: Ctx): Promise<number> {
  const rng = ctx.rng.fork('fx')
  const [lo, hi] = ADMIN.usdRate as [number, number]
  const today = dayOf(ctx.now)
  let rate = Math.round((lo + hi) / 2)
  const rows = Array.from({ length: daysBetween(WINDOW_START, today) }, (_, i) => {
    rate = Math.min(hi, Math.max(lo, rate + rng.int(-40, 40)))
    return {
      currency: 'USD',
      day: addDays(WINDOW_START, i),
      rate: String(rate),
      source: 'manual' as const,
      setBy: CAST.director,
    }
  })
  await tx.insert(fxRate).values(rows).onConflictDoNothing()
  return rows.length
}

export const afterWrite: AfterWrite = async (tx, ctx) => {
  const rng = ctx.rng.fork('admin')
  const deals = await dealBells(tx)
  const cands: Cand[] = [
    ...deals.cands,
    ...(await approvalBells(tx)),
    ...(await contractBells(tx, deals.owners)),
    ...(await holdBells(tx, ctx.now)),
    ...(await mailBells(tx)),
    ...(await kpiBells(tx)),
    ...(await stepBells(tx)),
  ]
  const readRng = rng.fork('read')
  await writeBells(tx, ctx, thin(cands, rng.fork('thin'), ctx.now), (c) =>
    readAt(c, readRng, ctx.now),
  )
  await writeBells(tx, ctx, await markerBells(tx, ctx), (c) => readAt(c, readRng, ctx.now))
  await writeFx(tx, ctx)

  const routes = await readRoutes(tx)
  const chats = await writeAssistant(tx, ctx, modelOf(routes, 'assistant'))
  const jobs = leadJobs(ctx, rng.fork('jobs'), routes)
  await writeJobs(tx, jobs.jobs)
  const fixed = [...turnCalls(chats, rng.fork('turns')), ...jobs.calls]
  const spread = spreadCalls(
    ctx,
    rng.fork('calls'),
    routes,
    Math.max(0, ADMIN.aiCalls - fixed.length),
  )
  await writeCalls(tx, [...fixed, ...spread])
  await assertQuiet(tx)
}
