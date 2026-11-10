import {
  ContractCode,
  DebriefListQuery,
  GetHistoryInput,
  LeadBookQuery,
  ObjectCode,
  OpportunityBookQuery,
  SearchQuery,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { ContractController } from '@api/branches/sales/contract/contract.controller'
import { LeadController } from '@api/branches/sales/lead/lead.controller'
import { OpportunityController } from '@api/branches/sales/opportunity/opportunity.controller'
import { SearchController } from '@api/branches/sales/search/search.controller'
import { ACCOUNT_LIST } from '@api/branches/sales/assistant/sales-assistant-tools'
import { NEED_KEY, type RouteNeed } from '@api/platform/access/need.decorator'
import { UNSURE } from '@api/platform/assistant/assistant-bind'
import type { ToolDoor } from '@api/platform/assistant/assistant-tools'
import { PvError } from '@api/platform/http/problem'
import { zod } from '@api/platform/http/zod.pipe'
import { CANARY } from './seed-data'
import type { Chain, Company } from './seed'
import type { World } from './world'

/** The oracle: what a person would get at the HTTP door, asked the way the door
 *  asks it. A tool call is compared with the UNION of the doors it opened: which
 *  doors come from the tool's registration, the need of each is read off its
 *  controller here, which of them may be refused without ending the call is pinned
 *  here too (`OPTIONAL_DOORS`), and the E2 instance is not the gate's. If the tool or
 *  its gate go wrong, this side does not go wrong with them.
 *
 *  It decides nothing itself, and a bug shared by a door and its tool passes here.
 *  That is what `scope-facts.ts` is for. */

export const PROBES = ['search', 'lead', 'opportunity', 'contract'] as const
export type Probe = (typeof PROBES)[number]

/** A door as a tool names it: the key is the tool's own, the pair is what it stands for. */
export type Opened = { key: string; door: ToolDoor }

/** The one door each probe's FACT is about, whatever else its tool call also reads. */
const HANDLERS: Record<Probe, Opened> = {
  search: { key: 'find', door: [SearchController, 'find'] },
  lead: { key: 'lead', door: [LeadController, 'profile'] },
  opportunity: { key: 'opportunity', door: [OpportunityController, 'profile'] },
  contract: { key: 'contract', door: [ContractController, 'profile'] },
}

/** `bodies` holds each opened door's answer under its `doorId`, in the order opened. */
export type DoorAnswer =
  | {
      ok: true
      json: string
      codes: string[]
      rows: number
      bodies: Readonly<Record<string, unknown>>
      /** Doors of the call that gave nothing: shut by E2, or an optional one refused at the service. */
      skipped: string[]
    }
  | { ok: false; reason: string; json: '' }

export const doorId = ([controller, handler]: ToolDoor): string => `${controller.name}.${handler}`

type Asked = { body: unknown; codes: string[] }

/** What a cell stands on: a chain of one lead, or the company over several. */
export type Subject = Chain | Company
type Ask = (world: World, who: Actor, on: Subject, input?: unknown) => Promise<Asked>

const chainOf = (on: Subject): Chain => {
  if (!('lead' in on)) throw new Error('oracle: this door is asked on a chain, not a company')
  return on
}

const companyOf = (on: Subject): Company => {
  if ('lead' in on) throw new Error('oracle: this door is asked on a company, not a chain')
  return on
}

/* The size the tool asks the deals of a lead with; the constant is private to the tool. */
const LEAD_DEALS = 20

/** The chains a company lists, as the seed knows them and not as its profile says. */
const liveChains = (world: World, company: Company): Chain[] =>
  company.live.map((key) => {
    const found = world.seeded.chains.get(key)
    if (!found) throw new Error(`oracle: no chain ${key}`)
    return found
  })

/** How each door is asked as a seat, for the records of a chain or a company. Keyed
 *  by the tool's own door key, because one controller method stands for two doors:
 *  the deals of a lead and the deals of a company are the same book asked two ways.
 *  A key missing from this table stops the run: a guess would pass a door nobody
 *  compared.
 *
 *  A company's profile door fences nothing, so what it shows is cut down to the
 *  company's own fields, and its leads and deals are asked at the book doors as the
 *  seat, with the codes the SEED says hang under it. */
const ASK: Record<string, Ask> = {
  find: async (world, who, on) => {
    /* The same query the HTTP layer parses from `?q=&kinds=`, spelled out here. */
    const q = zod(SearchQuery).transform({
      q: chainOf(on).word,
      kinds: 'lead,opportunity,contract,account',
    })
    const body = await world.searches.search(who, q)
    return { body, codes: body.groups.flatMap((g) => g.hits).map((h) => h.code) }
  },
  lead: async (world, who, on) => {
    const body = await world.leads.profile(who, zod(ObjectCode).transform(chainOf(on).lead))
    return { body, codes: [body.code] }
  },
  opportunity: async (world, who, on) => {
    const body = await world.opportunities.profile(
      who,
      zod(ObjectCode).transform(chainOf(on).opportunity),
    )
    return { body, codes: [body.code] }
  },
  contract: async (world, who, on) => {
    const body = await world.contracts.profile(
      who,
      zod(ContractCode).transform(chainOf(on).contract ?? ''),
    )
    return { body, codes: [body.code] }
  },
  /* The book is asked for the deals of the chain's lead, as the lead read asks it. */
  leadDeals: async (world, who, on) => {
    const q = zod(OpportunityBookQuery).transform({ leadCode: chainOf(on).lead, size: LEAD_DEALS })
    const body = await world.opportunities.book(who, q)
    return { body, codes: body.rows.map((r) => r.code) }
  },
  /* The history doors take the record from the call itself: one tool, two kinds of record. */
  leadTouches: async (world, who, _on, input) => {
    const code = zod(ObjectCode).transform(GetHistoryInput.parse(input).code)
    return { body: await world.leads.touches(who, code), codes: [code] }
  },
  dealTouches: async (world, who, _on, input) => {
    const code = zod(ObjectCode).transform(GetHistoryInput.parse(input).code)
    return { body: await world.opportunities.touches(who, code), codes: [code] }
  },
  comms: async (world, who, _on, input) => {
    const subjectCode = zod(ObjectCode).transform(GetHistoryInput.parse(input).code)
    const q = zod(DebriefListQuery).transform({ subjectCode })
    return { body: await world.debriefs.list(who, q), codes: [] }
  },
  leadMeetings: async (world, who, _on, input) => {
    const code = zod(ObjectCode).transform(GetHistoryInput.parse(input).code)
    return { body: await world.leads.meetingList(who, code), codes: [] }
  },
  dealMeetings: async (world, who, _on, input) => {
    const code = zod(ObjectCode).transform(GetHistoryInput.parse(input).code)
    return { body: await world.opportunities.meetingList(who, code), codes: [] }
  },
  account: async (world, _who, on) => {
    const { code } = companyOf(on)
    const profile = await world.accounts.profile(zod(ObjectCode).transform(code))
    const body = { ...profile, leadRows: [], dealRows: [], contactRows: [] }
    return { body, codes: [profile.code] }
  },
  /* Every state: the seed's signed leads are converted, and the default book hides them. */
  accountLeads: async (world, who, on) => {
    const codes = liveChains(world, companyOf(on)).map((c) => c.lead)
    const q = zod(LeadBookQuery).transform({
      codes: codes.join(','),
      state: 'all',
      size: ACCOUNT_LIST,
    })
    const body = await world.leads.book(who, q)
    return { body, codes: body.rows.map((r) => r.code) }
  },
  accountDeals: async (world, who, on) => {
    const chains = liveChains(world, companyOf(on))
    const codes = chains.flatMap((c) => [
      c.opportunity,
      ...(c.strangerDeal ? [c.strangerDeal.code] : []),
    ])
    const q = zod(OpportunityBookQuery).transform({ codes: codes.join(','), size: ACCOUNT_LIST })
    const body = await world.opportunities.book(who, q)
    return { body, codes: body.rows.map((r) => r.code) }
  },
}

/** `AccessGuard`'s lookup: the handler first, then its class. */
export function needOf([controller, handler]: ToolDoor): RouteNeed {
  const method = (controller.prototype as unknown as Record<string, object>)[handler] as object
  const need = (Reflect.getMetadata(NEED_KEY, method) ??
    Reflect.getMetadata(NEED_KEY, controller)) as RouteNeed | undefined
  if (!need) throw new Error(`oracle: ${controller.name}.${handler} declares no need`)
  return need
}

/** What the service says to a seat E2 let through: an answer, or the status of a refusal. */
async function askOne(
  world: World,
  who: Actor,
  { key, door }: Opened,
  on: Subject,
  input?: unknown,
) {
  const ask = ASK[key]
  if (!ask) throw new Error(`oracle: no way to ask ${key} (${doorId(door)}) as a seat (see ASK)`)
  try {
    return { ok: true as const, ...(await ask(world, who, on, input)) }
  } catch (error) {
    const status = error instanceof PvError ? error.getStatus() : null
    if (status === 403 || status === 404) return { ok: false as const, reason: String(status) }
    throw error
  }
}

/** The doors each tool may lose without failing the call, as the oracle holds them.
 *  Not read off the registration: a door slipped into `optional` would turn a refusal
 *  into a quiet gap in every cell. `optionalDrift` names where the two differ. */
export const OPTIONAL_DOORS: Readonly<Record<string, readonly string[]>> = {
  get_history: ['comms', 'leadMeetings', 'dealMeetings'],
}

export function optionalDrift(tools: readonly { name: string; optional: readonly string[] }[]) {
  const key = (list: readonly string[]) => [...list].sort().join(',')
  const known = Object.entries(OPTIONAL_DOORS).flatMap(([name, want]) => {
    const tool = tools.find((t) => t.name === name)
    if (!tool) return [`${name} is pinned and not registered`]
    return key(tool.optional) === key(want)
      ? []
      : [`${name}: optional [${key(tool.optional)}], pinned [${key(want)}]`]
  })
  const unpinned = tools
    .filter((t) => t.optional.length > 0 && !(t.name in OPTIONAL_DOORS))
    .map((t) => `${t.name}: optional [${key(t.optional)}] and no pin`)
  return [...known, ...unpinned]
}

/** What a tool registers beside its doors: the ones whose refusal it reports itself,
 *  and the input its call carried. */
type Asking = { optional?: readonly string[]; input?: unknown }

/** The union of what `doors` hand this seat. Refused when E2 shuts every door, or
 *  when any door E2 opened refuses at the service: the gate fails a whole call on
 *  one thrown refusal and runs on over the doors E2 skipped. A door that merely
 *  returns fewer rows is no refusal, and what it hides stays out of the union.
 *
 *  A tool with `optional` doors is read as that tool reads itself: a door it does not
 *  list is primary, and shut or refused it ends the call; a listed one that is shut
 *  or refused is left out and shows in `skipped`, with the call still `ok`. */
async function askDoors(
  world: World,
  who: Actor,
  doors: readonly Opened[],
  on: Subject,
  { optional = [], input }: Asking = {},
) {
  const soft = new Set(optional)
  const checks = doors.map((named) => ({
    named,
    verdict: world.doorAccess.check(who, needOf(named.door)),
  }))
  const shut = checks.flatMap((c) => (c.verdict.ok ? [] : [c.verdict.reason]))
  if (shut.length === checks.length) {
    return { ok: false as const, reason: shut[0] ?? '', json: '' as const }
  }
  const primary = checks.find((c) => !c.verdict.ok && soft.size > 0 && !soft.has(c.named.key))
  if (primary && !primary.verdict.ok) {
    return { ok: false as const, reason: primary.verdict.reason, json: '' as const }
  }
  const bodies: Record<string, unknown> = {}
  const codes: string[] = []
  const skipped: string[] = []
  for (const { named, verdict } of checks) {
    if (!verdict.ok) {
      skipped.push(named.key)
      continue
    }
    const got = await askOne(world, who, named, on, input)
    if (!got.ok && soft.has(named.key)) {
      skipped.push(named.key)
      continue
    }
    if (!got.ok) return { ok: false as const, reason: got.reason, json: '' as const }
    bodies[doorId(named.door)] = got.body
    codes.push(...got.codes)
  }
  const json = JSON.stringify(Object.values(bodies))
  return { ok: true as const, json, codes, rows: codes.length, bodies, skipped }
}

/** One door, the one `probe` stands for: what a fact is about. */
export const askDoor = (
  world: World,
  who: Actor,
  probe: Probe,
  chain: Chain,
): Promise<DoorAnswer> => askDoors(world, who, [HANDLERS[probe]], chain)

/** What a tool call's doors hand this seat: the doors are the ones the tool's own
 *  registration names for this input, so a tool added later is compared with no new
 *  code here. */
export function askCall(
  world: World,
  who: Actor,
  call: { name: string; input: unknown },
  on: Subject,
): Promise<DoorAnswer> {
  const tool = world.tools.find((t) => t.name === call.name)
  const prepared = tool?.prepare(call.input)
  if (!tool || !prepared?.ok) throw new Error(`oracle: ${call.name} does not take this input`)
  const doors = prepared.doorKeys.map((key): Opened => {
    const door = tool.doors[key]
    if (!door) throw new Error(`oracle: ${call.name} names no door for ${key}`)
    return { key, door }
  })
  return askDoors(world, who, doors, on, { optional: OPTIONAL_DOORS[call.name], input: call.input })
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
