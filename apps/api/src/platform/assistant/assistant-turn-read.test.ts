import { describe, expect, it } from 'vitest'
import { footerOf, newReads, noteReads, suggestionsOf, sumReads } from './assistant-turn-read'
import type { ToolVerdict } from './assistant-tools'

const at = new Date('2026-11-15T03:00:00Z')

const okCall = (name: string, reads: ToolVerdict['reads']) =>
  ({
    call: { name },
    outcome: 'ok',
    refs: [],
    reads,
    counted: 'all',
  }) as unknown as ToolVerdict & { call: { name: string } }

const refsOf = (counted: ToolVerdict['counted']) =>
  ({
    call: { name: 'get_record' },
    outcome: 'ok',
    reads: {},
    counted,
    refs: [
      { kind: 'account', code: 'AC-0001', label: 'A' },
      { kind: 'lead', code: 'LD-0001', label: 'B' },
      { kind: 'lead', code: 'LD-0002', label: 'C' },
    ],
  }) as unknown as ToolVerdict & { call: { name: string } }

describe('the footer', () => {
  it('lists the non-record reads after the record kinds, in a fixed order, left out at zero', () => {
    const reads = newReads()
    reads.counted.set('LD-0001', { kind: 'lead', code: 'LD-0001', label: 'A' })
    reads.steps = { meeting: 2, hold: 1, approval: 4, 'next-step': 0 }

    expect(footerOf(reads, at).read).toEqual([
      { kind: 'lead', count: 1 },
      { kind: 'approval', count: 4 },
      { kind: 'hold', count: 1 },
      { kind: 'meeting', count: 2 },
    ])
  })

  it('sums the reads of several calls, and sums replayed per-call reads to the same footer', () => {
    const perCall = [{ 'next-step': 2, hold: 1 }, { hold: 2, meeting: 1 }, {}]
    const live = newReads()
    noteReads(
      live,
      perCall.map((r) => okCall('list_my_work', r)),
    )
    const replay = { counted: new Map(), steps: sumReads(perCall) }

    expect(live.steps).toEqual({ 'next-step': 2, hold: 3, meeting: 1 })
    expect(footerOf(replay, at)).toEqual(footerOf(live, at))
  })

  it('offers a suggestion per kind that read something, and skips a refused call', () => {
    const reads = newReads()
    noteReads(reads, [
      okCall('list_my_work', { 'next-step': 1 }),
      { ...okCall('list_my_work', { approval: 5 }), outcome: 'refused' } as never,
    ])

    expect([...reads.seen.keys()]).toEqual(['list_my_work next-step'])
    expect(suggestionsOf(reads)).toEqual([{ key: 'overdue-steps', params: {} }])
  })

  it('counts every ref by default, only the first for `first`, and none for `none`', () => {
    const footerFor = (mode: ToolVerdict['counted']) => {
      const reads = newReads()
      noteReads(reads, [refsOf(mode)])
      return { reads, footer: footerOf(reads, at).read }
    }
    const all = footerFor('all')
    const first = footerFor('first')
    const none = footerFor('none')

    expect(all.footer).toEqual([
      { kind: 'lead', count: 2 },
      { kind: 'account', count: 1 },
    ])
    expect(first.footer).toEqual([{ kind: 'account', count: 1 }])
    expect(none.footer).toEqual([])
    expect([...first.reads.seen.keys()]).toEqual(['get_record', 'get_record account'])
    expect(suggestionsOf(first.reads)).toEqual([])
    expect([...none.reads.seen.keys()]).toEqual([])
    expect([...none.reads.refs.keys()]).toEqual(['AC-0001', 'LD-0001', 'LD-0002'])
  })
})
