// @vitest-environment node
import type { AssistantRef } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { describe, expect, it, vi } from 'vitest'
import { recheck, recheckChats, REF_CHECKS } from './assistant-refs'
import type { AssistantToolGate } from './assistant-tools'

/** The walk over a chat with a gate that reads back every code but `LD-LOST`, and
 *  leaves `LD-DOWN` out as a read that failed. */

const who = { id: 'u-dir' } as Actor
const codes = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}-${String(i).padStart(4, '0')}`)

function gate() {
  const read = vi.fn(async (_who: Actor, asked: readonly string[]) => {
    const found = new Map<string, AssistantRef | null>()
    for (const code of asked) {
      if (code === 'LD-DOWN') continue
      found.set(code, code === 'LD-LOST' ? null : { kind: 'lead', code, label: code })
    }
    return found
  })
  return { gate: { recheck: read } as unknown as AssistantToolGate, read }
}

describe('recheck', () => {
  it('asks the gate once for every distinct code of the chat', async () => {
    const { gate: g, read } = gate()
    const result = await recheck(g, who, [
      { id: 'a', codes: ['LD-0001', 'LD-0002'] },
      { id: 'b', codes: ['LD-0001'] },
    ])

    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith(who, ['LD-0001', 'LD-0002'])
    expect(result.shut.size).toBe(0)
    expect(result.refs.get('b')).toEqual([{ kind: 'lead', code: 'LD-0001', label: 'LD-0001' }])
  })

  it('shuts the answer that names a lost record and every later one, not an earlier one', async () => {
    const { gate: g } = gate()
    const result = await recheck(g, who, [
      { id: 'before', codes: ['LD-0001'] },
      { id: 'lost', codes: ['LD-0001', 'LD-LOST'] },
      { id: 'no-tool', codes: [] },
      { id: 'after', codes: ['LD-0002'] },
    ])

    expect([...result.shut]).toEqual([
      ['lost', 'withheld'],
      ['no-tool', 'withheld'],
      ['after', 'withheld'],
    ])
    expect(result.refs.get('before')).toHaveLength(1)
  })

  it('marks an answer past the cap unchecked, the newest included, and those after it', async () => {
    const { gate: g, read } = gate()
    const result = await recheck(g, who, [
      { id: 'old', codes: codes('LD', REF_CHECKS - 1) },
      { id: 'over', codes: codes('OP', 2) },
      { id: 'newest', codes: [] },
    ])

    expect(read.mock.calls[0]?.[1]).toHaveLength(REF_CHECKS - 1)
    expect(result.shut.get('old')).toBeUndefined()
    expect(result.shut.get('over')).toBe('unchecked')
    expect(result.shut.get('newest')).toBe('unchecked')
  })

  it('calls a code whose read failed unchecked, and a lost one after it still withheld', async () => {
    const { gate: g } = gate()
    const result = await recheck(g, who, [
      { id: 'down', codes: ['LD-DOWN'] },
      { id: 'lost', codes: ['LD-LOST'] },
    ])

    expect(result.shut.get('down')).toBe('unchecked')
    expect(result.shut.get('lost')).toBe('withheld')
  })

  it('walks each chat on its own, with one read for all of them', async () => {
    const { gate: g, read } = gate()
    const result = await recheckChats(g, who, [
      [
        { id: 'x1', codes: ['LD-LOST'] },
        { id: 'x2', codes: [] },
      ],
      [{ id: 'y1', codes: ['LD-0001'] }],
    ])

    expect(read).toHaveBeenCalledTimes(1)
    expect(result.shut.get('x2')).toBe('withheld')
    expect(result.shut.get('y1')).toBeUndefined()
  })
})
