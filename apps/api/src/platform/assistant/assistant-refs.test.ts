// @vitest-environment node
import type { AssistantRef } from '@pv/contracts'
import type { Actor, Permission } from '@pv/engines'
import { describe, expect, it, vi } from 'vitest'
import { recheck, recheckChats, REF_CHECKS, revealedCodes } from './assistant-refs'
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
  const reachOf = vi.fn(async (_who: Actor, _calls: unknown) => {
    return new Map<string, ReadonlySet<string> | null>()
  })
  return {
    gate: { recheck: read, holds, reachOf } as unknown as AssistantToolGate,
    read,
    holds,
    reachOf,
  }
}

describe('recheck', () => {
  it('asks the gate once for every distinct code of the chat', async () => {
    const { gate: g, read } = gate()
    const result = await recheck(g, who, [
      { id: 'a', codes: ['LD-0001', 'LD-0002'], reveals: [], revealing: [] },
      { id: 'b', codes: ['LD-0001'], reveals: [], revealing: [] },
    ])

    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith(who, ['LD-0001', 'LD-0002'])
    expect(result.shut.size).toBe(0)
    expect(result.refs.get('b')).toEqual([{ kind: 'lead', code: 'LD-0001', label: 'LD-0001' }])
  })

  it('shuts the answer that names a lost record and every later one, not an earlier one', async () => {
    const { gate: g } = gate()
    const result = await recheck(g, who, [
      { id: 'before', codes: ['LD-0001'], reveals: [], revealing: [] },
      { id: 'lost', codes: ['LD-0001', 'LD-LOST'], reveals: [], revealing: [] },
      { id: 'no-tool', codes: [], reveals: [], revealing: [] },
      { id: 'after', codes: ['LD-0002'], reveals: [], revealing: [] },
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
      { id: 'old', codes: codes('LD', REF_CHECKS - 1), reveals: [], revealing: [] },
      { id: 'over', codes: codes('OP', 2), reveals: [], revealing: [] },
      { id: 'newest', codes: [], reveals: [], revealing: [] },
    ])

    expect(read.mock.calls[0]?.[1]).toHaveLength(REF_CHECKS - 1)
    expect(result.shut.get('old')).toBeUndefined()
    expect(result.shut.get('over')).toBe('unchecked')
    expect(result.shut.get('newest')).toBe('unchecked')
  })

  it('calls a code whose read failed unchecked, and a lost one after it still withheld', async () => {
    const { gate: g } = gate()
    const result = await recheck(g, who, [
      { id: 'down', codes: ['LD-DOWN'], reveals: [], revealing: [] },
      { id: 'lost', codes: ['LD-LOST'], reveals: [], revealing: [] },
    ])

    expect(result.shut.get('down')).toBe('unchecked')
    expect(result.shut.get('lost')).toBe('withheld')
  })

  it('walks each chat on its own, with one read for all of them', async () => {
    const { gate: g, read } = gate()
    const result = await recheckChats(g, who, [
      [
        { id: 'x1', codes: ['LD-LOST'], reveals: [], revealing: [] },
        { id: 'x2', codes: [], reveals: [], revealing: [] },
      ],
      [{ id: 'y1', codes: ['LD-0001'], reveals: [], revealing: [] }],
    ])

    expect(read).toHaveBeenCalledTimes(1)
    expect(result.shut.get('x2')).toBe('withheld')
    expect(result.shut.get('y1')).toBeUndefined()
  })

  it('withholds an answer that revealed gated text from a reader without it, and every later one', async () => {
    const { gate: g, holds } = gate()
    holds.mockReturnValue(false)
    const result = await recheck(g, who, [
      { id: 'before', codes: ['LD-0001'], reveals: [], revealing: [] },
      { id: 'quotes', codes: ['LD-0001'], reveals: ['comm.view-content'], revealing: [] },
      { id: 'after', codes: ['LD-0002'], reveals: [], revealing: [] },
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
      { id: 'quotes', codes: ['LD-0001'], reveals: ['comm.view-content'], revealing: [] },
    ])

    expect(holds).toHaveBeenCalledWith(who, 'comm.view-content')
    expect(result.shut.size).toBe(0)
  })

  it('withholds a revealing call whose tool names no permission, for every reader', async () => {
    const { gate: g } = gate()
    const result = await recheck(g, who, [
      { id: 'gone', codes: ['LD-0001'], reveals: [null], revealing: [] },
    ])

    expect(result.shut.get('gone')).toBe('withheld')
  })

  describe('the reach of a revealing call', () => {
    const quoted = (id: string, code: string) => ({
      id,
      codes: [code],
      reveals: ['comm.view-content' as const],
      revealing: [{ tool: 'get_history', codes: [code] }],
    })
    const chat = [
      { id: 'before', codes: ['LD-0001'], reveals: [], revealing: [] },
      quoted('quotes', 'LD-0001'),
      { id: 'after', codes: ['LD-0002'], reveals: [], revealing: [] },
    ]

    it('withholds a holder of the permission who is out of reach, and every later answer', async () => {
      const { gate: g, reachOf } = gate()
      reachOf.mockResolvedValue(new Map([['get_history', new Set<string>()]]))
      const result = await recheck(g, who, chat)

      expect([...result.shut]).toEqual([
        ['quotes', 'withheld'],
        ['after', 'withheld'],
      ])
      expect(result.refs.get('before')).toHaveLength(1)
    })

    it('shows the answer to a holder in reach, asking once for the whole chat', async () => {
      const { gate: g, reachOf } = gate()
      reachOf.mockResolvedValue(new Map([['get_history', new Set(['LD-0001'])]]))
      const result = await recheckChats(g, who, [chat, [quoted('other', 'LD-0001')]])

      expect(result.shut.size).toBe(0)
      expect(reachOf).toHaveBeenCalledTimes(1)
    })

    it('calls a reach read that failed unchecked, as a failed book read is', async () => {
      const { gate: g, reachOf } = gate()
      reachOf.mockResolvedValue(new Map([['get_history', null]]))
      const result = await recheck(g, who, chat)

      expect(result.shut.get('quotes')).toBe('unchecked')
      expect(result.shut.get('after')).toBe('unchecked')
    })

    it('keeps withheld over unchecked when a lost record and a failed reach read meet', async () => {
      const { gate: g, reachOf } = gate()
      reachOf.mockResolvedValue(new Map([['get_history', null]]))
      const result = await recheck(g, who, [quoted('lost', 'LD-LOST')])

      expect(result.shut.get('lost')).toBe('withheld')
    })

    it('withholds a revealing call with no codes, since nothing proves its reach', async () => {
      const { gate: g, reachOf } = gate()
      reachOf.mockResolvedValue(new Map([['get_history', new Set(['LD-0001'])]]))
      const result = await recheck(g, who, [
        {
          id: 'bare',
          codes: ['LD-0001'],
          reveals: ['comm.view-content'],
          revealing: [{ tool: 'get_history', codes: [] }],
        },
      ])

      expect(result.shut.get('bare')).toBe('withheld')
    })

    it('asks nothing when no call revealed, and leaves a tool with no reach check alone', async () => {
      const { gate: g, reachOf } = gate()
      await recheck(g, who, [{ id: 'plain', codes: ['LD-0001'], reveals: [], revealing: [] }])
      expect(reachOf).not.toHaveBeenCalled()

      const result = await recheck(g, who, [quoted('quotes', 'LD-0001')])
      expect(result.shut.size).toBe(0)
    })

    it('names the codes of the revealing calls once each', () => {
      expect(
        revealedCodes([quoted('a', 'LD-0001'), quoted('b', 'LD-0001'), quoted('c', 'OP-0002')]),
      ).toEqual(['LD-0001', 'OP-0002'])
      expect(
        revealedCodes([{ id: 'plain', codes: ['LD-0001'], reveals: [], revealing: [] }]),
      ).toEqual([])
    })
  })
})
