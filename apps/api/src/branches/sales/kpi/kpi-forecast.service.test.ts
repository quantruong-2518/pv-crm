// @vitest-environment node
import 'reflect-metadata'
import { createAccessControl, DEFAULT_ROLE_PERMISSIONS, type Actor } from '@pv/engines'
import { KPI_CATALOG, type KpiForecastResponse } from '@pv/contracts'
import { describe, expect, it } from 'vitest'
import { KpiForecastService } from './kpi-forecast.service'
import { vietnamToday } from './kpi-rules'

/** The pipeline figure on a signed-value line follows `pipelineSight`; the
 *  repositories are doubles, so only what the service lets through is under test. */

const access = createAccessControl()
const period = vietnamToday().slice(0, 7)
const person = (id: string): Actor => ({
  id,
  name: id,
  email: `${id}@pv.test`,
  role: 'sale',
  roleIds: ['sale'],
  permissions: DEFAULT_ROLE_PERMISSIONS['sale'],
  branches: ['Sales'],
})
const lead = person('u-lead')
const member = person('u-member')
const PIPELINE = 7

const service = new KpiForecastService(
  {
    people: async () => [member, lead].map(({ id, name }) => ({ id, name, roleIds: ['sale'] })),
    person: async (id: string) => ({ id, name: id, roleIds: ['sale'] }),
    adjustments: async () => ({ applied: new Map(), sourced: new Map() }),
    monthValues: async () => new Map(),
    pipeline: async () => ({
      own: new Map([
        [lead.id, PIPELINE],
        [member.id, PIPELINE],
      ]),
      room: 0,
    }),
  } as never,
  { ofPeriod: async () => [] } as never,
  { agreedLines: async () => [] } as never,
  { value: async () => ({ value: 50 }) } as never,
  { effectiveCatalog: async () => KPI_CATALOG } as never,
  { of: async () => null } as never,
  {
    rosterAt: async () => [
      { teamId: 't1', teamName: 'T1', actorId: lead.id, lead: true },
      { teamId: 't1', teamName: 'T1', actorId: member.id, lead: false },
    ],
  } as never,
  access,
  {
    readsTeam: async (who: Actor, roster: { leadOf(t: string): string | null }, team: string) =>
      roster.leadOf(team) === who.id,
  } as never,
  { sources: async () => ({ slotsFor: () => [], acksFor: () => [] }) } as never,
)

const signedOf = (out: KpiForecastResponse, actorId: string) =>
  out.items.find((i) => i.actorId === actorId && i.metricKey === 'signed-value')

describe('pipeline on the forecast', () => {
  it('a team lead reading a member sees no pipeline on that line', async () => {
    const line = signedOf(await service.ofPerson(lead, period, member.id), member.id)
    expect(line).toBeDefined()
    expect(line?.pipeline).toBeNull()
  })

  it('a caller reads the pipeline of their own line', async () => {
    const line = signedOf(await service.mine(lead, period), lead.id)
    expect(line?.pipeline).toBe(PIPELINE)
  })

  it('the sweep, which passes no reader, computes none', async () => {
    const out = await service.everyone(period)
    expect(out.items.length).toBeGreaterThan(0)
    expect(out.items.every((i) => i.pipeline === null)).toBe(true)
  })
})
