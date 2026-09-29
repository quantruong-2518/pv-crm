import { describe, expect, it } from 'vitest'
import { decideOn, isPendingFor, type ChainLink, type Decidable } from './e3-approvals'
import type { Actor } from './types'

/** E3 decides whose turn it is by actor id, because display names repeat —
 *  production has two actors sharing one name. Pinned here because the server
 *  and the browser both lean on this one law and nothing else would notice it
 *  sliding back. */

const person = (id: string, roleId: Actor['roleId']): Actor => ({
  id,
  name: 'Hải',
  email: `${id}@pebblevina.com`,
  role: roleId,
  roleId,
  permissions: [],
  branches: ['Sales'],
})

const director = person('a-director', 'director')
const sale = person('a-sale', 'sale')
const NOW = '2026-09-29T09:00:00.000Z'

const waitingOn = (link: ChainLink): Decidable & { raisedById: string } => ({
  state: 'waiting',
  chain: [link],
  raisedById: sale.id,
})

describe('E3 · identity is the actor id, not the name', () => {
  const request = waitingOn({
    role: 'director',
    person: 'Hải',
    personId: director.id,
    state: 'waiting',
  })

  it('two actors named alike: only the chain member may decide', () => {
    expect(decideOn(request, sale, 'approved', NOW)).toEqual({
      ok: false,
      reason: 'not-your-turn',
      waitingFor: 'Hải',
    })
    const decided = decideOn(request, director, 'approved', NOW)
    expect(decided.ok && decided.request.state).toBe('approved')
    expect(isPendingFor(request, director)).toBe(true)
    expect(isPendingFor(request, sale)).toBe(false)
  })

  it('the raiser cannot approve their own request, even sharing the approver name', () => {
    expect(request.raisedById).toBe(sale.id)
    expect(decideOn(request, sale, 'approved', NOW).ok).toBe(false)
    expect(decideOn(request, sale, 'rejected', NOW).ok).toBe(false)
  })

  it('a legacy link with no personId still matches by name', () => {
    const legacy = waitingOn({ role: 'director', person: 'Hải', state: 'waiting' })
    expect(decideOn(legacy, director, 'approved', NOW).ok).toBe(true)
  })
})
