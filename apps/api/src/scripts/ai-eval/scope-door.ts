import { ContractCode, ObjectCode, SearchQuery } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { ContractController } from '@api/branches/sales/contract/contract.controller'
import { LeadController } from '@api/branches/sales/lead/lead.controller'
import { OpportunityController } from '@api/branches/sales/opportunity/opportunity.controller'
import { SearchController } from '@api/branches/sales/search/search.controller'
import { NEED_KEY, type RouteNeed } from '@api/platform/access/need.decorator'
import { UNSURE } from '@api/platform/assistant/assistant-bind'
import { PvError } from '@api/platform/http/problem'
import { zod } from '@api/platform/http/zod.pipe'
import { CANARY } from './seed-data'
import type { Chain } from './seed'
import type { World } from './world'

/** The oracle: what a person would get at the HTTP door, asked the way the door
 *  asks it. The need is read off the controller here, not through the tool's own
 *  registration, and the E2 instance is not the gate's: if the tool or its gate go
 *  wrong, this side does not go wrong with them.
 *
 *  It decides nothing itself, and a bug shared by a door and its tool passes here.
 *  That is what `scope-facts.ts` is for. */

export const PROBES = ['search', 'lead', 'opportunity', 'contract'] as const
export type Probe = (typeof PROBES)[number]

const HANDLERS = {
  search: [SearchController, 'find'],
  lead: [LeadController, 'profile'],
  opportunity: [OpportunityController, 'profile'],
  contract: [ContractController, 'profile'],
} as const

export type DoorAnswer =
  | { ok: true; json: string; codes: string[]; rows: number }
  | { ok: false; reason: string; json: '' }

/** `AccessGuard`'s lookup: the handler first, then its class. */
function needOf(probe: Probe): RouteNeed {
  const [controller, handler] = HANDLERS[probe]
  const method = (controller.prototype as unknown as Record<string, object>)[handler] as object
  const need = (Reflect.getMetadata(NEED_KEY, method) ??
    Reflect.getMetadata(NEED_KEY, controller)) as RouteNeed | undefined
  if (!need) throw new Error(`oracle: ${controller.name}.${handler} declares no need`)
  return need
}

/** The same query the HTTP layer parses from `?q=&kinds=`, spelled out here. */
const searchOf = (word: string) =>
  zod(SearchQuery).transform({ q: word, kinds: 'lead,opportunity,contract' })

async function serviceAnswer(world: World, who: Actor, probe: Probe, chain: Chain) {
  switch (probe) {
    case 'search': {
      const result = await world.searches.search(who, searchOf(chain.word))
      const hits = result.groups.flatMap((g) => g.hits)
      return { body: result, codes: hits.map((h) => h.code) }
    }
    case 'lead': {
      const body = await world.leads.profile(who, zod(ObjectCode).transform(chain.lead))
      return { body, codes: [body.code] }
    }
    case 'opportunity': {
      const code = zod(ObjectCode).transform(chain.opportunity)
      const body = await world.opportunities.profile(who, code)
      return { body, codes: [body.code] }
    }
    case 'contract': {
      const code = zod(ContractCode).transform(chain.contract ?? '')
      const body = await world.contracts.profile(who, code)
      return { body, codes: [body.code] }
    }
  }
}

export async function askDoor(
  world: World,
  who: Actor,
  probe: Probe,
  chain: Chain,
): Promise<DoorAnswer> {
  const verdict = world.doorAccess.check(who, needOf(probe))
  if (!verdict.ok) return { ok: false, reason: verdict.reason, json: '' }
  try {
    const { body, codes } = await serviceAnswer(world, who, probe, chain)
    return { ok: true, json: JSON.stringify(body), codes, rows: codes.length }
  } catch (error) {
    const status = error instanceof PvError ? error.getStatus() : null
    if (status === 403 || status === 404) return { ok: false, reason: String(status), json: '' }
    throw error
  }
}

export const canariesIn = (text: string): string[] => [...text.matchAll(CANARY)].map((m) => m[0])

/* A canary's letters and then the marker: what the binder leaves of its digits (D3). */
const SHOWN_CANARY = new RegExp(`CNRY[A-Z]{2}${UNSURE.replace(/[[\]]/g, '\\$&')}`, 'g')

/** Canaries as an answer shows them once the model repeated them. */
export const shownCanariesIn = (text: string): string[] => text.match(SHOWN_CANARY) ?? []

const CITE = /^⟦v\d+⟧$/

/** A tool output without the binder's frame (D3): each `{ value, cite }` back to its
 *  value, each trusted `{ count, items }` back to its items. Throws on a cite that is
 *  not an id, so a frame cannot carry anything past the door comparison. */
export function unbound(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unbound)
  if (typeof value !== 'object' || value === null) return value
  const keys = Object.keys(value).sort().join(',')
  if (keys === 'cite,value') {
    const { cite, value: inner } = value as { cite: unknown; value: unknown }
    if (typeof cite !== 'string' || !CITE.test(cite)) throw new Error(`not an id: ${cite}`)
    return inner
  }
  if (keys === 'count,items') return unbound((value as { items: unknown }).items)
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unbound(item)]))
}

/** Every string, number and boolean under `value`, at any depth. */
export function leaves(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.flatMap(leaves)
  if (typeof value === 'object') return Object.values(value).flatMap(leaves)
  return [String(value)]
}
