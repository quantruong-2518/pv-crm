// @vitest-environment node
import type { AssistantRef } from '@pv/contracts'
import type { Actor, Permission } from '@pv/engines'
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
  const holds = vi.fn((_who: Actor, permission: Permission) => permission === 'comm.view-content')
  return { gate: { recheck: read, holds } as unknown as AssistantToolGate, read, holds }
}

describe('recheck', () => {
  it('asks the gate once for every distinct code of the chat', async () => {
    const { gate: g, read } = gate()
    const result = await recheck(g, who, [
      { id: 'a', codes: ['LD-0001', 'LD-0002'], reveals: [] },
      { id: 'b', codes: ['LD-0001'], reveals: [] },
    ])

    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith(who, ['LD-0001', 'LD-0002'])
    expect(result.shut.size).toBe(0)
    expect(result.refs.get('b')).toEqual([{ kind: 'lead', code: 'LD-0001', label: 'LD-0001' }])
  })

  it('shuts the answer that names a lost record and every later one, not an earlier one', async () => {
    const { gate: g } = gate()
    const result = await recheck(g, who, [
      { id: 'before', codes: ['LD-0001'], reveals: [] },
      { id: 'lost', codes: ['LD-0001', 'LD-LOST'], reveals: [] },
      { id: 'no-tool', codes: [], reveals: [] },
      { id: 'after', codes: ['LD-0002'], reveals: [] },
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
      { id: 'old', codes: codes('LD', REF_CHECKS - 1), reveals: [] },
      { id: 'over', codes: codes('OP', 2), reveals: [] },
      { id: 'newest', codes: [], reveals: [] },
    ])

    expect(read.mock.calls[0]?.[1]).toHaveLength(REF_CHECKS - 1)
    expect(result.shut.get('old')).toBeUndefined()
    expect(result.shut.get('over')).toBe('unchecked')
    expect(result.shut.get('newest')).toBe('unchecked')
  })

  it('calls a code whose read failed unchecked, and a lost one after it still withheld', async () => {
    const { gate: g } = gate()
    const result = await recheck(g, who, [
      { id: 'down', codes: ['LD-DOWN'], reveals: [] },
      { id: 'lost', codes: ['LD-LOST'], reveals: [] },
    ])

    expect(result.shut.get('down')).toBe('unchecked')
    expect(result.shut.get('lost')).toBe('withheld')
  })

  it('walks each chat on its own, with one read for all of them', async () => {
    const { gate: g, read } = gate()
    const result = await recheckChats(g, who, [
      [
        { id: 'x1', codes: ['LD-LOST'], reveals: [] },
        { id: 'x2', codes: [], reveals: [] },
      ],
      [{ id: 'y1', codes: ['LD-0001'], reveals: [] }],
    ])

    expect(read).toHaveBeenCalledTimes(1)
    expect(result.shut.get('x2')).toBe('withheld')
    expect(result.shut.get('y1')).toBeUndefined()
  })

  it('withholds an answer that revealed gated text from a reader without it, and every later one', async () => {
    const { gate: g, holds } = gate()
    holds.mockReturnValue(false)
    const result = await recheck(g, who, [
      { id: 'before', codes: ['LD-0001'], reveals: [] },
      { id: 'quotes', codes: ['LD-0001'], reveals: ['comm.view-content'] },
      { id: 'after', codes: ['LD-0002'], reveals: [] },
    ])

    expect([...result.shut]).toEqual([
      ['quotes', 'withheld'],
      ['after', 'withheld'],
    ])
    expect(result.refs.get('before')).toHaveLength(1)
  })

  it('shows that answer to a holder of the permission', async () => {
    const { gate: g, holds } = gate()
    const result = await recheck(g, who, [
      { id: 'quotes', codes: ['LD-0001'], reveals: ['comm.view-content'] },
    ])

    expect(holds).toHaveBeenCalledWith(who, 'comm.view-content')
    expect(result.shut.size).toBe(0)
  })

  it('withholds a revealing call whose tool names no permission, for every reader', async () => {
    const { gate: g } = gate()
    const result = await recheck(g, who, [{ id: 'gone', codes: ['LD-0001'], reveals: [null] }])

    expect(result.shut.get('gone')).toBe('withheld')
  })
})
