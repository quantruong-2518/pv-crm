import { describe, expect, it } from 'vitest'
import {
  planLeadScan,
  type ScanReadCompany,
  type ScanReadFile,
  type ScanReadPerson,
} from './lead-scan'

/** A wrong grouping here silently writes a duplicate or a merged-away lead,
 *  and no compiler or screen notices — so the rules are pinned. */

const person = (p: Partial<ScanReadPerson>): ScanReadPerson => ({
  name: null,
  title: null,
  email: null,
  phones: [],
  companyName: null,
  ...p,
})

const company = (c: Partial<ScanReadCompany>): ScanReadCompany => ({
  name: null,
  legalName: null,
  taxCode: null,
  address: null,
  province: null,
  website: null,
  headcount: null,
  phones: [],
  emails: [],
  ...c,
})

const file = (fileId: string, parts: Partial<ScanReadFile>): ScanReadFile => ({
  fileId,
  fileName: `${fileId}.webp`,
  people: [],
  companies: [],
  ...parts,
})

describe('planLeadScan', () => {
  it('merges a card and a profile PDF on the tax-code root', () => {
    const plan = planLeadScan(
      [
        file('card', {
          people: [person({ name: 'Lê An', email: 'an@saodo.vn', companyName: 'Sao Đỏ' })],
          companies: [company({ name: 'Sao Đỏ', taxCode: '0312345678-001' })],
        }),
        file('pdf', { companies: [company({ name: 'Công ty CP Sao Đỏ', taxCode: '0312345678' })] }),
        file('blank', {}),
      ],
      [],
    )
    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0]).toMatchObject({
      key: 'tax:0312345678',
      outcome: 'NEW_LEAD',
      fileIds: ['card', 'pdf'],
    })
    expect(plan.groups[0]!.fields.find((f) => f.field === 'name')?.confidence).toBe('SURE')
    expect(plan.totals).toEqual({ accounts: 1, contacts: 1, leadsToCreate: 1 })
    expect(plan.noLeadFileIds).toEqual(['blank'])
  })

  it('does not merge two companies over a free-mail domain', () => {
    const plan = planLeadScan(
      [
        file('a', {
          people: [person({ name: 'An', email: 'an@gmail.com', companyName: 'Alpha' })],
        }),
        file('b', {
          people: [person({ name: 'Bình', email: 'binh@gmail.com', companyName: 'Beta' })],
        }),
      ],
      [],
    )
    expect(plan.groups.map((g) => g.company)).toEqual(['Alpha', 'Beta'])
  })

  it('merges phone variants of the same number', () => {
    const plan = planLeadScan(
      [
        file('a', { people: [person({ name: 'An', phones: ['+84 903.123.456'] })] }),
        file('b', { people: [person({ name: 'An', phones: ['0903-123-456'] })] }),
        file('c', { companies: [company({ name: 'Gamma', phones: ['(+84) (0) 903 123 456'] })] }),
      ],
      [],
    )
    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0]!.people).toHaveLength(1)
  })

  it('holds a match outside scope without leaking its code', () => {
    const plan = planLeadScan(
      [file('a', { people: [person({ name: 'An', email: 'AN@delta.vn ' })] })],
      [{ code: 'LD-0001', emailLower: 'an@delta.vn', taxCode: null, inScope: false }],
    )
    expect(plan.groups[0]!.outcome).toBe('HELD_OTHER_OWNER')
    expect(plan.groups[0]).not.toHaveProperty('leadCode')
  })

  it('prefers a later in-scope match over an earlier out-of-scope one', () => {
    const plan = planLeadScan(
      [file('a', { people: [person({ name: 'An', email: 'an@delta.vn' })] })],
      [
        { code: 'LD-0001', emailLower: null, taxCode: null, inScope: false },
        { code: 'LD-0002', emailLower: 'an@delta.vn', taxCode: null, inScope: false },
        { code: 'LD-0003', emailLower: 'an@delta.vn', taxCode: null, inScope: true },
      ],
    )
    expect(plan.groups[0]).toMatchObject({ outcome: 'MERGE_INTO_LEAD', leadCode: 'LD-0003' })
  })

  it('holds a company with no person email', () => {
    const plan = planLeadScan(
      [file('pdf', { companies: [company({ name: 'Epsilon', emails: ['info@eps.vn'] })] })],
      [],
    )
    expect(plan.groups[0]).toMatchObject({ outcome: 'HELD_MISSING_CONTACT', meta: 'chỉ có hồ sơ' })
  })

  it('marks a value only doubted sources back as INFERRED', () => {
    const plan = planLeadScan(
      [
        file('card', {
          people: [person({ name: 'An', email: 'an@zeta.vn', companyName: 'Zeta' })],
          companies: [company({ name: 'Zeta', taxCode: '0312345678', address: '1 Lê Lợi' })],
          unsure: ['taxCode', 'people[0].companyName'],
        }),
        file('pdf', {
          companies: [company({ name: 'Zeta', taxCode: '0312345678' })],
          unsure: ['companies[0].taxCode', 'companies[0].name'],
        }),
      ],
      [],
    )
    const confidence = (field: string) =>
      plan.groups[0]!.fields.find((f) => f.field === field)?.confidence
    expect([confidence('taxCode'), confidence('name'), confidence('address')]).toEqual([
      'INFERRED',
      'SURE',
      'SURE',
    ])
  })

  it('reports disagreeing phones as CONFLICT with the other reading', () => {
    const plan = planLeadScan(
      [
        file('card', {
          companies: [company({ taxCode: '0312345678', phones: ['028 3822 1234'] })],
        }),
        file('pdf', { companies: [company({ taxCode: '0312345678', phones: ['0903 123 456'] })] }),
      ],
      [],
    )
    expect(plan.groups[0]!.fields.find((f) => f.field === 'phone')).toEqual({
      field: 'phone',
      value: '02838221234',
      alt: '0903123456',
      fromFile: 'card.webp',
      confidence: 'CONFLICT',
    })
  })
})
