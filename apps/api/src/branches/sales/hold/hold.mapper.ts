import type { Hold, HoldRow } from '@pv/contracts'
import { dueLevelOf, HOLD_DUE_NEAR_DAYS } from '@pv/engines'
import type { HoldRead } from './hold.sql'

/** A stored hold → the wire's `Hold`, graded on the shared due ladder with the
 *  hold's own near window. `today` is the caller's Vietnam day (`vnDay`), so a
 *  profile, the list and the journey grade one hold the same way on one day. */
export function toHold(read: HoldRead, today: string): Hold {
  return {
    subjectType: read.subjectType,
    code: read.code,
    until: read.untilDay,
    note: read.note,
    setBy: read.setBy,
    setAt: read.setAt.toISOString(),
    dueLevel: dueLevelOf(read.untilDay, today, undefined, HOLD_DUE_NEAR_DAYS),
  }
}

/** One row of `GET /sales/holds`: the hold plus what the list prints beside it. */
export function toHoldRow(
  read: HoldRead,
  today: string,
  extra: Pick<HoldRow, 'name' | 'customer' | 'holder' | 'stepLabel'>,
): HoldRow {
  return { ...toHold(read, today), ...extra }
}
