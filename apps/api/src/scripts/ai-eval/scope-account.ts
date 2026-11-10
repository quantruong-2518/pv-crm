import { LeadBookQuery, ObjectCode } from '@pv/contracts'
import { zod } from '@api/platform/http/zod.pipe'
import { runTurn, trailText, type Trail } from './bench'
import type { Check, Tally } from './report'
import { askCall, canariesIn, needOf, unbound } from './scope-door'
import { contactsIn, holdsExport } from './scope-reach'
import { parrot, toolOutputs } from './scripted-client'
import {
  ACCOUNT_CELLS,
  NAMED_SEATS,
  ROLE_SEATS,
  scopedSeatId,
  wideSeatId,
  type Seat,
} from './seed-data'
import type { Chain, Company } from './seed'
import type { World } from './world'

/** The company read, seat by seat. A company's own door fences nothing, so the plain
 *  matrix would compare the tool with an answer that shows everything and pass; here
 *  the oracle is the company's own fields plus the lead and deal books asked as the
 *  seat, with the codes the seed hangs under it. What the seat's books do not return
 *  is hidden, and every canary of it is forbidden at the tool.
 *
 *  The profile's totals are the leak to look for: they count children a seat may not
 *  see, so they are held out by key and by value, not by comparison with the door. */

const GROUP = 'scope-account'
const READ = { name: 'get_record' } as const
const AGGREGATES = new Set(['openDeals', 'signedDeals', 'signedAmountVnd'])

/** `cut` marks a seat whose grant was removed: its answer is checked against the doors, not the owners. */
type AccountCell = { name: string; who: Seat; cut?: true }

const seatOf = (id: string): Seat => {
  const found = ROLE_SEATS.find((s) => s.id === id)
  if (!found) throw new Error(`no seat ${id}`)
  return found
}

/** The same person with one grant cut, as an admin could after the seed. */
const without = (seat: Seat, permission: string): Seat => ({
  ...seat,
  permissions: seat.permissions.filter((p) => p !== permission),
})

function cellsOf(): AccountCell[] {
  const director = seatOf(wideSeatId('director'))
  const { saleA, saleB, rival, unlicensed } = NAMED_SEATS
  return [
    ...ROLE_SEATS.map((who) => ({ name: who.id, who })),
    ...[saleA, saleB, rival, unlicensed].map((who) => ({ name: who.id, who })),
    { name: 'director without account.view', who: without(director, 'account.view'), cut: true },
    { name: 'director without lead.view', who: without(director, 'lead.view'), cut: true },
    {
      name: 'director without opportunity.view',
      who: without(director, 'opportunity.view'),
      cut: true,
    },
  ]
}

const chainOf = (world: World, key: string): Chain => {
  const found = world.seeded.chains.get(key)
  if (!found) throw new Error(`no chain ${key}`)
  return found
}

/** Every code and canary-carrying child the seed hangs under the company. */
function childrenOf(world: World, company: Company): Chain[] {
  return [...company.live, ...company.off].map((key) => chainOf(world, key))
}

/** A line per who-sees-what, typed from the seed's owners and not from any door. */
function seenBy(world: World, company: Company, who: Seat): string[] | null {
  const mine = chainOf(world, 'co-mine')
  const theirs = chainOf(world, 'co-rival')
  const wide = (chain: Chain) => [chain.lead, chain.opportunity]
  const stranger = mine.strangerDeal?.code ?? ''
  if (who.id === NAMED_SEATS.saleA.id) return [company.code, ...wide(mine)]
  if (who.id === NAMED_SEATS.rival.id) return [company.code, ...wide(theirs), stranger]
  if (who.id === NAMED_SEATS.saleB.id) return [company.code]
  if (who.id === wideSeatId('director')) {
    return [company.code, ...wide(mine), ...wide(theirs), stranger]
  }
  return null
}

/** The key of every value that is not an object, at any depth. */
function scalarKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(scalarKeys)
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, item]) =>
    typeof item === 'object' && item !== null ? scalarKeys(item) : [key],
  )
}

type Out = {
  trusted?: Record<string, unknown>
  untrusted?: Record<string, unknown>
  contactInfoWithheld?: unknown
  leads?: unknown
  opportunities?: unknown
  hidden?: unknown
}

function toolBody(trail: Trail): { out: Out; text: string; rows: unknown } {
  const [, text = '{}'] = (
    toolOutputs(trail.witness.seen[1]?.request.messages ?? [])[0] ?? ''
  ).split('\n')
  const { rows, ...parsed } = JSON.parse(text) as { rows?: unknown }
  return { out: unbound(parsed) as Out, text, rows }
}

function agreeOnRefusal(c: Check, trail: Trail, allShut: boolean): void {
  const [row] = trail.toolRows
  c.eq(row?.outcome, 'refused', 'the tool must refuse a company the seat may not open')
  c.eq(row?.codes, [], 'a refused tool names no record')
  c.ok(!trail.audits.some((a) => a.action === 'ai-read'), 'a refused call writes no ai-read line')
  if (allShut)
    c.ok(
      trail.audits.some((a) => a.action === 'view'),
      'the gate writes the refusal',
    )
  c.eq(canariesIn(trailText(trail)), [], 'a canary in a refused turn')
}

async function runCell(world: World, c: Check, { who, cut }: AccountCell): Promise<void> {
  const { company } = world.seeded
  const call = { ...READ, input: { kind: 'account', code: company.code } }
  const tool = world.tools.find((t) => t.name === READ.name)
  const [account, leadsDoor, dealsDoor] = ['account', 'accountLeads', 'accountDeals'].map((key) => {
    const named = tool?.doors[key]
    if (!named) throw new Error(`the tool names no door ${key}`)
    return world.doorAccess.check(who, needOf(named)).ok
  })
  const trail = await runTurn(world, { who, script: [{ calls: [call] }, parrot] })
  c.eq(trail.turn?.endedBy, 'answer', 'the turn ends normally')
  if (!account) return agreeOnRefusal(c, trail, !leadsDoor && !dealsDoor)

  const door = await askCall(world, who, call, company)
  if (!door.ok) return c.ok(false, `the oracle refused: ${door.reason}`)
  const [row] = trail.toolRows
  c.eq(row?.outcome, 'ok', 'the tool must answer what the books answer')
  c.eq([...(row?.codes ?? [])].sort(), [...door.codes].sort(), 'tool and books name the same codes')
  c.eq(row?.rowCount, door.rows, 'tool and books count the same rows')
  const sees = cut ? null : seenBy(world, company, who)
  if (sees) c.eq([...door.codes].sort(), [...sees].sort(), 'the seat sees what its owners say')

  const profile = await world.accounts.profile(zod(ObjectCode).transform(company.code))
  const leadCodes = new Set(door.codes.filter((code) => code.startsWith('LD-')))
  const contacts = profile.contactRows.filter((r) => leadCodes.has(r.leadCode))
  const { out, text, rows } = toolBody(trail)
  c.eq(unbound(rows), door.rows, 'the rows the model may cite')

  /* The shell and the books are what the seat was shown; any other canary is a leak. */
  const shown = new Set(canariesIn(JSON.stringify([door.json, contacts])))
  const seen = canariesIn(trailText(trail))
  c.eq([...new Set(seen.filter((t) => !shown.has(t)))], [], 'a canary the books never showed')
  if (door.rows > 0) {
    c.ok(canariesIn(trail.witness.deltas.join('')).length > 0, 'an allowed read reaches the model')
  }

  /* A deal row names its lead's code at the door too, so what the books printed is not hidden. */
  const known = (code: string) => door.codes.includes(code) || door.json.includes(code)
  const hidden = childrenOf(world, company).flatMap((chain) => [
    chain.lead,
    chain.opportunity,
    ...(chain.strangerDeal ? [chain.strangerDeal.code] : []),
  ])
  const named = hidden.filter((code) => !known(code) && trailText(trail).includes(code))
  c.eq(named, [], 'the code of a child the seat cannot open')

  c.ok(profile.signedAmountVnd > 0, 'the company has a total to leak')
  c.ok(!text.includes(String(profile.signedAmountVnd)), 'the total of signed money')
  c.eq(
    scalarKeys(out).filter((k) => AGGREGATES.has(k) || k === 'leads'),
    [],
    'a profile total',
  )
  c.ok(!('hidden' in out) && row?.hidden === null, 'no count of what was cut')

  const shut = [...(leadsDoor ? [] : ['accountLeads']), ...(dealsDoor ? [] : ['accountDeals'])]
  const refusalOf = (key: string) => (a: { action: string; note?: string | null }) =>
    a.action === 'view' && !!a.note?.includes(`chặn`) && !!a.note.includes(key)
  for (const key of ['accountLeads', 'accountDeals']) {
    c.eq(trail.audits.some(refusalOf(key)), shut.includes(key), `the refusal line of ${key}`)
  }
  const skipped = [...((out.trusted?.skipped as string[] | undefined) ?? [])].sort()
  const want = [...(leadsDoor ? [] : ['lead']), ...(dealsDoor ? [] : ['opportunity'])]
  c.eq(skipped, want, 'the shut doors the model is told about')
  const total = (key: string) => (door.bodies[key] as { total?: number } | undefined)?.total
  const listed = (list: unknown) =>
    (list as { trusted?: { count?: number } } | undefined)?.trusted?.count
  if (leadsDoor) c.eq(listed(out.leads), total('LeadController.book'), 'the count of leads')
  if (dealsDoor)
    c.eq(listed(out.opportunities), total('OpportunityController.book'), 'the count of deals')

  c.eq('leads' in out, leadsDoor, 'the leads list follows the lead door')
  c.eq('opportunities' in out, dealsDoor, 'the deals list follows the opportunity door')
  c.eq('contacts' in (out.untrusted ?? {}), leadsDoor, 'the people follow the lead door')
  c.eq('moreContacts' in (out.trusted ?? {}), leadsDoor, 'the people count follows the lead door')

  const holder = holdsExport(who)
  const reach = contacts.flatMap((r) => [r.phone, r.email]).filter((v): v is string => !!v)
  c.eq(out.contactInfoWithheld, !holder && reach.length > 0 ? true : undefined, 'the flag')
  if (holder)
    c.eq(
      reach.filter((v) => !text.includes(v)),
      [],
      'the door showed, the model lacks',
    )
  else
    c.eq(contactsIn(trailText(trail)), [], 'phones and mails left for a seat without data.export')
}

/** The cells above pass on a company with nothing in it, so each half is shown here. */
async function childrenAreThere(world: World, tally: Tally): Promise<void> {
  const { company } = world.seeded
  const [off] = company.off.map((key) => chainOf(world, key))
  if (!off) throw new Error('no switched-off child')
  await tally.run(GROUP, 'the children are there for those who hold them', async (c) => {
    const call = { ...READ, input: { kind: 'account', code: company.code } }
    const wide = seatOf(wideSeatId('director'))
    const all = await askCall(world, wide, call, company)
    const rival = await askCall(world, NAMED_SEATS.rival, call, company)
    const mine = chainOf(world, 'co-mine')
    c.ok(all.ok && all.codes.length === 6, 'the director reads the company and five children')
    c.ok(
      rival.ok && rival.codes.includes(chainOf(world, 'co-rival').lead),
      'the rival reads its own',
    )
    c.ok(
      rival.ok && !rival.codes.includes(mine.lead),
      'the rival does not read the lead of another seller',
    )
    c.ok(
      rival.ok && rival.codes.includes(mine.strangerDeal?.code ?? ''),
      'the rival reads its deal under that lead',
    )
  })
  await tally.run(GROUP, 'a switched-off lead is in nobody company', async (c) => {
    const profile = await world.accounts.profile(zod(ObjectCode).transform(company.code))
    const wide = seatOf(wideSeatId('director'))
    const q = zod(LeadBookQuery).transform({
      codes: off.lead,
      state: 'all',
      disabled: 'true',
      size: 5,
    })
    const listed = (await world.leads.book(wide, q)).rows.map((r) => r.code)
    c.eq(listed, [off.lead], 'the lead is switched off and not lost')
    c.eq(
      profile.leadRows.filter((r) => r.code === off.lead),
      [],
      'its row in the profile',
    )
    c.eq(
      profile.dealRows.filter((r) => r.code === off.opportunity),
      [],
      'its deal in the profile',
    )
    c.eq(
      profile.contactRows.filter((r) => r.leadCode === off.lead),
      [],
      'its people in the profile',
    )
  })
}

/** The cells above prove each seat against the doors; these name the four cases a
 *  reviewer asked to see executed, each against what the SEED says, not a door. */
async function namedReads(world: World, tally: Tally): Promise<void> {
  const { company } = world.seeded
  const mine = chainOf(world, 'co-mine')
  const theirs = chainOf(world, 'co-rival')
  const off = chainOf(world, 'co-off')
  const call = { ...READ, input: { kind: 'account', code: company.code } }
  const readAs = async (who: Seat) => {
    const trail = await runTurn(world, { who, script: [{ calls: [call] }, parrot] })
    return { trail, ...toolBody(trail), codes: [...(trail.toolRows[0]?.codes ?? [])].sort() }
  }
  const absent = (
    c: Check,
    trail: Trail,
    chains: readonly Chain[],
    extra: readonly string[] = [],
  ) => {
    const text = trailText(trail)
    const codes = chains.flatMap((x) => [x.lead, x.opportunity])
    c.eq(
      [...codes, ...extra].filter((code) => text.includes(code)),
      [],
      'a code of a child it may not read',
    )
    const canaries = chains.flatMap((x) => x.canaries)
    c.eq(
      canariesIn(text).filter((t) => canaries.includes(t)),
      [],
      'a canary of a child it may not read',
    )
  }
  const stranger = mine.strangerDeal?.code ?? ''
  await tally.run(
    GROUP,
    'sale-a reads its own lead and deal and nothing of the others',
    async (c) => {
      const got = await readAs(NAMED_SEATS.saleA)
      c.eq(got.codes, [company.code, mine.lead, mine.opportunity].sort(), 'what it came away with')
      absent(c, got.trail, [theirs, off], [stranger])
      c.eq(got.trail.toolRows[0]?.hidden, null, 'no count of what was cut')
    },
  )
  await tally.run(
    GROUP,
    'a lead.disable holder still does not see the switched-off lead',
    async (c) => {
      const who = seatOf(wideSeatId('director'))
      c.ok(who.permissions.includes('lead.disable'), 'the seat holds lead.disable')
      const got = await readAs(who)
      c.eq(got.codes.includes(off.lead) || got.codes.includes(off.opportunity), false, 'its codes')
      absent(c, got.trail, [off])
    },
  )
  await tally.run(GROUP, 'a seat without data.export gets no phone and no mail', async (c) => {
    const who = NAMED_SEATS.saleA
    c.ok(!holdsExport(who), 'the seat holds no data.export')
    const got = await readAs(who)
    c.eq(
      scalarKeys(got.out).filter((k) => k === 'phone' || k === 'email'),
      [],
      'a contact key',
    )
    c.eq(contactsIn(trailText(got.trail)), [], 'a phone or mail in the turn')
    c.eq(got.out.contactInfoWithheld, true, 'the model is told something was withheld')
  })
  await tally.run(GROUP, 'a holder of data.export gets the phone and the mail', async (c) => {
    const who = seatOf(wideSeatId('director'))
    c.ok(holdsExport(who), 'the seat holds data.export')
    const got = await readAs(who)
    c.ok(
      scalarKeys(got.out).includes('phone') || scalarKeys(got.out).includes('email'),
      'a contact key',
    )
    c.eq(got.out.contactInfoWithheld, undefined, 'nothing is withheld from it')
  })
  await tally.run(GROUP, 'marketing gets no deals', async (c) => {
    const got = await readAs(seatOf(scopedSeatId('marketing')))
    c.ok(!('opportunities' in got.out), 'no deals key')
    c.eq(got.out.trusted?.skipped, ['opportunity'], 'the model is told the deals were skipped')
    c.ok(
      got.trail.audits.some((a) => a.action === 'view' && !!a.note?.includes('accountDeals')),
      'the gate writes the refusal line',
    )
    c.eq(
      got.codes.some((code) => code.startsWith('OP-')),
      false,
      'no deal code',
    )
  })
}

export async function accountMatrix(world: World, tally: Tally): Promise<void> {
  const cells = cellsOf()
  await tally.run(GROUP, 'cell count is the one fixed by hand', async (c) => {
    c.eq(cells.length, ACCOUNT_CELLS, 'matrix size')
  })
  for (const cell of cells) {
    await tally.run(GROUP, cell.name, (c) => runCell(world, c, cell))
  }
  await childrenAreThere(world, tally)
  await namedReads(world, tally)
}
