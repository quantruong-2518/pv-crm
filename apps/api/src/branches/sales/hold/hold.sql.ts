import { and, asc, eq, inArray, isNull, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import type { HoldEndKind, HoldSubjectType } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { opportunity } from '../opportunity/opportunity.schema'
import { hold } from './hold.schema'

/** THE reads and the two writes (end, deal clock) every door shares about
 *  "is this held" (ADR 0097 §3). Module-free, `open-deal.ts`'s shape: the lead
 *  state writer, the two books, the profiles and the journey all ask here, and
 *  none of them may import the hold module, which imports the lead and deal modules.
 *
 *  Raw fragments use private aliases for `open-deal.ts`'s reason: they ride
 *  inside queries whose outer FROM may itself be a table they name. */

const heldAs = (type: HoldSubjectType, code: SQLWrapper): SQL =>
  sql`EXISTS (SELECT 1 FROM sales.hold hs_o WHERE hs_o.subject_type = ${type} AND hs_o.subject_code = ${code} AND hs_o.ended_at IS NULL)`

/** The lead has an open hold. `code` is the OUTER lead code. */
export const leadHeld = (code: SQLWrapper): SQL => heldAs('lead', code)

/** The deal has an open hold. `code` is the OUTER deal code. */
export const dealHeld = (code: SQLWrapper): SQL => heldAs('opportunity', code)

/** One open hold, as stored, with the setter's name. `untilDay` is the
 *  `date` column's `YYYY-MM-DD`; the due level needs a clock, so the mapper adds it. */
export type HoldRead = {
  subjectType: HoldSubjectType
  code: string
  untilDay: string
  note: string | null
  setBy: { id: string; name: string }
  setAt: Date
}

/** Open holds on these subjects, keyed by code. A typed select, not `json_agg`:
 *  the two drivers disagree on timestamps inside raw JSON (`lead.mapper.ts`). */
export async function openHoldsOf(
  handle: Db,
  type: HoldSubjectType,
  codes: readonly string[],
): Promise<Map<string, HoldRead>> {
  if (codes.length === 0) return new Map()
  const rows = await handle
    .select({
      code: hold.subjectCode,
      untilDay: hold.untilDay,
      note: hold.note,
      setById: hold.setBy,
      setByName: actor.name,
      setAt: hold.setAt,
    })
    .from(hold)
    .innerJoin(actor, eq(actor.id, hold.setBy))
    .where(
      and(eq(hold.subjectType, type), inArray(hold.subjectCode, [...codes]), isNull(hold.endedAt)),
    )
    .orderBy(asc(hold.subjectCode))
  return new Map(
    rows.map((r) => [
      r.code,
      {
        subjectType: type,
        code: r.code,
        untilDay: r.untilDay,
        note: r.note,
        setBy: { id: r.setById, name: r.setByName },
        setAt: r.setAt,
      },
    ]),
  )
}

/** End the open holds on these subjects, in the caller's `tx`. `endedBy` is
 *  null when nobody pressed anything (a customer exchange). Returns what ended,
 *  with `set_at`, so a resume can shift the subject's clock by the held time. */
export async function endHolds(
  tx: Db,
  type: HoldSubjectType,
  codes: readonly string[],
  kind: HoldEndKind,
  endedBy: string | null,
): Promise<{ code: string; setAt: Date; endedAt: Date }[]> {
  if (codes.length === 0) return []
  const rows = await tx
    .update(hold)
    .set({ endedAt: sql`now()`, endKind: kind, endedBy })
    .where(
      and(eq(hold.subjectType, type), inArray(hold.subjectCode, [...codes]), isNull(hold.endedAt)),
    )
    .returning({ code: hold.subjectCode, setAt: hold.setAt, endedAt: hold.endedAt })
  return rows.flatMap((r) =>
    r.endedAt ? [{ code: r.code, setAt: r.setAt, endedAt: r.endedAt }] : [],
  )
}

/** A deal's column clock moved on by the held time — no move is allowed while
 *  held. Shared by the resume and the stop, which must shift BEFORE it writes
 *  `days_in_from`. Returns the new `stage_since`. */
export async function shiftDealClock(
  tx: Db,
  code: string,
  ended: { setAt: Date; endedAt: Date },
): Promise<Date | null> {
  const [row] = await tx
    .update(opportunity)
    .set({
      stageSince: sql`${opportunity.stageSince} + (${ended.endedAt.toISOString()}::timestamptz - ${ended.setAt.toISOString()}::timestamptz)`,
    })
    .where(eq(opportunity.code, code))
    .returning({ stageSince: opportunity.stageSince })
  return row?.stageSince ?? null
}
