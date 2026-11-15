import type { SearchHit, SearchResult } from '@pv/contracts'
import { describe, expect, it } from 'vitest'
import { searchRead } from './search-read'

const hit = (over: Partial<SearchHit> & Pick<SearchHit, 'kind' | 'code'>): SearchHit => ({
  title: 'Chị Lan',
  subtitle: 'Sao Đỏ',
  matched: { field: 'title', text: 'Chị Lan' },
  score: 1,
  ...over,
})

const byPhone = hit({
  kind: 'contact',
  code: 'LD-0001',
  matched: { field: 'phone', text: '0977123456' },
})
const byName = hit({ kind: 'contact', code: 'LD-0002' })
const result = (hits: SearchHit[], more = false): SearchResult => ({
  groups: [{ kind: 'contact', hits, more }],
})

describe('searchRead', () => {
  it('keeps the person found by phone for a holder of data.export', () => {
    const read = searchRead(result([byPhone]), true)

    expect(read.codes).toEqual(['LD-0001'])
  })

  it('labels a contact folded into its lead with the company, as a reload does', () => {
    const read = searchRead(result([byName]), true)

    expect(read.refs).toEqual([{ kind: 'lead', code: 'LD-0002', label: 'Sao Đỏ' }])
  })

  it('keeps the lead hit when a contact hit on the same lead folds into it', () => {
    const lead = hit({ kind: 'lead', code: 'LD-0001', title: 'Sao Đỏ', subtitle: 'LD-0001' })
    const read = searchRead(
      {
        groups: [
          { kind: 'contact', hits: [byPhone], more: false },
          { kind: 'lead', hits: [lead], more: false },
        ],
      },
      true,
    )

    expect(read.refs).toEqual([{ kind: 'lead', code: 'LD-0001', label: 'Sao Đỏ' }])
  })
})
