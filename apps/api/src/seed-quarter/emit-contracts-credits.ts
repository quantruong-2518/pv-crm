import { isSellerRole, type ContractCredit, type RoleId } from '@pv/contracts'
import type { Ctx } from './types'

/** The credit split of one signature, shared by the sign request that carries it
 *  and the contract it creates, so the two always agree. Drawn from a hash of the
 *  journey key, not from `ctx.rng`: the deals and contracts emitters have their
 *  own streams and would otherwise disagree. The door's rules (ADR 0155): 2-3
 *  people, the closer always in, the others sellers, shares sum to 10 000. */

/** Closer 60-85 %, the rest to one or two other sellers on the deal. */
const SPLITS: number[][] = [
  [7000, 3000],
  [8500, 1500],
  [6000, 2500, 1500],
]

const SPLIT_PERCENT = 30

function hashOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** `lane` is the deal's people in lane order; only sellers other than the closer can share. */
export function creditsOf(
  ctx: Ctx,
  key: string,
  closer: string,
  lane: readonly string[],
): ContractCredit[] | undefined {
  const others = [...new Set(lane)].filter(
    (id) =>
      id !== closer && isSellerRole(ctx.world.actors.get(id)?.roleIds as RoleId[] | undefined),
  )
  const h = hashOf(key)
  if (others.length === 0 || h % 100 >= SPLIT_PERCENT) return undefined
  const fits = SPLITS.filter((s) => s.length - 1 <= others.length)
  const shares = fits[(h >>> 8) % fits.length]!
  const people = [closer, ...others.slice(0, shares.length - 1)]
  return shares.map((shareBp, i) => ({ actorId: people[i]!, shareBp }))
}
