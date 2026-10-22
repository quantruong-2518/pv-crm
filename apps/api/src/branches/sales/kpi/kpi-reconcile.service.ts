import { Injectable, Logger } from '@nestjs/common'
import { KpiMetricKey, RoleId, type KpiAdjustmentCause } from '@pv/contracts'
import { spansOf } from '../performance/performance-period'
import type { KpiAdjustmentValues } from './kpi-close.schema'
import { catalogDef } from './kpi-config.overlay'
import { additiveMeasure, seriesKey, type KpiSeat } from './kpi-readings.repository'
import { vietnamToday } from './kpi-rules'
import {
  KpiReconcileRepository,
  type KpiBasisTally,
  type KpiWrittenTally,
} from './kpi-reconcile.repository'

/** Every seat the code catalog can name, by series: a frozen series names
 *  its SQL through any one of them, since seats sharing a series share it. */
const CODE_SEATS: ReadonlyMap<string, KpiSeat> = new Map(
  RoleId.options.flatMap((role) =>
    KpiMetricKey.options.flatMap((key): [string, KpiSeat][] => {
      const def = catalogDef(role, key)
      return def ? [[seriesKey({ role, def }), { role, def }]] : []
    }),
  ),
)

/** A closed month never moves; what changed in its records since is written
 *  into the running month as adjustments (ADR 0115 §2–3).
 *
 *  Per closed month with a frozen basis, per additive series it froze
 *  (`additiveMeasure`), per (actor, record code): live − frozen − Σ already
 *  written is the remainder, written as rows. Append-only and idempotent — a
 *  second pass with nothing new finds every remainder zero. A month closed
 *  before 0136 froze no basis and is skipped (ADR 0115, default 1).
 *
 *  Runs from the daily KPI sweep and right after a close; no bell (default 4)
 *  and no audit row, like the other derived sweeps. */
@Injectable()
export class KpiReconcileService {
  private readonly log = new Logger('sales.kpi')

  constructor(private readonly repo: KpiReconcileRepository) {}

  /** Adjustment rows written across every closed month. One month failing is
   *  logged and the rest still run. `now` pins the clock (acceptance runs). */
  async run(now?: Date): Promise<number> {
    let written = 0
    for (const period of await this.repo.closedWithBasis()) {
      try {
        written += await this.month(period, now)
      } catch (error: unknown) {
        this.log.error(`KPI reconcile of ${period} failed: ${String(error)}`)
      }
    }
    return written
  }

  /** Rows written for one closed month into the running Vietnam month, read
   *  under the lock so a close that held it is already visible. A running month
   *  already closed cannot happen through `close`; if it does, refuse and log. */
  async month(period: string, now?: Date): Promise<number> {
    const seats = await this.seatsOf(period)
    if (seats.size === 0) return 0
    const series = [...seats.keys()]

    return this.repo.run(async (tx) => {
      const applied = vietnamToday((now ?? new Date()).getTime()).slice(0, 7)
      if (applied <= period) return 0
      if (await this.repo.closed(tx, applied)) {
        this.log.error(`KPI reconcile of ${period} refused: ${applied} is already closed.`)
        return 0
      }
      const span = spansOf(period).current
      const live = await this.repo.live(
        tx,
        [...seats.values()].map((s) => s.seat),
        span,
      )
      const frozen = await this.repo.frozen(tx, period, series)
      const written = await this.repo.written(tx, period, series)
      const how = (key: string) => seats.get(key)?.how ?? 'sum'
      const rows = remainders(live, frozen, written, how).map((r): KpiAdjustmentValues => ({
        ...r,
        sourcePeriod: period,
        appliedPeriod: applied,
      }))
      await this.repo.insert(tx, rows)
      return rows.length
    })
  }

  /** The additive series of a month: those its basis holds rows of, and those
   *  its stored values name — a series with no record at the close has no basis
   *  row, yet a record back-dated into it must still be reconciled. */
  private async seatsOf(period: string): Promise<Map<string, Additive>> {
    const [basis, valued] = await Promise.all([
      this.repo.basisSeries(period),
      this.repo.frozenSeats(period),
    ])
    const named = valued.flatMap(({ role, metricKey }) => {
      const def = catalogDef(role, metricKey)
      return def ? [seriesKey({ role, def })] : []
    })
    const seats = new Map<string, Additive>()
    for (const series of new Set([...basis, ...named])) {
      const seat = CODE_SEATS.get(series)
      const how = seat && additiveMeasure(seat)
      if (seat && how) seats.set(series, { seat, how })
    }
    return seats
  }
}

type Additive = { seat: KpiSeat; how: 'count' | 'sum' }

/** Deltas are written as `String(number)` and summed back as float8, and the
 *  remainder is a JS float subtraction, so an exact zero can come back as dust;
 *  a hundredth of a dong is far below any real amount. */
const EPSILON = 0.01

type Remainder = Pick<
  KpiAdjustmentValues,
  'series' | 'actorId' | 'code' | 'kind' | 'tag' | 'delta' | 'cause'
>

/** NUL never occurs in a series, an actor id or a code, so the join is unambiguous. */
const keyOf = (t: { series: string; actorId: string | null; code: string }): string =>
  [t.series, t.actorId ?? '', t.code].join('\u0000')

/** The cause compares the record's last known state — the frozen row, or the
 *  latest adjustment — with today, so a record switched off and back on reads
 *  `vanished` then `appeared`, not `changed`. A count splits ±1 per record. */
function remainders(
  live: readonly KpiBasisTally[],
  frozen: readonly KpiBasisTally[],
  written: readonly KpiWrittenTally[],
  how: (series: string) => 'count' | 'sum',
): Remainder[] {
  const index = <T extends Parameters<typeof keyOf>[0]>(rows: readonly T[]) =>
    new Map(rows.map((r) => [keyOf(r), r]))
  const [now, then, said] = [index(live), index(frozen), index(written)]
  const keys = new Set([...now.keys(), ...then.keys(), ...said.keys()])

  return [...keys].flatMap((key): Remainder[] => {
    const [series = '', actorId = '', code = ''] = key.split('\u0000')
    const measure = how(series)
    const counted = (t?: KpiBasisTally) => (!t ? 0 : measure === 'count' ? t.n : t.sum)
    const was = said.get(key)
    const rest = counted(now.get(key)) - counted(then.get(key)) - (was?.sum ?? 0)
    if (Math.abs(rest) < EPSILON) return []
    const present = was ? was.last !== 'vanished' : then.has(key)
    const cause: KpiAdjustmentCause =
      !present && now.has(key) ? 'appeared' : present && !now.has(key) ? 'vanished' : 'changed'
    /* Kind and tag of the row compared; a key gone from both books keeps those written. */
    const seen = now.get(key) ?? then.get(key) ?? was
    const kept = { kind: seen?.kind ?? null, tag: seen?.tag ?? null }
    const row = { series, actorId: actorId || null, code, ...kept, cause }
    if (measure === 'sum') return [{ ...row, delta: String(rest) }]
    const step = Math.sign(rest)
    return Array.from({ length: Math.round(Math.abs(rest)) }, () => ({
      ...row,
      delta: String(step),
    }))
  })
}
