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
