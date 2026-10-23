import { Inject, Injectable } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import type { CustomerTemperature, WorkstreamHolder } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { journeyInGrowth, liveContractOwners } from '../open-deal'
import { customerTemperature, type CustomerTemperatureValues } from './customer-temperature.schema'

/** A subject's bought customer: the run in `growth` it belongs to. */
export type CustomerRead = {
  workstreamCode: string
  leadCode: string
  leadOwnerId: string | null
  temperature: CustomerTemperature | null
  /** Closers of the live contracts, locked ones included: the form names them. */
  carers: WorkstreamHolder[]
}

/** SQL of `sales.customer_temperature` and the one question the close-out asks
 *  before it: is this subject a bought customer. A stateless class the
 *  next-step module provides bare, so neither module imports the other. */
@Injectable()
export class CustomerTemperatureRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** `subjectCode` is a lead, deal or contract; null unless its run is in `growth`. */
  async customerOf(subjectCode: string): Promise<CustomerRead | null> {
    return (await this.customersOf([subjectCode])).get(subjectCode) ?? null
  }

  /** `customerOf` for a page of subjects in one statement; others are absent. */
  async customersOf(subjectCodes: readonly string[]): Promise<Map<string, CustomerRead>> {
    if (subjectCodes.length === 0) return new Map()
    const codes = sql.join(
      subjectCodes.map((c) => sql`(${c}::text)`),
      sql`, `,
    )
    const r = (await this.db.execute(sql`
      SELECT s.code AS "subjectCode", l.workstream_code AS "workstreamCode", l.code AS "leadCode",
             l.owner_id AS "leadOwnerId",
             (SELECT t.temperature FROM sales.customer_temperature t
               WHERE t.workstream_code = l.workstream_code
               ORDER BY t.recorded_at DESC LIMIT 1) AS "temperature",
             (SELECT coalesce(json_agg(json_build_object('id', a.id, 'name', a.name) ORDER BY a.name), '[]')
                FROM platform.actor a WHERE a.id IN ${liveContractOwners(sql`l.code`)}) AS "carers"
        FROM (VALUES ${codes}) AS s(code)
        JOIN sales.lead l
          ON l.code = coalesce(
               (SELECT o.lead_code FROM sales.opportunity o WHERE o.code = s.code),
               (SELECT k.lead_code FROM sales.contract k WHERE k.code = s.code),
               s.code)
       WHERE ${journeyInGrowth(sql`l.workstream_code`)}
    `)) as { rows: (CustomerRead & { subjectCode: string })[] }
    return new Map(r.rows.map(({ subjectCode, ...c }) => [subjectCode, c]))
  }

  /** Re-asked under the lead's lock: the run may have left `growth` since `customerOf`. */
  async growing(tx: Db, leadCode: string): Promise<boolean> {
    const r = (await tx.execute(sql`
      SELECT 1 FROM sales.lead l
       WHERE l.code = ${leadCode} AND ${journeyInGrowth(sql`l.workstream_code`)}
    `)) as { rows: unknown[] }
    return r.rows.length > 0
  }

  /** Inside the close-out's transaction; `debrief_id` UNIQUE refuses a second reading. */
  async insert(tx: Db, values: CustomerTemperatureValues): Promise<void> {
    await tx.insert(customerTemperature).values(values)
  }

  /** The reading one close-out took; null when it took none. */
  async readingOf(debriefId: string): Promise<CustomerTemperature | null> {
    const [row] = await this.db
      .select({ temperature: customerTemperature.temperature })
      .from(customerTemperature)
      .where(eq(customerTemperature.debriefId, debriefId))
      .limit(1)
    return row?.temperature ?? null
  }

  /** The owner's edit corrects the reading in place (ADR 0122): `recorded_at`
   *  stays, so the reading keeps its place in the journey's history. */
  async retemper(tx: Db, debriefId: string, temperature: CustomerTemperature): Promise<void> {
    await tx
      .update(customerTemperature)
      .set({ temperature })
      .where(eq(customerTemperature.debriefId, debriefId))
  }
}
