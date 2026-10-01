import { StageKey, type CareActivityKind, type TouchKind } from '@pv/contracts'
import { MILESTONE_TOUCH, NOTE } from '@api/branches/sales/opportunity/opportunity.mapper'
import type { DealSeed } from './seed-book'

/** One seeded deal's walk across the board, written the way the stage writer
 *  writes it (ADR 0072): the head's accept leaves a `stage-changed` line, the
 *  first care activity moves `assigned` → `engaged` under its own touch, a
 *  quotation moves to `quotation` under `quotation-sent`, and later activities
 *  move nothing. No extra `stage-changed` beside a milestone — the writer
 *  writes one line per move. Pure, so `seed.ts` only pushes the rows. */

export type WalkHand = 'bd' | 'head' | 'owner'
export type WalkMove = { at: Date; from: StageKey | null; to: StageKey; by: WalkHand }
export type WalkTouch = {
  at: Date
  kind: TouchKind
  note: string
  by: WalkHand
  activity: CareActivityKind | null
}

/** What a deal that went through `engaged` did there unless its seed says. */
const DEFAULT_ACTIVITIES: [CareActivityKind, ...CareActivityKind[]] = ['sample', 'poc']

export function walkDeal(
  d: DealSeed,
  ago: (days: number, hours: number) => Date,
  end: Date,
): { moves: WalkMove[]; touches: WalkTouch[] } {
  const path = StageKey.options
    .slice(0, StageKey.options.indexOf(d.stage) + 1)
    .filter((s) => !(d.skipEngaged && s === 'engaged'))
  /* Columns spread evenly from the day it opened to the day it reached the last one. */
  const when = path.map((_, k) =>
    k === 0
      ? ago(d.enteredDaysAgo, 8)
      : ago(d.enteredDaysAgo - ((d.enteredDaysAgo - d.stageDaysAgo) * k) / (path.length - 1), 4),
  )
  const moves = path.map((to, k): WalkMove => ({
    at: when[k]!,
    from: k === 0 ? null : path[k - 1]!,
    to,
    /* BD opened it; `assigned` is the head's accept (ADR 0071). */
    by: k === 0 ? 'bd' : to === 'assigned' ? 'head' : 'owner',
  }))

  const touches: WalkTouch[] = []
  for (const m of moves) {
    if (m.to === 'assigned') {
      touches.push({ ...m, kind: 'stage-changed', note: NOTE.moved(m.from, m.to), activity: null })
    }
    if (m.to === 'quotation') {
      const note = NOTE.milestone('quotation')
      touches.push({ ...m, kind: MILESTONE_TOUCH.quotation, note, activity: null })
    }
  }

  /* The first activity IS the move into `engaged`; the rest follow it before
     the deal moved on, closed, or now. */
  const e = path.indexOf('engaged')
  if (e >= 0) {
    const activities = d.activities ?? DEFAULT_ACTIVITIES
    const start = when[e]!.getTime()
    const span = (when[e + 1] ?? end).getTime() - start
    activities.forEach((activity, k) =>
      touches.push({
        at: new Date(start + (span * k) / activities.length),
        kind: MILESTONE_TOUCH[activity],
        note: NOTE.milestone(activity),
        by: 'owner',
        activity,
      }),
    )
  }
  return { moves, touches }
}
