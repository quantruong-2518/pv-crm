import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { KPI_FORECAST_FLAGGED } from '@pv/engines'
import { KPI_METRIC_LABEL, type KpiForecast, type KpiPeriodKey } from '@pv/contracts'
import { ENV, type Env } from '@api/platform/config/env'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { monthLabel } from './kpi-alert.service'
import { KpiAlertRepository, type KpiAlertKey } from './kpi-alert.repository'
import { additive } from './kpi-allocation.mapper'
import { KpiAllocationRepository, type KpiAgreedLine } from './kpi-allocation.repository'
import { catalogDef } from './kpi-config.overlay'
import { KpiForecastService } from './kpi-forecast.service'
import { monthClock, vietnamToday } from './kpi-rules'

const SWEEP_EVERY_MS = 24 * 60 * 60_000

/** Share of the month (`elapsedOf`) gone before the bell may ring at all.
 *  Owner's call 15/10/2026: early-month projections swing on a few records
 *  and rang wrongly. The screen still shows the flag from day one. */
const ALERT_FROM_SHARE = 0.5

/** Rings a person when the forecast flags one of their metrics "about to miss"
 *  or "about to hit" (ADR 0098 §6, 0099 §4). The flag is `KpiForecastService`'s,
 *  so the bell says what the person's own KPI screen says; no target, no flag.
 *
 *  Only the running month, in Vietnam days. `kpi_alert_sent` is the memory: a
 *  flag rings once per month, person, role and metric, and only the sweep that
 *  inserts its row rings it. The newly claimed flags are told as one line per
 *  person and flag (0093 §4's collapse), so the first deploy rings a person at
 *  most twice however many metrics already stand flagged.
 *
 *  Self-timed like `ContractOverdueSweeper`: once at boot, then daily, off under
 *  `NODE_ENV=test`, and left to overlap with the worker: the claim is one
 *  INSERT, so a racing sweep gets nothing back. No `actorId`: the system speaks.
 *  The hub swallows a failed bell write under its savepoint while the claim
 *  still commits, so such an alert is lost for the rest of that month. */
@Injectable()
export class KpiAlertSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('sales.kpi')
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly forecast: KpiForecastService,
    private readonly repo: KpiAlertRepository,
    private readonly allocations: KpiAllocationRepository,
    private readonly hub: NotificationHub,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS)
    this.timer.unref()
    void this.sweep()
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Lines announced for `period`. A closed month has a verdict and a future
   *  one no pace, so neither is ever rung; nor the first half of the running
   *  one, which claims nothing, so its flags can still ring later. */
  async ring(period: KpiPeriodKey): Promise<number> {
    const { phase, elapsed } = monthClock(period)
    if (phase !== 'running' || elapsed < ALERT_FROM_SHARE) return 0
    const [{ items }, lines] = await Promise.all([
      this.forecast.everyone(period),
      this.allocations.agreedLines(period),
    ])
    const flagged = items.flatMap((i): KpiAlertKey[] =>
      i.flag && judgedOnOwnLine(i, lines)
        ? [{ period, actorId: i.actorId, role: i.role, metricKey: i.metricKey, flag: i.flag }]
        : [],
    )
    /* `announce` writes inside its caller's transaction: one for the sweep. */
    return this.repo.run(async (tx) => {
      const lines = new Map<string, KpiAlertKey[]>()
      for (const key of await this.repo.claim(tx, flagged)) {
        const at = `${key.actorId}|${key.flag}`
        lines.set(at, [...(lines.get(at) ?? []), key])
      }
      for (const keys of lines.values()) {
        const { actorId, flag } = keys[0]!
        const metrics = [...new Set(keys.map((k) => KPI_METRIC_LABEL[k.metricKey]))]
        await this.hub.announce(tx, {
          event: {
            name: KPI_FORECAST_FLAGGED,
            ref: { code: period },
            /* The claimed set: each set is new, so a second sweep the same day keeps its own key. */
            occurrence: keys.map((k) => `${k.role}:${k.metricKey}`).join('+'),
            audiences: { holder: [actorId] },
            data: { flag },
          },
          subject: {
            kind: 'kpi-scorecard',
            code: period,
            label: `${metrics.join(', ')} · ${monthLabel(period)}`,
          },
        })
      }
      return lines.size
    })
  }

  /** Never rejects: a sweep that fails before its claim commits leaves the flags unclaimed for the next day. */
  private async sweep(): Promise<void> {
    try {
      const rung = await this.ring(vietnamToday().slice(0, 7))
      /* Announced, not written: the hub drops a failed or duplicate line silently. */
      if (rung > 0) this.log.log(`Announced ${rung} KPI forecast alerts to the bell.`)
    } catch (error: unknown) {
      this.log.error(
        `KPI alert sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

/** A tally kept per person is only rung against that person's own agreed line
 *  (ADR 0098 §1): the role target is the whole role's sum, so one person's
 *  figure set against it says nothing. The screen keeps the forecast's own
 *  flag; only the bell waits. Room figures and unsummable metrics keep the
 *  role target, which is theirs. */
function judgedOnOwnLine(item: KpiForecast, lines: readonly KpiAgreedLine[]): boolean {
  const def = catalogDef(item.role, item.metricKey)
  if (!def || !additive(def)) return true
  return lines.some(
    (l) =>
      l.actorId === item.actorId && l.metricKey === item.metricKey && l.package.role === item.role,
  )
}
