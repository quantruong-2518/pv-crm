import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { Injectable } from '@nestjs/common'
import type { Db } from '@api/platform/db/db.module'
import { configEntry } from '../config/config.schema'
import { leadLabel } from './lead.schema'

/** SQL of the label door (`PUT /sales/leads/:code/labels`). Reads for the
 *  book live in `lead-label.sql.ts`; this class only judges ids and writes. */
@Injectable()
export class LeadLabelRepository {
  /** Which of `ids` the door may put on this lead: an active `WAITING_LABEL`
   *  row, or one the lead already carries — a retired label stays until removed. */
  async allowed(tx: Db, code: string, ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const [live, kept] = await Promise.all([
      tx
        .select({ id: configEntry.id })
        .from(configEntry)
        .where(
          and(
            eq(configEntry.list, 'WAITING_LABEL'),
            eq(configEntry.active, true),
            inArray(configEntry.id, [...ids]),
          ),
        ),
      tx
        .select({ id: leadLabel.labelId })
        .from(leadLabel)
        .where(and(eq(leadLabel.leadCode, code), inArray(leadLabel.labelId, [...ids]))),
    ])
    return new Set([...live, ...kept].map((r) => r.id))
  }

  /** The whole set, replacing the old one: what is not named goes, what is new
   *  comes, what stays is not rewritten. */
  async replace(tx: Db, code: string, ids: readonly string[]): Promise<void> {
    await tx
      .delete(leadLabel)
      .where(
        and(
          eq(leadLabel.leadCode, code),
          ids.length ? notInArray(leadLabel.labelId, [...ids]) : undefined,
        ),
      )
    if (ids.length === 0) return
    await tx
      .insert(leadLabel)
      .values(ids.map((labelId) => ({ leadCode: code, labelId })))
      .onConflictDoNothing()
  }
}
