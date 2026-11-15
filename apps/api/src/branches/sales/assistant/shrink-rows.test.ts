import { describe, expect, it } from 'vitest'
import { shrinkRows } from './shrink-rows'

const row = (n: number, summary = 'x'.repeat(500)) => ({
  trusted: { n },
  untrusted: { summary },
})
const output = () => ({
  touches: { rows: Array.from({ length: 6 }, (_, n) => row(n)) },
  comms: { rows: Array.from({ length: 4 }, (_, n) => row(n)) },
})
const paths = [
  ['touches', 'rows'],
  ['comms', 'rows'],
  ['absent', 'rows'],
] as const
const sizeOf = (o: object) => JSON.stringify(o).length

describe('shrinkRows', () => {
  it('halves every list from the end and keeps each row whole', () => {
    const small = shrinkRows(output(), paths, (c) => sizeOf(c) < 3_500) as ReturnType<typeof output>

    expect(small.touches.rows.map((r) => r.trusted.n)).toEqual([0, 1, 2])
    expect(small.comms.rows.map((r) => r.trusted.n)).toEqual([0, 1, 2])
    expect(small.comms.rows[0]).toEqual(row(0))
  })

  it('runs the cheaper prepare cut first and stops when it is enough', () => {
    const cut = (o: object) => {
      for (const r of (o as ReturnType<typeof output>).comms.rows) r.untrusted.summary = 'y'
    }
    const small = shrinkRows(output(), paths, (c) => sizeOf(c) < 3_700, cut) as ReturnType<
      typeof output
    >

    expect(small.comms.rows).toHaveLength(4)
    expect(small.touches.rows).toHaveLength(6)
  })

  it('returns null when one row of each list does not fit, or when fits throws', () => {
    expect(shrinkRows(output(), paths, () => false)).toBeNull()
    expect(
      shrinkRows(output(), paths, () => {
        throw new Error('boom')
      }),
    ).toBeNull()
  })
})
