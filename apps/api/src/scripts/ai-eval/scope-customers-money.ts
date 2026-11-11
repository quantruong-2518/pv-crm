import type { OpportunityMoney, OpportunityProfileResponse } from '@pv/contracts'
import { OpportunityController } from '@api/branches/sales/opportunity/opportunity.controller'
import { runTurn, type Trail } from './bench'
import type { Check } from './report'
import { chainOf, dig, gateLinesOnly, toolBody, type Json } from './scope-customers-oracle'
import { askCall, doorId } from './scope-door'
import { agreeOnAnswer, agreeOnRefusal } from './scope-matrix'
import { holdsExport, maskedLeaves } from './scope-reach'
import { parrot } from './scripted-client'
import type { Seat } from './seed-data'
import type { World } from './world'

/** The money riding on `get_record` for a deal. The doors give all of it on
 *  `opportunity.view`; the payment half belongs to the contract door, so a paper the
 *  seat may not read carries neither its collected sum nor its installments, and the
 *  totals over them come only when some paper shows. Left out, not nulled: a null
 *  would tell the model the deal has none. Typed text of a round is masked like the
 *  rest for a seat without `data.export`. */

const PROFILE = doorId([OpportunityController, 'profile'])
const TOTALS = [
  'signed',
  'collected',
  'collectedShare',
  'installments',
  'outstanding',
  'overdue',
  'notYetDue',
] as const
const PAID = ['collected', 'collectedShare'] as const
/* Typed, not imported: the list size is what is under test. */
const LIST = 20

export type MoneyCell = { name: string; who: Seat; chain: string }

type Round = { note: string | null; reasonLabel: string | null }

const maskIf = (text: string | null): string | null =>
  text === null ? null : (maskedLeaves([text])[0] ?? text)

/** Rounds in the order the tool lists them: open negotiations, then contracts. */
function roundsAtDoor(money: OpportunityMoney): Round[] {
  const lists = [...money.open.map((n) => n.rounds), ...money.contracts.map((p) => p.rounds)]
  return lists.flatMap((rounds) => rounds.slice(0, LIST))
}

function roundsShown(money: unknown): Json[] {
  const open = (dig(money, 'open', 'rows') ?? []) as Json[]
  const papers = (dig(money, 'contracts', 'rows') ?? []) as Json[]
  return [...open, ...papers].flatMap((r) => (dig(r, 'rounds', 'rows') ?? []) as Json[])
}

function paperFacts(c: Check, money: OpportunityMoney, shown: unknown): void {
  const rows = (dig(shown, 'contracts', 'rows') ?? []) as Json[]
  c.eq(rows.length, Math.min(LIST, money.contracts.length), 'the contract rows')
  for (const [i, paper] of money.contracts.slice(0, LIST).entries()) {
    const row = rows[i]
    const label = `contract ${paper.code}`
    c.eq(row?.currency, paper.currency, `${label}: its currency rides beside it`)
    c.eq(dig(row, 'trusted', 'paymentsVisible'), paper.paymentsVisible, `${label}: the flag`)
    const got = (dig(row, 'trusted') ?? {}) as Json
    for (const key of PAID) {
      if (paper.paymentsVisible) c.eq(got[key], paper[key], `${label}: ${key}`)
      else c.ok(!(key in got), `${label}: ${key} is left out`)
    }
    c.eq('installments' in (row ?? {}), paper.paymentsVisible, `${label}: installments key`)
    if (paper.paymentsVisible) {
      c.eq(
        dig(row, 'installments', 'trusted', 'count'),
        paper.installments.length,
        `${label}: count`,
      )
    }
  }
}

function moneyFacts(c: Check, who: Seat, trail: Trail, profile: OpportunityProfileResponse): void {
  const { money } = profile
  const { out } = toolBody(trail)
  const shown = out.money
  const trusted = dig(shown, 'trusted') as Json
  c.eq(trusted.paymentsVisible, money.paymentsVisible, 'the money flag')
  c.eq(trusted.quoting, money.totals.quoting, 'the quoting sum is always there')
  for (const key of TOTALS) {
    if (money.paymentsVisible) c.eq(trusted[key], money.totals[key], `totals: ${key}`)
    else c.ok(!(key in trusted), `totals: ${key} is left out`)
  }
  paperFacts(c, money, shown)

  const want = roundsAtDoor(money).map((r) => {
    const raw = { note: r.note, reasonLabel: r.reasonLabel }
    return holdsExport(who) ? raw : { note: maskIf(raw.note), reasonLabel: maskIf(raw.reasonLabel) }
  })
  const got = roundsShown(shown).map((r) => dig(r, 'untrusted'))
  c.eq(JSON.parse(JSON.stringify(got)), JSON.parse(JSON.stringify(want)), 'round text as shown')
  const raw = roundsAtDoor(money).map((r) => ({ note: r.note, reasonLabel: r.reasonLabel }))
  const masked = !holdsExport(who) && JSON.stringify(want) !== JSON.stringify(raw)
  const people = !holdsExport(who) && profile.contacts.some((p) => p.phone || p.email)
  c.eq(out.contactInfoWithheld, masked || people ? true : undefined, 'the flag follows the mask')

  const refs = trail.events.flatMap((e) => (e.type === 'refs' ? e.refs : []))
  for (const ref of refs.filter((r) => r.kind === 'contract')) {
    c.eq(ref.label, profile.account, `the chip of ${ref.code} is labelled with the deal's account`)
  }
}

/** One deal read by one seat: the doors' own answer first, then the money on top. */
export async function runMoney(world: World, c: Check, cell: MoneyCell): Promise<void> {
  const chain = chainOf(world, cell.chain)
  const call = { name: 'get_record', input: { kind: 'opportunity', code: chain.opportunity } }
  const door = await askCall(world, cell.who, call, chain)
  const trail = await gateLinesOnly(world, c, () =>
    runTurn(world, { who: cell.who, script: [{ calls: [call] }, parrot] }),
  )
  c.eq(trail.turn?.endedBy, 'answer', 'the turn ends normally')
  if (!door.ok) return agreeOnRefusal(c, door, trail)
  agreeOnAnswer(c, door, trail, cell.who)
  moneyFacts(c, cell.who, trail, door.bodies[PROFILE] as OpportunityProfileResponse)
}
