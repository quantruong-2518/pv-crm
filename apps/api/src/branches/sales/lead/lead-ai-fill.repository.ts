import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { LeadAiFillMarks } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { account } from '../account/account.schema'
import { leadHolderScope, leadLive } from './lead-scope'
import { lead, type LeadRowDb } from './lead.schema'
import type { LeadValues } from './lead-write.mapper'

/** The AI fill's SQL (`POST /sales/leads/:code/ai-fill`). Decides nothing:
 *  which fields are still empty is the service's question, asked of the row
 *  this class locks. */
@Injectable()
export class LeadAiFillRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** The live lead, locked until the fill commits, and whether `who` still
   *  holds it — the same `holds` the profile read computes. */
  async lock(
    tx: Db,
    who: Pick<Actor, 'id' | 'ownOnly'>,
    code: string,
  ): Promise<{ row: LeadRowDb; holds: boolean } | null> {
    const [found] = await tx
      .select({
        row: lead,
        holds: sql<boolean>`COALESCE(${leadHolderScope(who, true) ?? sql`true`}, false)`,
      })
      .from(lead)
      .where(and(eq(lead.code, code), leadLive))
      .limit(1)
      .for('update')
    return found ?? null
  }

  /** The values, and their provenance merged into `ai_fill` key by key. */
  async write(
    tx: Db,
    code: string,
    values: Partial<LeadValues>,
    marks: LeadAiFillMarks,
  ): Promise<void> {
    await tx
      .update(lead)
      .set({ ...values, aiFill: sql`${lead.aiFill} || ${JSON.stringify(marks)}::jsonb` })
      .where(eq(lead.code, code))
  }

  /** A company in the book other than `own` that holds this tax root — the
   *  key `keysOf` writes on every account. Oldest code first when several do. */
  async accountByTaxRoot(
    root: string,
    own: string | null,
  ): Promise<{ code: string; name: string } | null> {
    const [row] = await this.db
      .select({ code: account.code, name: account.name })
      .from(account)
      .where(and(eq(account.taxRoot, root), own ? ne(account.code, own) : undefined))
      .orderBy(asc(account.code))
      .limit(1)
    return row ?? null
  }
}
