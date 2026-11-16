import { CAMPAIGNS, SEED } from './params'
import { emptyIds } from './ids'
import { buildCompanies } from './companies'
import { EMITTERS } from './emitters'
import { generate } from './generate'
import { emptyPlan, type Mint } from './plan'
import { makeRng } from './rng'
import { dayOf } from './clock'
import type { Ctx, World } from './types'

/** A fresh context for one build pass. The entry builds twice (count codes,
 *  then draw them), and a fresh plan, ids and rng per pass is what makes the
 *  two passes agree. Emitters must never branch on a code's value or call
 *  `new Date()`: read `ctx.now` and `ctx.today`. */
export function newCtx(world: World, mint: Mint, now: Date): Ctx {
  return {
    plan: emptyPlan(),
    mint,
    world,
    now,
    today: dayOf(now),
    rng: makeRng(SEED),
    companies: [],
    partners: [],
    stories: [],
    ids: emptyIds(),
  }
}

/** Per-emitter context: same plan and ids, own random stream. */
export const scoped = (ctx: Ctx, key: string): Ctx => ({ ...ctx, rng: ctx.rng.fork(key) })

/** A member mailbox per cast seat: reuse the one the database has, else plan it.
 *  Done here, not by an emitter, so every message can name its sender. */
function seatIdentities(ctx: Ctx): void {
  const rng = ctx.rng.fork('identity')
  for (const a of ctx.world.actors.values()) {
    const found = ctx.world.seatIdentity.get(a.id)
    const id = found ?? rng.uuid()
    ctx.ids.identity.set(a.id, id)
    if (!found) {
      ctx.plan.identity.push({
        id,
        channel: 'email',
        address: a.email,
        side: 'member',
        actorId: a.id,
      })
    }
  }
}

/** Run order is fixed: companies, generate, then every emitter of `EMITTERS`.
 *  `only` runs just those emitters (canonical order kept); undefined = all. */
export function buildAll(ctx: Ctx, only?: readonly string[]): Ctx {
  for (const c of CAMPAIGNS) ctx.ids.campaign.set(c.key, ctx.mint('CP'))
  seatIdentities(ctx)
  const built = buildCompanies(ctx.rng.fork('companies:build'), ctx.world)
  ctx.companies = built.companies
  ctx.partners = built.partners
  ctx.stories = generate({ ...ctx, rng: ctx.rng.fork('generate') })
  for (const e of EMITTERS) if (!only || only.includes(e.key)) e.emit(scoped(ctx, e.key))
  return ctx
}
