import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { contains } from '@api/platform/db/like'
import { motionPolicy } from '../config/motion.schema'
import { leadOrigin, leadOriginMotion } from '../lead-origin/lead-origin.schema'
import { partner, type PartnerRowDb } from './partner.schema'

/** SQL for `sales.partner`. Decides nothing: which origin a partner may hang
 *  under is the service's call; this only answers the question it is asked. */

/** `REF-%04d` off `partner_code_seq`, the `NEXT_ID` shape of `lead-origin.repository.ts`. */
const NEXT_CODE = sql`SELECT 'REF-' || lpad(nextval('sales.partner_code_seq')::text, 4, '0') AS code`

export type PartnerSet = Partial<Pick<PartnerRowDb, 'name' | 'originId' | 'active'>>

@Injectable()
export class PartnerRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  get handle(): Db {
    return this.db
  }

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  list(q: { q?: string; includeInactive: boolean }): Promise<PartnerRowDb[]> {
    return this.db
      .select()
      .from(partner)
      .where(
        and(
          q.includeInactive ? undefined : eq(partner.active, true),
          q.q
            ? or(ilike(partner.code, contains(q.q)), ilike(partner.name, contains(q.q)))
            : undefined,
        ),
      )
      .orderBy(asc(partner.name), asc(partner.code))
  }

  async byCode(db: Db, code: string): Promise<PartnerRowDb | null> {
    const [row] = await db.select().from(partner).where(eq(partner.code, code)).limit(1)
    return row ?? null
  }

  /** Is `id` a live (active, unmerged) origin filed under some motion whose
   *  policy currently `asks` REFERRER. */
  async originOffered(db: Db, id: string): Promise<boolean> {
    const [row] = await db
      .select({ id: leadOrigin.id })
      .from(leadOrigin)
      .innerJoin(leadOriginMotion, eq(leadOriginMotion.originId, leadOrigin.id))
      .innerJoin(motionPolicy, eq(motionPolicy.motion, leadOriginMotion.motion))
      .where(
        and(
          eq(leadOrigin.id, id),
          eq(leadOrigin.active, true),
          isNull(leadOrigin.mergedInto),
          eq(motionPolicy.asks, 'REFERRER'),
        ),
      )
      .limit(1)
    return row !== undefined
  }

  async nextCode(db: Db): Promise<string> {
    const r = (await db.execute(NEXT_CODE)) as { rows: { code: string }[] }
    const code = r.rows[0]?.code
    if (!code) throw new Error('sales.partner_code_seq returned nothing — has 0059 run?')
    return code
  }

  async insert(
    tx: Db,
    values: { code: string; name: string; originId: string; createdBy: string },
  ): Promise<PartnerRowDb> {
    const [row] = await tx.insert(partner).values(values).returning()
    if (!row) throw new Error(`sales.partner: INSERT ${values.code} returned no row`)
    return row
  }

  async update(tx: Db, code: string, set: PartnerSet): Promise<PartnerRowDb | null> {
    const [row] = await tx
      .update(partner)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(partner.code, code))
      .returning()
    return row ?? null
  }
}
