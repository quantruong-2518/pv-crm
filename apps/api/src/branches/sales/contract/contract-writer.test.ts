import { describe, expect, it } from 'vitest'
import type { Actor } from '@pv/engines'
import { closerOnDealEdit, mayWriteContract } from './contract-writer'

const actor = (id: string, roleIds: Actor['roleIds']): Actor =>
  ({ id, name: id, email: `${id}@pv.test`, role: id, roleIds, ownOnly: true }) as Actor

describe('mayWriteContract (ADR 0110 §2)', () => {
  it('lets the closer, the head of sales and the director write', () => {
    expect(mayWriteContract(actor('u-sale', ['sale']), 'u-sale')).toBe(true)
    expect(mayWriteContract(actor('u-grace', ['head-of-sales']), 'u-sale')).toBe(true)
    expect(mayWriteContract(actor('u-boss', ['director']), null)).toBe(true)
  })

  it('refuses a co-seller and an ownerless paper to a seller', () => {
    expect(mayWriteContract(actor('u-am', ['account-executive']), 'u-sale')).toBe(false)
    expect(mayWriteContract(actor('u-sale', ['sale']), null)).toBe(false)
  })
})

describe('closerOnDealEdit (ADR 0110 §1)', () => {
  const holder = { id: 'u-am', name: 'AM' }

  it('leaves a closer off the deal lane untouched on a deal edit', () => {
    expect(closerOnDealEdit('u-sale', false, holder)).toBeNull()
    expect(closerOnDealEdit('u-sale', true, holder)).toBeNull()
  })

  it('gives only a live legacy paper with no closer the deal holder', () => {
    expect(closerOnDealEdit(null, false, holder)).toEqual(holder)
    expect(closerOnDealEdit(null, true, holder)).toBeNull()
  })
})
