// @vitest-environment node
import 'reflect-metadata'
import { createAccessControl, DEFAULT_ROLE_PERMISSIONS, type Actor, type RoleId } from '@pv/engines'
import { KPI_CATALOG } from '@pv/contracts'
import { describe, expect, it } from 'vitest'
import { NEED_KEY, type RouteNeed } from '@api/platform/access/need.decorator'
import { KpiAssignmentReader } from './kpi-assignment-read.service'
import type { Book } from './kpi-assignment.mapper'
import { pipelineSight } from './kpi-forecast-sight'
import { KpiHistoryService } from './kpi-history.service'
import { KpiController } from './kpi.controller'

/** The KPI read doors closed on 10/11/2026: company card, every role's targets
 *  and the role-target history sit on `kpi.view-all`; a room seat's pipeline
 *  needs the deal book. The seats are the shipped defaults. */

const access = createAccessControl()
const seat = (role: RoleId, over: Partial<Actor> = {}): Actor => ({
  id: `u-${role}`,
  name: role,
  email: `${role}@pv.test`,
  role,
  roleIds: [role],
  permissions: DEFAULT_ROLE_PERMISSIONS[role],
  branches: ['Sales'],
  ...over,
})
const sale = seat('sale')
const director = seat('director')

const needOf = (method: keyof KpiController) =>
  Reflect.getMetadata(NEED_KEY, KpiController.prototype[method]) as RouteNeed

describe('door permissions', () => {
  it.each(['company', 'targets'] as const)('%s needs kpi.view-all', (method) => {
    const need = needOf(method)
    expect(need.permission).toBe('kpi.view-all')
    expect(access.allows(sale, need.permission)).toBe(false)
    expect(access.allows(sale, 'kpi.view')).toBe(true)
    expect(access.allows(director, need.permission)).toBe(true)
  })
})

describe('role-target history', () => {
  const targets = { ofPeriod: async () => [] }
  const service = new KpiHistoryService(
    targets as never,
    {} as never,
    {} as never,
    {} as never,
    access,
    {} as never,
  )
  const query = { role: 'sale', metricKey: 'signed-value' } as const

  it('refuses a kpi.view seat', async () => {
    await expect(service.history(sale, '2026-10', query)).rejects.toMatchObject({
      kind: 'forbidden',
    })
  })

  it('answers a kpi.view-all seat', async () => {
    const out = await service.history(director, '2026-10', query)
    expect(out.entries).toEqual([])
  })
})

describe('pipeline sight', () => {
  const room = 'room'
  const own = 'own'

  it('a view-all reader with the book sees everyone and the room', () => {
    const sees = pipelineSight(access, director)
    expect(sees('u-someone', own)).toBe(true)
    expect(sees(director.id, room)).toBe(true)
    expect(sees('u-someone', room)).toBe(true)
  })

  it('an ownOnly room seat sees no room pipeline, only its own deals', () => {
    const sees = pipelineSight(access, { ...director, ownOnly: true })
    expect(sees(director.id, room)).toBe(false)
    expect(sees('u-someone', own)).toBe(false)
    expect(sees(director.id, own)).toBe(true)
  })

  it('a room seat without opportunity.view sees no room pipeline', () => {
    const permissions = DEFAULT_ROLE_PERMISSIONS['head-of-sales'].filter(
      (p) => p !== 'opportunity.view',
    )
    const sees = pipelineSight(access, seat('head-of-sales', { permissions }))
    expect(sees('u-head-of-sales', room)).toBe(false)
    expect(sees('u-someone', own)).toBe(false)
  })

  it('a kpi.view seat sees its own deals and nobody else', () => {
    const sees = pipelineSight(access, sale)
    expect(sees(sale.id, own)).toBe(true)
    expect(sees('u-someone', own)).toBe(false)
    expect(sees('u-someone', room)).toBe(false)
  })

  it('a head of sales without view-all sees its own room seat and no one else', () => {
    const permissions = DEFAULT_ROLE_PERMISSIONS['head-of-sales'].filter(
      (p) => p !== 'kpi.view-all',
    )
    const head = seat('head-of-sales', { permissions })
    const sees = pipelineSight(access, head)
    expect(sees(head.id, room)).toBe(true)
    expect(sees('u-someone', room)).toBe(false)
    expect(sees('u-someone', own)).toBe(false)
  })

  it('an ownOnly seller still sees the pipeline of its own seat', () => {
    const sees = pipelineSight(access, { ...sale, ownOnly: true })
    expect(sees(sale.id, own)).toBe(true)
    expect(sees('u-someone', own)).toBe(false)
  })
})

describe('last month on a company seat', () => {
  const company = 'unit-company'
  const WHOLE_BOOK = 900
  const book = {
    period: '2026-12',
    tree: {
      from: '2026-12',
      nodes: [{ unitId: company, kind: 'company', name: 'PV', parentId: null }],
      members: [
        {
          actorId: 'u-director',
          unitId: company,
          head: true,
          locked: false,
          roleIds: ['director'],
        },
      ],
    },
    sets: [],
    lines: [],
  } as unknown as Book
  const reader = new KpiAssignmentReader(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    access,
    {} as never,
    {
      figures: async () => (_role: string, actorId: string) => (actorId === '' ? WHOLE_BOOK : 1),
    } as never,
  )
  const lastMonth = (who: Actor) =>
    reader['lastMonth'](who, book, KPI_CATALOG, 'director', company, '2026-11-10')

  it('shows the whole-book totals to a kpi.view-all reader', async () => {
    const out = await lastMonth(director)
    expect(out.totals.some((t) => t.value === WHOLE_BOOK)).toBe(true)
  })

  it('keeps them from a performance.view reader without kpi.view-all', async () => {
    const permissions = [
      ...DEFAULT_ROLE_PERMISSIONS['sale'].filter((p) => p !== 'kpi.view-all'),
      'performance.view' as const,
    ]
    const who = seat('sale', { permissions })
    expect(access.allows(who, 'performance.view')).toBe(true)
    expect(access.allows(who, 'kpi.view-all')).toBe(false)
    const out = await lastMonth(who)
    expect(out.totals).toEqual([])
  })
})
