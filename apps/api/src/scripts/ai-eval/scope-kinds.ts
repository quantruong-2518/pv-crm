import { AssistantSearchKind, HoldListQuery, ObjectCode, SearchQuery } from '@pv/contracts'
import { LeadController } from '@api/branches/sales/lead/lead.controller'
import { zod } from '@api/platform/http/zod.pipe'
import { agreeOnAnswer, agreeOnRefusal } from './scope-matrix'
import { runTurn, trailText } from './bench'
import type { Check, Tally } from './report'
import { askCall, canariesIn, needOf } from './scope-door'
import { chainOf, without } from './scope-customers-oracle'
import { parrot, toolOutputs } from './scripted-client'
import {
  canariesOf,
  KINDS_CELLS,
  NAMED_SEATS,
  ROLE_SEATS,
  wideSeatId,
  type Seat,
} from './seed-data'
import type { World } from './world'

/** The three record kinds and the three work lists that have a seat of their own in the
 *  seed, `kinds-sale`. An approval names no linked code: its link is a kind and a label. Each cell states what the SEED says the seat gets (`codes`, `rows`
 *  or a refusal), then holds the tool to the doors as every other matrix does; so a door
 *  and a tool that agree on nothing still fail, and an empty answer is told from a
 *  refusal by the cells that read the same list as its owner. */

const GROUP = 'scope-kinds'
const { kinds: owner, saleB } = NAMED_SEATS

const KIND_OF: Record<string, string> = { LD: 'lead', OP: 'opportunity', HĐ: 'contract' }

type Call = { name: string; input: Record<string, unknown> }
type Want = { codes: string[]; rows: number } | 'refused'
type KindsCell = { name: string; who: Seat; call: Call; want: Want }

const director = (): Seat => {
  const found = ROLE_SEATS.find((s) => s.id === wideSeatId('director'))
  if (!found) throw new Error('no director seat')
  return found
}

const record = (kind: string, code: string): Call => ({
  name: 'get_record',
  input: { kind, code },
})
const work = (kind: string): Call => ({ name: 'list_my_work', input: { kind } })

/** The grant a door asks for, read off its controller: a cell never names one by hand. */
function grantOf(world: World, call: Call, door: string): Seat {
  const tool = world.tools.find((t) => t.name === call.name)
  const named = tool?.doors[door]
  const permission = named && needOf(named).permission
  if (!permission) throw new Error(`${call.name} door ${door} asks no permission to cut`)
  return without(director(), permission as never)
}

function cellsOf(world: World): KindsCell[] {
  const { contact, campaign, workstream } = world.seeded.kinds
  const chain = chainOf(world, 'kinds-own')
  const wide = director()
  const one = (code: string, ...more: string[]) => ({
    codes: [code, ...more],
    rows: 1 + more.length,
  })
  const none: Want = { codes: [], rows: 0 }
  /* The deal is a row of the journey, counted and never named: its code is not stored. */
  const journey: Want = { codes: [workstream], rows: 2 }
  const kinds = [
    /* The contact names its lead too: that code is stored and re-checked as a lead. */
    ['contact', contact, { codes: [contact, chain.lead], rows: 1 } as Want],
    ['campaign', campaign, one(campaign)],
    ['workstream', workstream, journey],
  ] as const
  const records = kinds.flatMap(([kind, code, seen]) => {
    const call = record(kind, code)
    return [
      { name: `${kind} owner`, who: owner, call, want: seen },
      { name: `${kind} another seller`, who: saleB, call, want: 'refused' as const },
      { name: `${kind} director`, who: wide, call, want: seen },
      {
        name: `${kind} director without its grant`,
        who: grantOf(world, call, kind),
        call,
        want: 'refused' as const,
      },
    ]
  })
  const lists: KindsCell[] = [
    { name: 'approval owner', who: owner, call: work('approval'), want: { codes: [], rows: 1 } },
    { name: 'approval another seller', who: saleB, call: work('approval'), want: none },
    { name: 'approval director', who: wide, call: work('approval'), want: { codes: [], rows: 1 } },
    {
      name: 'approval director without the linked record',
      who: without(director(), 'lead.view'),
      call: work('approval'),
      want: { codes: [], rows: 1 },
    },
    { name: 'parked owner', who: owner, call: work('parked'), want: one(chain.lead) },
    { name: 'parked another seller', who: saleB, call: work('parked'), want: none },
    /* The door lists the hold; the tool keeps only the asker's own, and the director holds none. */
    { name: 'parked director', who: wide, call: work('parked'), want: none },
    {
      name: 'parked director without its grant',
      who: grantOf(world, work('parked'), 'hold'),
      call: work('parked'),
      want: 'refused',
    },
    { name: 'meeting owner', who: owner, call: work('meeting'), want: { codes: [], rows: 1 } },
    { name: 'meeting another seller', who: saleB, call: work('meeting'), want: none },
    { name: 'meeting director', who: wide, call: work('meeting'), want: none },
    {
      name: 'meeting director without its grant',
      who: grantOf(world, work('meeting'), 'meeting'),
      call: work('meeting'),
      want: 'refused',
    },
  ]
  return [...records, ...lists]
}

async function runCell(world: World, c: Check, { who, call, want }: KindsCell): Promise<void> {
  const chain = chainOf(world, 'kinds-own')
  const door = await askCall(world, who, call, chain)
  const trail = await runTurn(world, { who, script: [{ calls: [call] }, parrot] })
  c.eq(trail.turn?.endedBy, 'answer', 'the turn ends normally')
  if (want === 'refused') {
    c.ok(!door.ok, "the doors refuse what the seed says is not this seat's")
    agreeOnRefusal(c, door, trail)
    c.eq(canariesIn(trailText(trail)), [], 'a canary in a refused turn')
    return
  }
  if (!door.ok) return c.ok(false, `the oracle refused: ${door.reason}`)
  c.eq([...new Set(door.codes)].sort(), [...want.codes].sort(), 'the seed says these records')
  c.eq(door.rows, want.rows, 'the seed says this many rows')
  /* `more` is the tool's own cap flag, never door data; the seed is far under every cap.
     `kinds` is what the tool tells of an approval's link instead of its code. */
  const linked = [...door.json.matchAll(/"objectCode":"([A-Z]{2})-/g)].map(
    (m) => KIND_OF[m[1] ?? ''],
  )
  agreeOnAnswer(
    c,
    { ...door, json: JSON.stringify([JSON.parse(door.json), { more: false, kinds: linked }]) },
    trail,
    who,
  )

  const shown = new Set(canariesIn(door.json))
  const seen = canariesIn(trailText(trail))
  c.eq([...new Set(seen.filter((t) => !shown.has(t)))], [], 'a canary the doors never showed')
  if (want.rows > 0 && call.name === 'get_record') {
    c.ok(canariesIn(trail.witness.deltas.join('')).length > 0, 'an allowed read reaches the model')
  }
}

/** Facts a cell cannot show by itself: what the tool leaves out of a door's answer. */
async function namedFacts(world: World, tally: Tally): Promise<void> {
  const chain = chainOf(world, 'kinds-own')
  const canary = canariesOf(chain.n)
  await tally.run(
    GROUP,
    'the hold list of the director holds the hold the tool drops',
    async (c) => {
      const { rows } = await world.holds.list(director(), zod(HoldListQuery).transform({}))
      const found = rows.find((r) => r.code === chain.lead)
      c.eq(found?.holder?.id, owner.id, 'the door shows the hold, held by its owner')
      const trail = await runTurn(world, {
        who: director(),
        script: [{ calls: [work('parked')] }, parrot],
      })
      c.eq(trail.toolRows[0]?.rowCount, 0, 'the tool lists none of them')
      c.eq(trailText(trail).includes(canary.touchNote), false, 'the note of that hold')
    },
  )
  await tally.run(GROUP, 'the title of a meeting never reaches the model', async (c) => {
    const trail = await runTurn(world, {
      who: owner,
      script: [{ calls: [work('meeting')] }, parrot],
    })
    c.eq(trail.toolRows[0]?.rowCount, 1, 'the meeting is counted')
    c.eq(trailText(trail).includes(canary.meetingTitle), false, 'the title of the meeting')
    c.eq(trailText(trail).includes(chain.lead), false, 'the record the meeting is about')
  })
  await tally.run(
    GROUP,
    'an approver who cannot open the linked record keeps the row',
    async (c) => {
      const who = without(director(), 'lead.view')
      const need = needOf([LeadController, 'book'])
      c.eq(world.doorAccess.check(who, need).ok, false, 'the seat is shut out of the lead book')
      const trail = await runTurn(world, { who, script: [{ calls: [work('approval')] }, parrot] })
      c.eq(trail.toolRows[0]?.rowCount, 1, 'the approval is listed')
      c.eq(trail.toolRows[0]?.codes, [], 'no code of the linked record is stored')
      c.eq(trailText(trail).includes(chain.lead), false, 'the code of the linked record')
      const sent = toolOutputs(trail.witness.seen[1]?.request.messages ?? []).join('')
      c.ok(
        /"links":\{"count":.*?"items":\["lead"\]/.test(sent),
        'the link is still told, by its kind',
      )
    },
  )
  await searchFacts(world, tally)
  await journeyFacts(world, tally)
  await tally.run(GROUP, 'a plain call reads none of the three lists', async (c) => {
    const trail = await runTurn(world, {
      who: owner,
      script: [{ calls: [{ name: 'list_my_work', input: {} }] }, parrot],
    })
    const text = trailText(trail)
    c.eq(
      [canary.touchNote, canary.summary, canary.meetingTitle].filter((t) => text.includes(t)),
      [],
      'text of a list never named',
    )
  })
}

/** A phone, a mail or the name of a person finds them only for a holder of `data.export`:
 *  the first thing each cell proves is that the search door itself shows the hit, so
 *  what the reader lacks is the tool's doing. The reader is not offered the person kind. */
async function searchFacts(world: World, tally: Tally): Promise<void> {
  const chain = chainOf(world, 'kinds-own')
  const canary = canariesOf(chain.n)
  const holder: Seat = { ...owner, permissions: [...owner.permissions, 'data.export'] }
  const reader = without(owner, 'data.export')
  for (const [field, query] of [
    ['phone', canary.extraPhone],
    ['email', canary.extraMail],
    ['name', canary.extraContact],
  ] as const) {
    await tally.run(
      GROUP,
      `searching by ${field} finds a person only with data.export`,
      async (c) => {
        const kinds = AssistantSearchKind.options.join(',')
        const asked = zod(SearchQuery).transform({ q: query, kinds })
        for (const who of [holder, reader]) {
          const found = (await world.searches.search(who, asked)).groups.flatMap((g) => g.hits)
          c.eq(
            found.filter((h) => h.kind === 'contact').map((h) => h.code),
            [chain.lead],
            'the search door shows the hit to either seat',
          )
        }
        const call = { name: 'search_records', input: { query } }
        const held = await runTurn(world, { who: holder, script: [{ calls: [call] }, parrot] })
        c.eq(held.toolRows[0]?.codes, [chain.lead], 'a holder finds the person')

        /* Fuzzy search finds the lead by its own columns too, so the oracle is the door asked
           without the person kind; only the person-kind-only call proves a name is not searched. */
        const without = zod(SearchQuery).transform({
          q: query,
          kinds: AssistantSearchKind.options.filter((k) => k !== 'contact').join(','),
        })
        const others = (await world.searches.search(reader, without)).groups.flatMap((g) =>
          g.hits.map((h) => h.code),
        )
        const cut = await runTurn(world, { who: reader, script: [{ calls: [call] }, parrot] })
        c.eq(
          [...(cut.toolRows[0]?.codes ?? [])].sort(),
          [...new Set(others)].sort(),
          'a seat without data.export gets what the other kinds find, and no one more',
        )
        const only = { name: 'search_records', input: { query, kinds: ['contact'] } }
        const named = await runTurn(world, { who: reader, script: [{ calls: [only] }, parrot] })
        c.eq(named.toolRows[0]?.codes, [], 'naming the person kind finds no one')
        c.eq(named.toolRows[0]?.rowCount, 0, 'and counts no row')
        const leaks = field === 'name' ? [chain.lead] : [chain.lead, canary.extraContact]
        c.eq(
          leaks.filter((t) => trailText(named).includes(t)),
          [],
          'what the hit would have named',
        )
        if (field !== 'name') c.eq(cut.toolRows[0]?.codes, [], 'a phone or mail finds no one')
      },
    )
  }
}

/** A seat that closed or collects a contract opens the journey, though it holds neither
 *  the lead nor the deal: the books would refuse their codes on a reload, so none is stored. */
async function journeyFacts(world: World, tally: Tally): Promise<void> {
  const paper = chainOf(world, 'kinds-paper')
  const { paperWorkstream } = world.seeded.kinds
  const doorCode = zod(ObjectCode).transform(paperWorkstream)
  const call = record('workstream', paperWorkstream)
  for (const [role, who] of [
    ['closer', owner],
    ['collector', NAMED_SEATS.collector],
  ] as const) {
    await tally.run(
      GROUP,
      `the ${role} of a contract reads the journey with no child code`,
      async (c) => {
        const body = await world.workstreams.profile(who, doorCode)
        const shown = JSON.stringify(body)
        c.ok(
          shown.includes(paper.opportunity) && shown.includes(paper.contract ?? ''),
          'the journey door shows the deal and the contract to this seat',
        )
        const trail = await runTurn(world, { who, script: [{ calls: [call] }, parrot] })
        const [row] = trail.toolRows
        c.eq(row?.outcome, 'ok', 'the tool answers')
        c.eq(row?.codes, [paperWorkstream], 'only the journey is stored')
        c.eq(row?.rowCount, 3, 'the lead is not a row; the deal and the contract are')
        const text = trailText(trail)
        c.eq(
          [paper.lead, paper.opportunity, paper.contract ?? ''].filter((t) => text.includes(t)),
          [],
          'a code of a child the books may refuse',
        )
      },
    )
  }
}

export async function kindsMatrix(world: World, tally: Tally): Promise<void> {
  const cells = cellsOf(world)
  await tally.run(GROUP, 'cell count is the one fixed by hand', async (c) => {
    c.eq(cells.length, KINDS_CELLS, 'matrix size')
  })
  for (const cell of cells) await tally.run(GROUP, cell.name, (c) => runCell(world, c, cell))
  await namedFacts(world, tally)
}
