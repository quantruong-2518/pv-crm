import type { Probe } from './scope-door'
import { NAMED_SEATS, ROLE_SEATS, scopedSeatId, wideSeatId, type Seat } from './seed-data'

/** The second oracle: a short list typed by hand from the ADRs, because the computed
 *  one cannot see a bug a door shares with its tool. It holds only the rules the
 *  scope axis is known for and leaves everything else to the door.
 *
 *  It does not restate the role table: where a line depends on a permission the seat
 *  is named by role, and `DEFAULT_ROLE_PERMISSIONS` stays the only source of that. */

export type Fact = {
  who: Seat
  chain: string
  probe: Exclude<Probe, 'search'>
  allowed: boolean
  why: string
}

const roleSeat = (id: string): Seat => {
  const found = ROLE_SEATS.find((s) => s.id === id)
  if (!found) throw new Error(`no seat ${id}`)
  return found
}

const { saleA, saleB, bdCo, collector, unlicensed } = NAMED_SEATS
const scopedSale = roleSeat(scopedSeatId('sale'))
const scopedMarketing = roleSeat(scopedSeatId('marketing'))
const wideDirector = roleSeat(wideSeatId('director'))
const executive = roleSeat(wideSeatId('account-executive'))

export const FACTS: readonly Fact[] = [
  { who: saleA, chain: 'a', probe: 'lead', allowed: true, why: 'holds the lead' },
  { who: saleA, chain: 'a', probe: 'opportunity', allowed: true, why: 'stands on the deal' },
  { who: saleA, chain: 'a', probe: 'contract', allowed: true, why: 'closed the contract' },
  { who: saleA, chain: 'b', probe: 'lead', allowed: false, why: 'another Sale, ADR 0070' },
  { who: saleA, chain: 'b', probe: 'opportunity', allowed: false, why: 'ADR 0071' },
  { who: saleA, chain: 'b', probe: 'contract', allowed: false, why: 'ADR 0110 §2' },
  { who: saleB, chain: 'a', probe: 'lead', allowed: false, why: 'the other direction' },
  { who: saleB, chain: 'b', probe: 'contract', allowed: true, why: 'closed the contract' },
  { who: bdCo, chain: 'co-open', probe: 'opportunity', allowed: true, why: 'BD lane, ADR 0071' },
  { who: bdCo, chain: 'co-open', probe: 'lead', allowed: true, why: 'an open deal gives the lead' },
  { who: bdCo, chain: 'co-signed', probe: 'contract', allowed: true, why: 'ADR 0110 §2' },
  { who: bdCo, chain: 'a', probe: 'lead', allowed: false, why: 'not on this deal' },
  { who: collector, chain: 'collected', probe: 'contract', allowed: true, why: 'collects it' },
  { who: collector, chain: 'collected', probe: 'opportunity', allowed: false, why: 'money only' },
  { who: collector, chain: 'collected', probe: 'lead', allowed: false, why: 'money only' },
  { who: scopedSale, chain: 'pool', probe: 'lead', allowed: true, why: 'nurturing pool, ADR 0109' },
  { who: scopedSale, chain: 'unowned', probe: 'lead', allowed: false, why: 'new pool, assigners' },
  {
    who: scopedMarketing,
    chain: 'own-marketing',
    probe: 'contract',
    allowed: false,
    why: 'axis 2',
  },
  { who: wideDirector, chain: 'rival', probe: 'contract', allowed: true, why: 'no scope axis' },
  { who: wideDirector, chain: 'off', probe: 'opportunity', allowed: false, why: 'a dead lead' },
  { who: executive, chain: 'rival', probe: 'lead', allowed: true, why: 'the seat has no ownOnly' },
  { who: unlicensed, chain: 'rival', probe: 'lead', allowed: false, why: 'axis 1, a director' },
]
