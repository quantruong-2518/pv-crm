import { eq } from 'drizzle-orm'
import { assistantReport } from '@api/platform/assistant/assistant.schema'
import { runTurn } from './bench'
import type { Check, Tally } from './report'
import { seatOf } from './scope-customers-oracle'
import { answersOf, serviceOf } from './scope-history-reach'
import { parrot } from './scripted-client'
import { scopedSeatId, wideSeatId, type Seat } from './seed-data'
import type { World } from './world'

/** A stored answer that the asker's scope decided (a count of one's own book, the money
 *  only a wide seat is given) does not replay to an own-only reviewer of another person's
 *  chat; a wide reviewer reads it, and its owner reads it again. Answers that did not
 *  depend on scope (the figures) are served to both. Seats are those of the role that holds
 *  `assistant.review`, plus the grants the stored calls are replayed under. */

const REVIEW = ['assistant.review', 'contract.view', 'lead.view', 'performance.view'] as const

const reviewer = (id: string): Seat => {
  const base = seatOf(id)
  return { ...base, permissions: [...new Set([...base.permissions, ...REVIEW])] }
}

type Stored = { name: string; input: Record<string, unknown> }

/** What the reviewer's page says of the one answer `owner` reported, and what `owner` reads. */
async function replayed(world: World, owner: Seat, stored: Stored, reviewers: Seat[]) {
  const service = serviceOf(world)
  const trail = await runTurn(world, { who: owner, script: [{ calls: [stored] }, parrot] })
  const id = trail.turnId ?? ''
  await service.report(owner, id, { reason: 'missing' })
  const seen: boolean[] = []
  for (const who of reviewers) {
    const page = await service.reports(who, { page: 1, size: 50 })
    const row = page.rows.find((r) => r.reporterName === owner.name)
    if (!row) throw new Error(`no report row from ${owner.name} for a reviewer`)
    seen.push(row.withheld)
  }
  const mine = answersOf(await service.detail(owner, trail.sessionId)).map((m) => m.withheld)
  await world.db.delete(assistantReport).where(eq(assistantReport.messageId, id))
  return { seen, mine }
}

async function checkReplay(world: World, c: Check, owner: Seat, stored: Stored, cut: boolean) {
  const own = reviewer(scopedSeatId('account-executive'))
  const wide = reviewer(wideSeatId('account-executive'))
  c.ok(own.ownOnly && !wide.ownOnly, 'the two reviewers differ in scope only')
  const { seen, mine } = await replayed(world, owner, stored, [own, wide])
  c.eq(seen, [cut, false], `own-only reviewer, wide reviewer: withheld`)
  c.eq(mine, [false], 'its owner reads it again')
}

/** An own-only reviewer who reported their own money answer is served it. */
async function checkOwnReport(world: World, c: Check) {
  const own = reviewer(scopedSeatId('account-executive'))
  const stored = call('get_performance', { part: 'money', grain: 'month' })
  const { seen, mine } = await replayed(world, own, stored, [own])
  c.eq(seen, [false], 'own-only reviewer reads their own reported money answer')
  c.eq(mine, [false], 'and reads it in their own chat')
}

const call = (name: string, input: Record<string, unknown>) => ({ name, input })

/** Per group: the answer's name, who stored it, the call, and whether scope cut it. */
const CASES: Record<string, [string, string, Stored, boolean][]> = {
  'scope-figures': [
    [
      'money',
      wideSeatId('director'),
      call('get_performance', { part: 'money', grain: 'month' }),
      true,
    ],
    [
      'figures',
      wideSeatId('director'),
      call('get_performance', { part: 'figures', grain: 'month' }),
      false,
    ],
  ],
  'scope-counts': [
    ['count of another seat', scopedSeatId('sale'), call('count_records', { of: 'deals' }), true],
  ],
}

export async function replayToReviewers(world: World, tally: Tally, group: string): Promise<void> {
  for (const [name, ownerId, stored, cut] of CASES[group] ?? []) {
    await tally.run(group, `a stored ${name} answer, replayed to an own-only reviewer`, (c) =>
      checkReplay(world, c, seatOf(ownerId), stored, cut),
    )
  }
  if (group === 'scope-figures') {
    await tally.run(group, 'an own-only reviewer reads their own reported money answer', (c) =>
      checkOwnReport(world, c),
    )
  }
}
