import { HOLD_DUE_NEAR_DAYS } from '@pv/engines'
import type { hold } from '@api/branches/sales/hold/hold.schema'
import { addDays, dayOf, vnAt } from './clock'
import { beatsOf, type DealView } from './emit-deals-view'
import type { Day } from './story.types'
import type { Ctx } from './types'

/** A deal's hold, bent to what the real doors allow: a held deal takes no
 *  stage move, activity, quote or sign request, so the hold is set after the
 *  last of those (open) or squeezed between two of them (ended). The deal doors
 *  only write the end kinds `resumed` (end door) and `stopped` (stop door), so
 *  the generator's `touch` / `converted` / `to-waiting` are remapped to those.
 *  A hold that cannot fit is dropped: no guarantee of this emitter needs it. */

export type HoldRow = typeof hold.$inferInsert

const MIN = 60_000
const NOTES = [
  'Khách xin hoãn đến sau kỳ nghỉ',
  'Khách chờ duyệt ngân sách',
  'Chờ khách xác nhận lại nhu cầu',
  'Khách đang kiểm kê cuối quý',
  'Khách chờ ban giám đốc họp',
]
const BLOCKING = new Set(['stage', 'activity', 'quote', 'sign-requested', 'sign-decided', 'signed'])

const minute = (ms: number): Date => new Date(Math.round(ms / MIN) * MIN)

/** What the reminder sweep (`HoldReminderRepository.claim`) would have stamped by
 *  now on an open hold, same predicate: the day bell once `until` is today or
 *  past, the half-month warning once its window opened, and only for a hold set
 *  before the window did. A hold the sweep has not reached stays unmarked and
 *  rings on its own day. */
export function reminderMarks(
  ctx: Ctx,
  until: Day,
  setAt: Date,
): Pick<HoldRow, 'remindedSoonAt' | 'remindedDueAt'> {
  const windowOpens = addDays(until, -HOLD_DUE_NEAR_DAYS)
  const stamp = (day: Day): Date =>
    new Date(Math.min(ctx.now.getTime(), Math.max(setAt.getTime(), vnAt(day, 8).getTime())))
  return {
    remindedSoonAt:
      windowOpens <= ctx.today && dayOf(setAt) < windowOpens ? stamp(windowOpens) : null,
    remindedDueAt: until <= ctx.today ? stamp(until) : null,
  }
}

function signWaiting(v: DealView): boolean {
  const open = beatsOf(v.story, 'sign-requested').length
  return open > beatsOf(v.story, 'sign-decided').length
}

function openHold(v: DealView, until: string, blocked: number[]): HoldRow | null {
  if (v.closedAt || signWaiting(v)) return null
  const floor = Math.max(v.accepted?.at.getTime() ?? 0, ...blocked)
  const noon = vnAt(until, 12).getTime()
  const ceiling = Math.min(v.ctx.now.getTime(), noon)
  if (ceiling - floor < 20 * MIN) return null
  const at = minute(floor + (ceiling - floor) * v.ctx.rng.real(0.2, 0.8))
  const by = v.saleAt(at)
  return {
    subjectType: 'opportunity',
    subjectCode: v.op,
    untilDay: until,
    note: v.ctx.rng.pick(NOTES),
    setBy: by,
    setAt: at,
    ...reminderMarks(v.ctx, until, at),
  }
}

function endedHold(v: DealView, until: string, at: Date, ended: Date): HoldRow {
  return {
    subjectType: 'opportunity',
    subjectCode: v.op,
    untilDay: until,
    note: v.ctx.rng.pick(NOTES),
    setBy: v.saleAt(at),
    setAt: at,
    endedAt: ended,
    endKind: 'resumed',
    endedBy: v.saleAt(ended),
    remindedSoonAt: null,
    remindedDueAt: null,
  }
}

/** The hold row of the deal, or none. Generator beats carry at most one hold. */
export function dealHold(v: DealView): HoldRow | null {
  const set = beatsOf(v.story, 'hold-set').find((b) => b.on === 'deal')
  if (!set) return null
  const end = beatsOf(v.story, 'hold-ended').find((b) => b.on === 'deal')
  const blocked = v.story.beats.flatMap((b) =>
    BLOCKING.has(b.kind) && 'at' in b ? [b.at.getTime()] : [],
  )
  if (!end) return openHold(v, set.until, blocked)

  const floor = Math.max(
    v.accepted?.at.getTime() ?? 0,
    ...blocked.filter((t) => t <= set.at.getTime()),
  )
  const at = minute(Math.max(set.at.getTime(), floor + MIN))
  const limit = v.closedAt ?? v.ctx.now
  const next = Math.min(limit.getTime(), ...blocked.filter((t) => t > at.getTime()))
  const stopped = end.end === 'to-waiting' && v.lost !== null && next >= v.lost.at.getTime()
  if (stopped && v.lost) {
    if (v.lost.at.getTime() < at.getTime() + MIN) return null
    const row = endedHold(v, set.until, at, v.lost.at)
    return { ...row, endKind: 'stopped', endedBy: v.lost.by }
  }
  const ended = minute(Math.min(end.at.getTime(), next - MIN))
  if (ended.getTime() < at.getTime() + MIN) return null
  return endedHold(v, set.until, at, ended)
}
