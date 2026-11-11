import { Inject, Injectable } from '@nestjs/common'
import { vnDayOf, type FxCurrency, type FxRateListQuery } from '@pv/contracts'
import { and, desc, eq, getTableColumns, gte, inArray, lt, lte, min, ne, sql } from 'drizzle-orm'
import { DB, type Db } from '../db/db.module'
import { actor } from '../db/platform.schema'
import { fxRate, type FxRateRowDb } from './fx-rate.schema'

export type FxRateJoined = FxRateRowDb & { setByName: string | null }

/** SQL for `platform.fx_rate`. Decides nothing: which row wins a weekend, and
 *  what a missing day means, is the service's call. */
@Injectable()
export class FxRateRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Newest day first, author's name joined for the admin list. */
  list({ currency, from, to }: FxRateListQuery): Promise<FxRateJoined[]> {
    return this.db
      .select({ ...getTableColumns(fxRate), setByName: actor.name })
      .from(fxRate)
      .leftJoin(actor, eq(actor.id, fxRate.setBy))
      .where(
        and(
          currency ? eq(fxRate.currency, currency) : undefined,
          from ? gte(fxRate.day, from) : undefined,
          to ? lte(fxRate.day, to) : undefined,
        ),
      )
      .orderBy(desc(fxRate.day), fxRate.currency)
  }

  /** The row of `day`, else the nearest earlier one: a descending range scan on the PK. */
  async onOrBefore(currency: FxCurrency, day: string): Promise<FxRateRowDb | null> {
    const [row] = await this.db
      .select()
      .from(fxRate)
      .where(and(eq(fxRate.currency, currency), lte(fxRate.day, day)))
      .orderBy(desc(fxRate.day))
      .limit(1)
    return row ?? null
  }

  /** The nearest row strictly before `day`, any source: the reference for a typed rate. */
  async earlierThan(tx: Db, currency: FxCurrency, day: string): Promise<FxRateRowDb | null> {
    const [row] = await tx
      .select()
      .from(fxRate)
      .where(and(eq(fxRate.currency, currency), lt(fxRate.day, day)))
      .orderBy(desc(fxRate.day))
      .limit(1)
    return row ?? null
  }

  /** The exact row, held until the transaction ends so the audit line's "before" is the live one. */
  async lock(tx: Db, currency: FxCurrency, day: string): Promise<FxRateRowDb | null> {
    const [row] = await tx
      .select()
      .from(fxRate)
      .where(and(eq(fxRate.currency, currency), eq(fxRate.day, day)))
      .for('update')
    return row ?? null
  }

  async putManual(
    tx: Db,
    row: { currency: FxCurrency; day: string; rate: number; setBy: string },
  ): Promise<FxRateJoined> {
    const values = { ...row, rate: row.rate.toFixed(2), source: 'manual' as const }
    await tx
      .insert(fxRate)
      .values(values)
      .onConflictDoUpdate({
        target: [fxRate.currency, fxRate.day],
        set: { ...values, fetchedAt: sql`now()` },
      })
    const [written] = await tx
      .select({ ...getTableColumns(fxRate), setByName: actor.name })
      .from(fxRate)
      .leftJoin(actor, eq(actor.id, fxRate.setBy))
      .where(and(eq(fxRate.currency, row.currency), eq(fxRate.day, row.day)))
    if (!written) throw new Error('platform.fx_rate: upsert returned no row')
    return written
  }

  /** True when the day already has a fetched or typed rate: nothing left to fetch. */
  async hasDay(currency: FxCurrency, day: string): Promise<boolean> {
    const [row] = await this.db
      .select({ day: fxRate.day })
      .from(fxRate)
      .where(
        and(
          eq(fxRate.currency, currency),
          eq(fxRate.day, day),
          inArray(fxRate.source, ['vietcombank', 'manual']),
        ),
      )
    return row !== undefined
  }

  /** `manual` wins: the guard sits in the statement, so a typed rate cannot be
   *  overwritten between a read and this write. */
  async putFetched(currency: FxCurrency, day: string, rate: number): Promise<void> {
    const values = { currency, day, rate: rate.toFixed(2), source: 'vietcombank' as const }
    await this.db
      .insert(fxRate)
      .values(values)
      .onConflictDoUpdate({
        target: [fxRate.currency, fxRate.day],
        set: { ...values, setBy: null, fetchedAt: sql`now()` },
        setWhere: ne(fxRate.source, 'manual'),
      })
  }

  /** Oldest day that was fetched or typed, never the backfill; NULL before the first one. */
  async firstRealDay(tx: Db, currency: FxCurrency): Promise<string | null> {
    const [row] = await tx
      .select({ day: min(fxRate.day) })
      .from(fxRate)
      .where(and(eq(fxRate.currency, currency), ne(fxRate.source, 'legacy')))
    return row?.day ?? null
  }

  /** Newest day that was fetched or typed. With none yet, the Vietnam day the
   *  backfill row was planted: a feed that never works starts its clock there. */
  async lastRateDay(currency: FxCurrency): Promise<string | null> {
    const [real] = await this.db
      .select({ day: fxRate.day })
      .from(fxRate)
      .where(and(eq(fxRate.currency, currency), ne(fxRate.source, 'legacy')))
      .orderBy(desc(fxRate.day))
      .limit(1)
    if (real) return real.day
    const [legacy] = await this.db
      .select({ at: fxRate.fetchedAt })
      .from(fxRate)
      .where(and(eq(fxRate.currency, currency), eq(fxRate.source, 'legacy')))
    return legacy ? vnDayOf(legacy.at) : null
  }
}
