import { and, asc, eq, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import {
  kpiAcknowledgement,
  kpiTarget,
  type KpiAcknowledgementRowDb,
  type KpiAcknowledgementValues,
  type KpiTargetRowDb,
  type KpiTargetValues,
} from './kpi.schema'

/** A target row with the two names the table prints beside it. Joined on
 *  read, unlike `touch.by`: this says who stands behind the number today. */
export type KpiTargetRow = KpiTargetRowDb & { proposedBy: string; agreedBy: string | null }

/** The two things a person decides about KPI: a target and "I have received
 *  it". Decides nothing itself — which version is effective, and who may
 *  agree, are the service's and the mapper's.
 *
 *  Writers take `tx` from outside (`meeting.repository.ts`'s reason): the
 *  service knows a write is also an audit line, and one transaction wraps both. */
@Injectable()
export class KpiTargetsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Every version of one month, oldest first — a few dozen rows. */
  ofPeriod(period: string, handle: Db = this.db): Promise<KpiTargetRow[]> {
    const proposer = alias(actor, 'proposer')
    const agreer = alias(actor, 'agreer')
    return handle
      .select({
        role: kpiTarget.role,
        period: kpiTarget.period,
        metricKey: kpiTarget.metricKey,
        version: kpiTarget.version,
        value: kpiTarget.value,
        proposedById: kpiTarget.proposedById,
        proposedAt: kpiTarget.proposedAt,
        agreedById: kpiTarget.agreedById,
        agreedAt: kpiTarget.agreedAt,
        proposedBy: proposer.name,
        agreedBy: agreer.name,
      })
      .from(kpiTarget)
      .innerJoin(proposer, eq(proposer.id, kpiTarget.proposedById))
      .leftJoin(agreer, eq(agreer.id, kpiTarget.agreedById))
      .where(eq(kpiTarget.period, period))
      .orderBy(asc(kpiTarget.version))
  }

  /** Insert a new version, or replace the pending one sitting on the same key.
   *  `setWhere` is the lock: an agreed row is never rewritten, whoever asks —
   *  so the count stored can fall short of the count sent, and is answered. */
  async savePending(tx: Db, rows: KpiTargetValues[]): Promise<number> {
    const stored = await tx
      .insert(kpiTarget)
      .values(rows)
      .onConflictDoUpdate({
        target: [kpiTarget.role, kpiTarget.period, kpiTarget.metricKey, kpiTarget.version],
        set: {
          value: sql`excluded.value`,
          proposedById: sql`excluded.proposed_by_id`,
          proposedAt: sql`excluded.proposed_at`,
        },
        setWhere: isNull(kpiTarget.agreedAt),
      })
      .returning({ key: kpiTarget.metricKey })
    return stored.length
  }

  /** Locks exactly `seen` — each row as the agreer read it. A row replaced
   *  since carries another `proposed_at`, stays pending, and shows in the count. */
  async agree(tx: Db, seen: readonly KpiTargetRowDb[], by: string, at: Date): Promise<number> {
    const agreed = await tx
      .update(kpiTarget)
      .set({ agreedById: by, agreedAt: at })
      .where(
        and(
          isNull(kpiTarget.agreedAt),
          or(
            ...seen.map((r) =>
              and(
                eq(kpiTarget.role, r.role),
                eq(kpiTarget.period, r.period),
                eq(kpiTarget.metricKey, r.metricKey),
                eq(kpiTarget.version, r.version),
                eq(kpiTarget.proposedAt, r.proposedAt),
              ),
            ),
          ),
        ),
      )
      .returning({ key: kpiTarget.metricKey })
    return agreed.length
  }

  acknowledgements(period: string): Promise<KpiAcknowledgementRowDb[]> {
    return this.db.select().from(kpiAcknowledgement).where(eq(kpiAcknowledgement.period, period))
  }

  /** Acknowledging again moves the stamp; the row count stays one per holder. */
  async acknowledge(row: KpiAcknowledgementValues): Promise<void> {
    await this.db
      .insert(kpiAcknowledgement)
      .values(row)
      .onConflictDoUpdate({
        target: [kpiAcknowledgement.actorId, kpiAcknowledgement.role, kpiAcknowledgement.period],
        set: { acknowledgedAt: row.acknowledgedAt },
      })
  }
}
