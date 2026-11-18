// @vitest-environment node
import 'reflect-metadata'
import type { ModuleRef } from '@nestjs/core'
import { createAccessControl, DEFAULT_ROLE_PERMISSIONS, type Actor } from '@pv/engines'
import { describe, expect, it, vi } from 'vitest'
import { AssistantToolGate } from '@api/platform/assistant/assistant-tools'
import { denied } from '@api/platform/http/problem'
import type { AccountService } from '../account/account.service'
import type { AfterSaleService } from '../after-sale/after-sale.service'
import type { CampaignService } from '../campaign/campaign.service'
import type { ContactService } from '../contact/contact.service'
import type { ContractService } from '../contract/contract.service'
import type { LeadService } from '../lead/lead.service'
import type { OpportunityStepService } from '../next-step/next-step-opportunity.service'
import type { NextStepService } from '../next-step/next-step.service'
import type { OpportunityService } from '../opportunity/opportunity.service'
import type { SearchService } from '../search/search.service'
import type { WorkstreamService } from '../workstream/workstream.service'
import { SalesAssistantTools } from './sales-assistant-tools'

/** `list_deals` on the real tool set with the deal book stubbed: what the book is asked,
 *  what is picked from its answer, and what reaches the model. The book's own fence is SQL;
 *  the eval world runs it. */

const ME: Actor = {
  id: 'u-me',
  name: 'me',
  email: 'me@pv.test',
  role: 'sale',
  roleIds: ['sale'],
  permissions: DEFAULT_ROLE_PERMISSIONS.sale,
  branches: ['Sales'],
}
const PHONE = '0901234567'

const deal = (n: number, over: object = {}) => ({
  code: `OP-${6000 + n}`,
  leadCode: `LD-${5000 + n}`,
  account: `Công ty ${n}`,
  name: `Deal ${n}`,
  holder: { id: 'u-lan', name: 'Chị Lan' },
  stage: 'engaged',
  daysInStage: 4,
  amount: 1000 * n,
  currency: 'VND',
  probability: 50,
  expectedClose: '2026-12-01',
  nextStep: { text: `Gọi ${PHONE}`, due: '2026-11-30', dueLevel: 'upcoming' },
  lastActivityAt: '2026-11-10T01:00:00.000Z',
  activityFreshness: 'fresh',
  position: { overdueBy: -2, limitDays: 6 },
  ...over,
})

const page = (rows: object[], over: object = {}) => ({
  rows,
  total: rows.length,
  hidden: 0,
  ...over,
})

function setup(answer: (q: Record<string, unknown>) => object) {
  const opportunities = {
    book: vi.fn(async (_who: Actor, q: Record<string, unknown>) => answer(q)),
    profile: vi.fn(),
  }
  const access = createAccessControl()
  const steps = { get: vi.fn() }
  const source = new SalesAssistantTools(
    {} as LeadService,
    opportunities as unknown as OpportunityService,
    {} as ContractService,
    {} as SearchService,
    access,
    steps as unknown as NextStepService,
    steps as unknown as OpportunityStepService,
    {} as AccountService,
    {} as AfterSaleService,
    {} as ModuleRef,
    {} as ContactService,
    {} as CampaignService,
    {} as WorkstreamService,
  )
  const gate = new AssistantToolGate(source, access)
  const call = (input: object = {}, who: Actor = ME) =>
    gate.call(who, { id: 'c1', name: 'list_deals', input })
  return { call, book: opportunities.book }
}

type Out = {
  deals: {
    trusted: { more: boolean }
    rows: { trusted: Record<string, unknown>; untrusted: Record<string, unknown> }[]
  }
}
const codesOf = (v: { output: unknown }) => (v.output as Out).deals.rows.map((r) => r.trusted.code)

describe('list_deals', () => {
  it('asks the open book once, by amount, and hands over each deal as trusted and untrusted', async () => {
    const s = setup(() => page([deal(2), deal(1)]))
    const verdict = await s.call()
    const out = verdict.output as Out

    expect(verdict.outcome).toBe('ok')
    expect(s.book).toHaveBeenCalledTimes(1)
    expect(s.book.mock.calls[0]?.[1]).toMatchObject({
      state: 'open',
      sort: 'amount',
      dir: 'desc',
      size: 20,
    })
    expect(s.book.mock.calls[0]?.[1]).not.toHaveProperty('sale')
    expect(out.deals.rows[0]?.trusted).toEqual({
      code: 'OP-6002',
      leadCode: 'LD-5002',
      stage: 'engaged',
      daysInStage: 4,
      amount: 2000,
      currency: 'VND',
      probability: 50,
      expectedClose: '2026-12-01',
      nextStep: { due: '2026-11-30', dueLevel: 'upcoming' },
      lastActivityAt: '2026-11-10T01:00:00.000Z',
      activityFreshness: 'fresh',
      stageOverdueBy: -2,
      stageLimitDays: 6,
    })
    expect(out.deals.rows[0]?.untrusted).toEqual({
      name: 'Deal 2',
      account: 'Công ty 2',
      holder: 'Chị Lan',
      nextStep: 'Gọi [withheld]',
    })
    expect(out).toMatchObject({ contactInfoWithheld: true })
    expect(JSON.stringify(out)).not.toContain(PHONE)
    expect(verdict).toMatchObject({ codes: ['OP-6002', 'OP-6001'], rowCount: 2, hidden: 0 })
    expect(verdict.refs.map((r) => [r.kind, r.code])).toEqual([
      ['opportunity', 'OP-6002'],
      ['opportunity', 'OP-6001'],
    ])
  })

  it('hands the day to the book for closing, and orders by expected close for that sort', async () => {
    const s = setup(() => page([deal(1)]))
    await s.call({ focus: 'closing', by: '2026-11-30', sort: 'expectedClose' })

    expect(s.book.mock.calls[0]?.[1]).toMatchObject({
      expectedTo: '2026-11-30',
      sort: 'expectedClose',
      dir: 'asc',
      size: 20,
    })
  })

  it('keeps the quiet deals only for stale, from a wider read', async () => {
    const s = setup(() =>
      page([
        deal(1, { activityFreshness: 'fresh' }),
        deal(2, { activityFreshness: 'warn' }),
        deal(3, { activityFreshness: 'alert' }),
        deal(4, { activityFreshness: null }),
      ]),
    )
    const verdict = await s.call({ focus: 'stale' })

    expect(s.book.mock.calls[0]?.[1]).toMatchObject({ size: 100 })
    expect(codesOf(verdict)).toEqual(['OP-6002', 'OP-6003'])
  })

  it('keeps a deal whose step is due by the day for step-due', async () => {
    const step = (due: string, dueLevel: string) => ({ text: 'Gọi', due, dueLevel })
    const s = setup(() =>
      page([
        deal(1, { nextStep: step('2026-11-20', 'due') }),
        deal(2, { nextStep: step('2026-12-20', 'upcoming') }),
        deal(3, { nextStep: step('2026-11-01', 'overdue') }),
        deal(4, { nextStep: step('2026-12-20', 'long-overdue') }),
        deal(5, { nextStep: null }),
      ]),
    )
    const verdict = await s.call({ focus: 'step-due', by: '2026-11-25' })

    expect(codesOf(verdict)).toEqual(['OP-6001', 'OP-6003'])
  })

  it('puts the oldest activity first for quiet and a deal never touched last', async () => {
    const s = setup(() =>
      page([
        deal(1, { lastActivityAt: '2026-11-10T00:00:00.000Z' }),
        deal(2, { lastActivityAt: null }),
        deal(3, { lastActivityAt: '2026-10-01T00:00:00.000Z' }),
      ]),
    )
    const verdict = await s.call({ sort: 'quiet' })

    expect(s.book.mock.calls[0]?.[1]).toMatchObject({ size: 100 })
    expect(codesOf(verdict)).toEqual(['OP-6003', 'OP-6001', 'OP-6002'])
  })

  it('cuts at twenty rows and says more, also when the book held more than it gave', async () => {
    const many = Array.from({ length: 25 }, (_, i) => deal(i + 1))
    const cut = await setup(() => page(many)).call({ sort: 'quiet' })
    expect(codesOf(cut)).toHaveLength(20)
    expect((cut.output as Out).deals.trusted.more).toBe(true)

    const held = await setup(() => page([deal(1)], { total: 40 })).call()
    expect((held.output as Out).deals.trusted.more).toBe(true)
    const whole = await setup(() => page([deal(1)])).call()
    expect((whole.output as Out).deals.trusted.more).toBe(false)
  })

  it('says null for the stage limit of a deal the book gives no position or limit', async () => {
    const verdict = await setup(() =>
      page([
        deal(1, { position: null }),
        deal(2, { position: { overdueBy: null, limitDays: null } }),
      ]),
    ).call()
    const rows = (verdict.output as Out).deals.rows

    expect(rows.map((r) => [r.trusted.stageOverdueBy, r.trusted.stageLimitDays])).toEqual([
      [null, null],
      [null, null],
    ])
  })

  it("carries the book's hidden count and names no code for a row it never gave", async () => {
    const verdict = await setup(() => page([deal(1)], { hidden: 7 })).call()

    expect(verdict).toMatchObject({ rowCount: 1, hidden: 7, codes: ['OP-6001'] })
  })

  it('refuses the call when the seat lacks the deal book, and a by day on a focus without one', async () => {
    const shut = { ...ME, permissions: ME.permissions.filter((p) => p !== 'opportunity.view') }
    const s = setup(() => page([deal(1)]))
    expect((await s.call({}, shut)).outcome).toBe('refused')
    expect(s.book).not.toHaveBeenCalled()

    expect((await s.call({ focus: 'closing' })).outcome).not.toBe('ok')
    expect((await s.call({ focus: 'stale', by: '2026-11-30' })).outcome).not.toBe('ok')
  })

  it('fails the call when the book refuses, and never reads a second door', async () => {
    const s = setup(() => page([]))
    s.book.mockRejectedValue(denied('permission-denied'))
    const verdict = await s.call()

    expect(verdict.outcome).not.toBe('ok')
  })
})
