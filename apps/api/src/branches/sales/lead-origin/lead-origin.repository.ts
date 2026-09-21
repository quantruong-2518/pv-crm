import { and, asc, eq, notInArray, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { LeadMotion } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { campaign } from '../campaign/campaign.schema'
import { lead } from '../lead/lead.schema'
import { partner } from '../partner/partner.schema'
import { leadHasContract } from '../open-deal'
import {
  leadOrigin,
  leadOriginAlias,
  leadOriginMotion,
  type LeadOriginRowDb,
} from './lead-origin.schema'
import type { LeadOriginLinks, LeadOriginRead } from './lead-origin.mapper'

/** SQL for `sales.lead_origin` and its two side tables. Decides nothing: which
 *  key collides, what a merge moves and in what order is the service's call.
 *  Every write takes `tx` — a merge is five statements that land together. */

/** `LO-%04d` off `lead_origin_code_seq`, the `NEXT_CODE` shape of `lead.repository.ts`. */
const NEXT_ID = sql`SELECT 'LO-' || lpad(nextval('sales.lead_origin_code_seq')::text, 4, '0') AS id`

export type LeadOriginSet = Partial<Pick<LeadOriginRowDb, 'name' | 'key' | 'active' | 'mergedInto'>>

/** The per-origin funnel row `LeadSourceStatsResponse` is built from. */
export type SourceStatsRead = {
  motion: LeadMotion | null
  origin_id: string | null
  origin_name: string | null
  campaign_code: string | null
  campaign_name: string | null
  leads: number
  mql: number
  sql: number
  deals: number
  won: number
}

@Injectable()
export class LeadOriginRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  get handle(): Db {
    return this.db
  }

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** `ownerId` set = count only that holder's leads (the book's scope axis). */
  origins(db: Db, ownerId?: string): Promise<LeadOriginRead[]> {
    const own = ownerId ? sql` AND l."owner_id" = ${ownerId}` : sql``
    const leadCount = sql<number>`(
      SELECT count(*)::int FROM "sales"."lead" l WHERE l."origin_id" = ${leadOrigin.id}${own}
    )`
    return db.select({ row: leadOrigin, leadCount }).from(leadOrigin).orderBy(asc(leadOrigin.id))
  }

  async links(db: Db): Promise<LeadOriginLinks> {
    const [aliases, motions] = await Promise.all([
      db
        .select({ key: leadOriginAlias.key, originId: leadOriginAlias.originId })
        .from(leadOriginAlias),
      db
        .select({ originId: leadOriginMotion.originId, motion: leadOriginMotion.motion })
        .from(leadOriginMotion),
    ])
    return { aliases, motions }
  }

  async byId(db: Db, id: string): Promise<LeadOriginRowDb | null> {
    const [row] = await db.select().from(leadOrigin).where(eq(leadOrigin.id, id)).limit(1)
    return row ?? null
  }

  async byKey(db: Db, key: string): Promise<LeadOriginRowDb | null> {
    const [row] = await db.select().from(leadOrigin).where(eq(leadOrigin.key, key)).limit(1)
    return row ?? null
  }

  /** Which origin an alias key points at, or null. */
  async aliasOwner(db: Db, key: string): Promise<string | null> {
    const [row] = await db
      .select({ originId: leadOriginAlias.originId })
      .from(leadOriginAlias)
      .where(eq(leadOriginAlias.key, key))
      .limit(1)
    return row?.originId ?? null
  }

  async nextId(db: Db): Promise<string> {
    const r = (await db.execute(NEXT_ID)) as { rows: { id: string }[] }
    const id = r.rows[0]?.id
    if (!id) throw new Error('sales.lead_origin_code_seq returned nothing — has 0057 run?')
    return id
  }

  /** `null` = the key was taken between the caller's read and this insert. */
  async insert(
    tx: Db,
    values: { id: string; name: string; key: string; createdBy: string | null },
  ): Promise<LeadOriginRowDb | null> {
    const [row] = await tx
      .insert(leadOrigin)
      .values(values)
      .onConflictDoNothing({ target: leadOrigin.key })
      .returning()
    return row ?? null
  }

  async update(tx: Db, id: string, set: LeadOriginSet): Promise<void> {
    await tx
      .update(leadOrigin)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(leadOrigin.id, id))
  }

  /** Returns the motions that were NOT linked before. */
  async linkMotions(tx: Db, id: string, motions: readonly LeadMotion[]): Promise<LeadMotion[]> {
    if (motions.length === 0) return []
    const rows = await tx
      .insert(leadOriginMotion)
      .values(motions.map((motion) => ({ originId: id, motion })))
      .onConflictDoNothing()
      .returning({ motion: leadOriginMotion.motion })
    return rows.map((r) => r.motion)
  }

  async replaceMotions(tx: Db, id: string, motions: readonly LeadMotion[]): Promise<void> {
    await tx
      .delete(leadOriginMotion)
      .where(
        and(eq(leadOriginMotion.originId, id), notInArray(leadOriginMotion.motion, [...motions])),
      )
    await this.linkMotions(tx, id, motions)
  }

  async copyMotions(tx: Db, from: string, to: string): Promise<void> {
    await tx.execute(sql`
      INSERT INTO "sales"."lead_origin_motion" ("origin_id", "motion")
      SELECT ${to}, m."motion" FROM "sales"."lead_origin_motion" m WHERE m."origin_id" = ${from}
      ON CONFLICT DO NOTHING
    `)
  }

  async repointMerged(tx: Db, from: string, to: string): Promise<void> {
    await tx
      .update(leadOrigin)
      .set({ mergedInto: to, updatedAt: new Date() })
      .where(eq(leadOrigin.mergedInto, from))
  }

  async addAlias(tx: Db, key: string, originId: string): Promise<void> {
    await tx.insert(leadOriginAlias).values({ key, originId }).onConflictDoNothing()
  }

  async dropAlias(tx: Db, key: string): Promise<void> {
    await tx.delete(leadOriginAlias).where(eq(leadOriginAlias.key, key))
  }

  async moveAliases(tx: Db, from: string, to: string): Promise<void> {
    await tx.update(leadOriginAlias).set({ originId: to }).where(eq(leadOriginAlias.originId, from))
  }

  /** Returns how many leads moved. */
  async repointLeads(tx: Db, from: string, to: string): Promise<number> {
    const rows = await tx
      .update(lead)
      .set({ originId: to })
      .where(eq(lead.originId, from))
      .returning({ code: lead.code })
    return rows.length
  }

  /** Partners and campaigns name an origin for FUTURE leads, so a merge moves
   *  them too — else they would keep deriving a folded origin. Returns counts. */
  async repointReferrers(
    tx: Db,
    from: string,
    to: string,
  ): Promise<{ partners: number; campaigns: number }> {
    const partners = await tx
      .update(partner)
      .set({ originId: to, updatedAt: new Date() })
      .where(eq(partner.originId, from))
      .returning({ code: partner.code })
    const campaigns = await tx
      .update(campaign)
      .set({ originId: to, updatedAt: new Date() })
      .where(eq(campaign.originId, from))
      .returning({ code: campaign.code })
    return { partners: partners.length, campaigns: campaigns.length }
  }

  /** One row per (motion, origin, campaign) over leads created in [from, to],
   *  both days in Asia/Ho_Chi_Minh. Campaign = the lead's ACTIVE membership. */
  async sourceStats(q: {
    from?: string
    to?: string
    ownerId?: string
  }): Promise<SourceStatsRead[]> {
    const day = sql`(l."created_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`
    const where = [
      sql`true`,
      ...(q.from ? [sql`${day} >= ${q.from}::date`] : []),
      ...(q.to ? [sql`${day} <= ${q.to}::date`] : []),
      ...(q.ownerId ? [sql`l."owner_id" = ${q.ownerId}`] : []),
    ]
    const r = (await this.db.execute(sql`
      SELECT f."motion", f."origin_id", o."name" AS origin_name,
             c."code" AS campaign_code, c."name" AS campaign_name,
             count(*)::int                                                         AS leads,
             count(*) FILTER (WHERE f."tier" IN ('mql', 'sql') OR f.has_deal)::int AS mql,
             count(*) FILTER (WHERE f."tier" = 'sql' OR f.has_deal)::int          AS "sql",
             count(*) FILTER (WHERE f.has_deal)::int                               AS deals,
             count(*) FILTER (WHERE f.has_contract)::int                           AS won
        FROM (
          SELECT l."code", l."motion", l."origin_id", l."tier",
                 EXISTS (SELECT 1 FROM "sales"."opportunity" p WHERE p."lead_code" = l."code") AS has_deal,
                 ${leadHasContract(sql`l."code"`)} AS has_contract
            FROM "sales"."lead" l
           WHERE ${sql.join(where, sql` AND `)}
        ) f
        LEFT JOIN "sales"."lead_origin" o ON o."id" = f."origin_id"
        LEFT JOIN LATERAL (
              -- In several campaigns: the membership added first wins (added_at, then code).
              SELECT cp."code", cp."name"
                FROM "sales"."campaign_member" m
                JOIN "sales"."campaign" cp ON cp."code" = m."campaign_code"
               WHERE m."lead_code" = f."code" AND m."state" = 'ACTIVE'
               ORDER BY m."added_at", m."campaign_code"
               LIMIT 1
             ) c ON true
       GROUP BY f."motion", f."origin_id", o."name", c."code", c."name"
       ORDER BY f."motion" NULLS LAST, o."name" NULLS LAST, c."name" NULLS FIRST
    `)) as { rows: SourceStatsRead[] }
    return r.rows
  }
}
