// @vitest-environment node
import 'reflect-metadata'
import { Controller, Get, type Type } from '@nestjs/common'
import { createAccessControl, DEFAULT_ROLE_PERMISSIONS, type Actor } from '@pv/engines'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Need, Public } from '../access/need.decorator'
import { denied, invalid, notFound } from '../http/problem'
import {
  AssistantToolGate,
  defineTool,
  door,
  type RevealReach,
  type ToolDoor,
  type ToolRead,
} from './assistant-tools'

/** The boot check and the gate, on E2 itself. Marketing is the failure the gate
 *  exists for: `lead.view` without `contract.view`. */

@Controller('fake')
class FakeDoors {
  @Get('lead')
  @Need({ branch: 'Sales', permission: 'lead.view', scoped: true })
  lead() {}

  @Get('contract')
  @Need({ branch: 'Sales', permission: 'contract.view', scoped: true })
  contract() {}

  @Get('naked')
  naked() {}

  @Get('public')
  @Public()
  open() {}

  plain() {}
}

@Controller('fake-class')
@Need({ branch: 'Sales', permission: 'contract.view' })
class ClassNeedDoors {
  @Get()
  read() {}
}

const marketing: Actor = {
  id: 'u-mkt',
  name: 'Marketing',
  email: 'mkt@pv.test',
  role: 'Marketing',
  roleIds: ['marketing'],
  permissions: DEFAULT_ROLE_PERMISSIONS.marketing,
  branches: ['Sales'],
}

const Input = z.object({ kind: z.enum(['lead', 'contract']) }).strict()
const READ: ToolRead = { data: { trusted: {} }, codes: ['LD-0001'], rowCount: 1, hidden: null }

const toolOf = (doors: Record<string, ToolDoor>, run = vi.fn(async () => READ), name = 'read_x') =>
  defineTool({
    name,
    description: 'Fake.',
    input: Input,
    doors,
    doorFor: (input) => input.kind,
    run,
  })

const call = (input: Record<string, unknown>, name = 'read_x') => ({ id: 'c1', name, input })

const gateOf = (...tools: ReturnType<typeof toolOf>[]) =>
  new AssistantToolGate({ tools: () => tools }, createAccessControl())

const boots = (controller: Type<FakeDoors>, handler: keyof FakeDoors) =>
  gateOf(toolOf({ lead: door(controller, handler) }))

describe('the boot check', () => {
  it('refuses a door with no @Need', () => {
    expect(() => boots(FakeDoors, 'naked')).toThrow(/declares no @Need/)
  })

  it('refuses a public door: nothing would gate the tool', () => {
    expect(() => boots(FakeDoors, 'open')).toThrow(/is public/)
  })

  it('refuses an unknown handler and a method that is no route', () => {
    expect(() => gateOf(toolOf({ lead: [FakeDoors, 'gone'] }))).toThrow(/no route handler/)
    expect(() => boots(FakeDoors, 'plain')).toThrow(/no route handler/)
  })

  it('refuses an optional door the tool does not name', () => {
    const tool = defineTool({
      name: 'read_y',
      description: 'Fake.',
      input: Input,
      doors: { lead: door(FakeDoors, 'lead') },
      optional: ['gone' as 'lead'],
      doorFor: () => 'lead',
      run: async () => READ,
    })
    expect(() => gateOf(tool)).toThrow(/optional door gone is no door/)
  })

  it('reads the class need when the handler has none, as the guard does', async () => {
    const run = vi.fn(async () => READ)
    const gate = gateOf(toolOf({ lead: door(ClassNeedDoors, 'read') }, run))
    const verdict = await gate.call(marketing, call({ kind: 'lead' }))
    expect(verdict.outcome).toBe('refused')
    expect(run).not.toHaveBeenCalled()
  })

  it('refuses a repeated name, a name the table refuses and a loose schema', () => {
    const doors = { lead: door(FakeDoors, 'lead') }
    expect(() => gateOf(toolOf(doors), toolOf(doors))).toThrow(/twice/)
    expect(() => gateOf(toolOf(doors, undefined, 'readRecord'))).toThrow(/bad name/)
    const loose = defineTool({
      name: 'loose',
      description: 'Fake.',
      input: z.object({ kind: z.string() }),
      doors,
      doorFor: () => 'lead',
      run: async () => READ,
    })
    expect(() => new AssistantToolGate({ tools: () => [loose] }, createAccessControl())).toThrow(
      /not strict/,
    )
  })
})

describe('the gate', () => {
  const doors = { lead: door(FakeDoors, 'lead'), contract: door(FakeDoors, 'contract') }

  it('picks the need from the parsed input and refuses before any service', async () => {
    const run = vi.fn(async () => READ)
    const gate = gateOf(toolOf(doors, run))

    const refused = await gate.call(marketing, call({ kind: 'contract' }))
    expect(refused).toMatchObject({
      outcome: 'refused',
      output: { error: 'not-allowed' },
      denied: 'permission-denied',
      rowCount: null,
    })
    expect(run).not.toHaveBeenCalled()

    const passed = await gate.call(marketing, call({ kind: 'lead' }))
    expect(passed).toMatchObject({ outcome: 'ok', codes: ['LD-0001'], denied: null })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("hands the door's own hidden count to the model, and none when it gives none", async () => {
    const hidden = gateOf(toolOf(doors, async () => ({ ...READ, hidden: 2 })))
    const told = await hidden.call(marketing, call({ kind: 'lead' }))
    expect(told).toMatchObject({ hidden: 2, output: { hidden: 2 } })
    const silent = await gateOf(toolOf(doors)).call(marketing, call({ kind: 'lead' }))
    expect(silent.output).toEqual(READ.data)
  })

  it('fails an identity argument on the schema, before the gate', async () => {
    const run = vi.fn(async () => READ)
    const verdict = await gateOf(toolOf(doors, run)).call(
      marketing,
      call({ kind: 'lead', actorId: 'u-boss' }),
    )
    expect(verdict.outcome).toBe('bad-input')
    expect(run).not.toHaveBeenCalled()
  })

  it('answers an invented tool without running anything', async () => {
    const verdict = await gateOf(toolOf(doors)).call(marketing, call({ kind: 'lead' }, 'nope'))
    expect(verdict.outcome).toBe('unknown-tool')
  })

  it('makes a 403 and a 404 from the door read the same to the model', async () => {
    const answer = (error: Error) =>
      gateOf(
        toolOf(doors, async () => {
          throw error
        }),
      ).call(marketing, call({ kind: 'lead' }))
    const forbidden = await answer(denied('out-of-scope', 'Lead LD-0009 không do bạn phụ trách.'))
    const missing = await answer(notFound('lead', 'LD-0009'))
    expect(forbidden.output).toEqual({ error: 'not-found-or-not-allowed' })
    expect(missing.output).toEqual(forbidden.output)
    expect(forbidden).toMatchObject({ outcome: 'refused', rowCount: 0, denied: null })

    expect((await answer(invalid({ code: ['Mã hồ sơ sai dạng.'] }))).outcome).toBe('bad-input')
    const crashed = await answer(new Error('select … where tax_code = 0312345678'))
    expect(crashed).toMatchObject({ outcome: 'error', output: { error: 'tool-failed' } })
  })
})

describe('content a tool reveals', () => {
  const doors = { lead: door(FakeDoors, 'lead') }
  const revealing = (reveals?: 'comm.view-content') =>
    defineTool({
      name: 'read_x',
      description: 'Fake.',
      input: Input,
      doors,
      doorFor: (input) => input.kind,
      reveals,
      run: async () => ({ ...READ, revealsContent: true }),
    })
  const sale = { ...marketing, permissions: ['lead.view', 'comm.view-content'] } as Actor

  it('carries the flag to the verdict, false when the tool says nothing', async () => {
    const plain = await gateOf(toolOf(doors)).call(sale, call({ kind: 'lead' }))
    const flagged = await gateOf(revealing('comm.view-content')).call(sale, call({ kind: 'lead' }))
    expect(plain.revealsContent).toBe(false)
    expect(flagged).toMatchObject({ outcome: 'ok', revealsContent: true })
  })

  it('takes a tool that names a permission to reveal unless it says it did not', async () => {
    const tool = (revealsContent?: boolean) =>
      defineTool({
        name: 'read_x',
        description: 'Fake.',
        input: Input,
        doors,
        doorFor: (input) => input.kind,
        reveals: 'comm.view-content',
        run: async () => ({ ...READ, revealsContent }),
      })
    const flag = async (revealsContent?: boolean) =>
      (await gateOf(tool(revealsContent)).call(sale, call({ kind: 'lead' }))).revealsContent
    expect(await flag()).toBe(true)
    expect(await flag(true)).toBe(true)
    expect(await flag(false)).toBe(false)
  })

  it('fails a call that reveals content under no declared permission', async () => {
    const verdict = await gateOf(revealing()).call(sale, call({ kind: 'lead' }))
    expect(verdict).toMatchObject({ outcome: 'error', revealsContent: false })
  })

  it('names the permission of each revealing stored call, null for a tool gone or silent', () => {
    const gate = gateOf(revealing('comm.view-content'), toolOf(doors, undefined, 'read_y'))
    const stored = (name: string, revealsContent: boolean) => ({ name, revealsContent })
    expect(
      gate.revealsOf([
        stored('read_x', true),
        stored('read_x', false),
        stored('read_y', true),
        stored('gone', true),
      ]),
    ).toEqual(['comm.view-content', null, null])
  })

  it('asks each tool with a reach check once for the codes of all its calls, and fails to null', async () => {
    const reach = vi.fn(async (_who: Actor, codes: readonly string[]) => new Set(codes.slice(0, 1)))
    const tool = defineTool({
      name: 'read_x',
      description: 'Fake.',
      input: Input,
      doors,
      doorFor: (input) => input.kind,
      reveals: 'comm.view-content',
      revealReach: { door: 'lead', read: reach },
      run: async () => ({ ...READ, revealsContent: true }),
    })
    const gate = gateOf(tool, toolOf(doors, undefined, 'read_y'))
    const calls = [
      { tool: 'read_x', codes: ['LD-0001', 'LD-0002'] },
      { tool: 'read_x', codes: ['LD-0002', 'LD-0003'] },
      { tool: 'read_y', codes: ['LD-0001'] },
    ]

    const reached = await gate.reachOf(sale, calls)
    expect(reach).toHaveBeenCalledTimes(1)
    expect(reach).toHaveBeenCalledWith(sale, ['LD-0001', 'LD-0002', 'LD-0003'])
    expect([...reached.keys()]).toEqual(['read_x'])
    expect(reached.get('read_x')).toEqual(new Set(['LD-0001']))

    reach.mockRejectedValue(new Error('select … where phone = 0912345678'))
    expect((await gate.reachOf(sale, calls)).get('read_x')).toBeNull()
  })

  describe('a tool with a reach check', () => {
    const reachTool = (read: RevealReach) =>
      defineTool({
        name: 'read_x',
        description: 'Fake.',
        input: Input,
        doors: { lead: door(FakeDoors, 'lead'), contract: door(FakeDoors, 'contract') },
        doorFor: (input) => input.kind,
        reveals: 'comm.view-content',
        revealReach: { door: 'contract', read },
        run: async () => ({ ...READ, revealsContent: true }),
      })
    const calls = [{ tool: 'read_x', codes: ['LD-0001'] }]

    it("reaches nothing for a reader who lacks the reach door's own need", async () => {
      const read = vi.fn(async (_who: Actor, codes: readonly string[]) => new Set(codes))
      const gate = gateOf(reachTool(read))
      const noContract = {
        ...sale,
        permissions: ['lead.view', 'comm.view-content'],
      } as Actor
      const withContract = { ...sale, permissions: [...sale.permissions, 'contract.view'] } as Actor

      expect((await gate.reachOf(noContract, calls)).get('read_x')).toEqual(new Set())
      expect(read).not.toHaveBeenCalled()
      expect((await gate.reachOf(withContract, calls)).get('read_x')).toEqual(new Set(['LD-0001']))
    })

    it('turns a reach read that throws before it returns a promise into null', async () => {
      const gate = gateOf(
        reachTool(() => {
          throw new Error('module not resolved')
        }),
      )
      const withContract = { ...sale, permissions: [...sale.permissions, 'contract.view'] } as Actor

      expect((await gate.reachOf(withContract, calls)).get('read_x')).toBeNull()
    })

    it('refuses to boot when the reach door is not one of the tool doors', () => {
      const tool = defineTool({
        name: 'read_x',
        description: 'Fake.',
        input: Input,
        doors: { lead: door(FakeDoors, 'lead') },
        doorFor: (input) => input.kind,
        reveals: 'comm.view-content',
        revealReach: { door: 'lead', read: async () => new Set() },
        run: async () => READ,
      })
      expect(() =>
        gateOf({ ...tool, revealReach: { door: 'nope', read: async () => new Set() } }),
      ).toThrow(/reach door nope is no door/)
    })
  })
})
