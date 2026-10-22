import { Injectable, Logger } from '@nestjs/common'
import { KPI_FORECAST_FLAGGED } from '@pv/engines'
import { KPI_METRIC_LABEL, type KpiForecast, type KpiPeriodKey } from '@pv/contracts'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { spansOf } from '../performance/performance-period'
import { KpiAbsenceService } from './kpi-absence.service'
import { KpiAlertService, monthLabel } from './kpi-alert.service'
import { KpiAlertRepository, type KpiAlertKey } from './kpi-alert.repository'
import { additive } from './kpi-allocation.mapper'
import { KpiAllocationRepository, type KpiAgreedLine } from './kpi-allocation.repository'
import { KpiCloseRepository } from './kpi-close.repository'
import { catalogDef } from './kpi-config.overlay'
import { KpiForecastService } from './kpi-forecast.service'
import { KpiReconcileService } from './kpi-reconcile.service'
import { monthClock, vietnamToday } from './kpi-rules'
import { KpiTargetsRepository } from './kpi-targets.repository'

const SWEEP_EVERY_MS = 24 * 60 * 60_000

/** Vietnam day of the running month from which the bell may ring at all.
 *  Owner's call 15/10/2026: early-month projections swing on a few records and
 *  rang wrongly; a fixed day, not a share of the month, so it is easy to
 *  remember. The screen still shows the flag from day one. */
const ALERT_FROM_DAY = 16

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
 *  Rides the worker's existing tick (`worker.ts`), no clock of its own (ADR
 *  0082 §2), throttled to one pass a day the `HoldReminderSweeper` way. Only the
 *  worker calls it; the claim is one INSERT. No `actorId`: the system speaks.
 *  The hub swallows a failed bell write under its savepoint while the claim
 *  still commits, so such an alert is lost for the rest of that month. */
@Injectable()
export class KpiAlertSweeper {
  private readonly log = new Logger('sales.kpi')
  private notBefore = 0
  private running = false

  constructor(
    private readonly forecast: KpiForecastService,
    private readonly repo: KpiAlertRepository,
    private readonly allocations: KpiAllocationRepository,
    private readonly hub: NotificationHub,
    private readonly alerts: KpiAlertService,
    private readonly closes: KpiCloseRepository,
    private readonly targets: KpiTargetsRepository,
    private readonly reconcile: KpiReconcileService,
    private readonly absences: KpiAbsenceService,
  ) {}

  /** Called on every worker tick. `null` = this tick was not a pass. The clock
   *  moves BEFORE the pass so a failing database is asked again one interval later;
   *  a failed pass leaves the flags unclaimed for the next one. */
  async sweep(now = Date.now()): Promise<number | null> {
    if (this.running || now < this.notBefore) return null
    this.notBefore = now + SWEEP_EVERY_MS
    this.running = true
    try {
      const today = vietnamToday()
      const month = today.slice(0, 7)
      /* Owner: once, on day 1 (ADR 0112 §C), so deploy day never rings a catch-up. */
      if (today.endsWith('-01')) {
        await this.remindClose(spansOf(month).previous.key).catch((error: unknown) =>
          this.log.error(`KPI close reminder failed: ${String(error)}`),
        )
      }
      /* Closed months reconcile on this daily pass too (ADR 0115 §2), whatever the
         alerts did; an alert failure is still thrown to the worker's log after. */
      const [alerts] = await Promise.allSettled([this.ring(month)])
      await this.reconcileClosed()
      /* Stand-in bells (ADR 0117 §4), on their own catch like the reconcile. */
      /* Two cadences back: a tick that runs late must not miss a lock; the occurrence key keeps it once. */
      await this.absences.sweep(2 * SWEEP_EVERY_MS).catch((error: unknown) => {
        this.log.error(`KPI stand-in bells failed: ${String(error)}`)
      })
      if (alerts.status === 'rejected') throw alerts.reason
      /* Announced, not written: the hub drops a failed or duplicate line silently. */
      if (alerts.value > 0)
        this.log.log(`Announced ${alerts.value} KPI forecast alerts to the bell.`)
      return alerts.value
    } finally {
      this.running = false
    }
  }

  /** Its own catch: a failed reconcile waits for tomorrow's pass, alone. */
  private async reconcileClosed(): Promise<void> {
    try {
      const adjusted = await this.reconcile.run()
      if (adjusted > 0) this.log.log(`Wrote ${adjusted} KPI adjustments from closed months.`)
    } catch (error: unknown) {
      this.log.error(`KPI reconcile failed: ${String(error)}`)
    }
  }

  /** Last month left unclosed rings every setter, on the new month's first
   *  day only (`sweep` gates it), not `ALERT_FROM_DAY`. A month with no
   *  agreed role target did not run on KPI, so it is never asked to close. The
   *  event key is the month alone: each setter is rung once, the UNIQUE says. */
  async remindClose(period: KpiPeriodKey): Promise<void> {
    const [closed, targets] = await Promise.all([
      this.closes.of(period),
      this.targets.ofPeriod(period),
    ])
    if (closed || !targets.some((t) => t.agreedAt)) return
    await this.repo.run((tx) => this.alerts.monthUnclosed(tx, period))
  }

  /** Lines announced for `period`. A closed month has a verdict and a future
   *  one no pace, so neither is ever rung; nor the running one before
   *  `ALERT_FROM_DAY`, which claims nothing, so its flags can still ring later. */
  async ring(period: KpiPeriodKey): Promise<number> {
    /* Running means today lies in `period`, so today's day is the month's. */
    const day = Number(vietnamToday().slice(8, 10))
    if (monthClock(period).phase !== 'running' || day < ALERT_FROM_DAY) return 0
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
