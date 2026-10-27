import { Injectable, Logger } from '@nestjs/common'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { isTieredPeriod, RoleId, type KpiPeriodKey, type OrgUnitKind } from '@pv/contracts'
import { KpiAssignmentBells } from './kpi-assignment-bells'
import { KpiAssignmentReader } from './kpi-assignment-read.service'
import { KpiAssignmentRepository } from './kpi-assignment.repository'
import {
  deadlineOf,
  defaultLines,
  holdersUnder,
  draftOf,
  inForceOf,
  isCompany,
  needsSet,
  receivedOf,
  receiversOf,
  toValues,
  type Previous,
} from './kpi-assignment.mapper'
import { KpiConfigService } from './kpi-config.service'
import { nextMonth, vietnamToday } from './kpi-rules'
import { KpiTeamRepository } from './kpi-team.repository'

/** Hourly, not daily: a restart then cannot skip a deadline day, and a pass is idempotent. */
const SWEEP_EVERY_MS = 60 * 60_000

/** The audit line's actor when no person wrote: the repo has no system actor
 *  of its own, and `audit.actor_id` carries no FK, so the sweep names itself. */
const SWEEP_ACTOR = 'system:kpi-assignment-sweep'

/** Top level first: a level's default reads the one just written above it. */
const LEVELS: readonly OrgUnitKind[] = ['company', 'department', 'team']

/** ADR 0120 §6: a level past its deadline gets last month's figures, sent by
 *  default, and the head one level up is told.
 *
 *  "Past" is `today > deadline`, not "today is the day after": a pass that
 *  missed a day still writes. The set itself is the memory — a slot already in
 *  force is skipped and each bell is keyed on its slot — so the hourly cadence
 *  is a saving, not a guard. Last month and the running one are both looked
 *  at, so an outage over a month end still catches up. `run` takes the day so
 *  an acceptance run can ask for any. One transaction per month, under the
 *  roster lock the doors take; last month's figures are read before it. */
@Injectable()
export class KpiAssignmentSweeper {
  private readonly log = new Logger('sales.kpi')
  private notBefore = 0
  private running = false

  constructor(
    private readonly repo: KpiAssignmentRepository,
    private readonly reader: KpiAssignmentReader,
    private readonly teams: KpiTeamRepository,
    private readonly config: KpiConfigService,
    private readonly bells: KpiAssignmentBells,
    private readonly audit: AuditRepository,
  ) {}

  /** Called on every worker tick; `null` = this tick was not a pass. */
  async sweep(now = Date.now()): Promise<number | null> {
    if (this.running || now < this.notBefore) return null
    this.notBefore = now + SWEEP_EVERY_MS
    this.running = true
    try {
      const written = await this.run(vietnamToday(now))
      if (written > 0) this.log.log(`Wrote ${written} KPI sets by default.`)
      return written
    } finally {
      this.running = false
    }
  }

  async run(today: string): Promise<number> {
    const month = today.slice(0, 7)
    const next = nextMonth(month)
    let written = 0
    for (const period of [month, next].filter(isTieredPeriod)) {
      written += await this.month(period, today)
    }
    return written
  }

  private async month(period: KpiPeriodKey, today: string): Promise<number> {
    const due = LEVELS.filter((kind) => today > deadlineOf(period, kind))
    if (due.length === 0) return 0
    const catalog = await this.config.effectiveCatalog()
    const roles = RoleId.options.filter((r) => catalog[r].length > 0)
    const prev = new Map<RoleId, Previous>()
    for (const role of roles) prev.set(role, await this.reader.previous(period, role))
    return this.repo.run(async (tx) => {
      await this.teams.lockRoster(tx)
      let written = 0
      for (const kind of due) {
        /* Re-read per level: the one above may have just been written. */
        const book = await this.reader.book(period, tx)
        if (!book) return written
        const units = book.tree.nodes.filter((n) => n.kind === kind).map((n) => n.unitId)
        for (const role of roles) {
          for (const unitId of units) {
            if (!needsSet(book.tree, catalog[role], role, unitId)) continue
            if (inForceOf(book.sets, role, unitId)) continue
            const company = isCompany(book.tree, unitId)
            const to = receiversOf(book.tree, role, unitId)
            const lines = defaultLines(
              catalog[role],
              company,
              receivedOf(book, role, unitId),
              to,
              (u) => holdersUnder(book.tree, role, u),
              prev.get(role)!,
            )
            const live = draftOf(book.sets, role, unitId)
            const sent = { status: 'sent' as const, byDefault: true, sentAt: new Date() }
            const version = live?.version ?? (await this.repo.nextVersion(tx, period, role, unitId))
            /* An unsent draft at the deadline is that same row, sent in place. */
            const id = live
              ? (await this.repo.moveSet(tx, live, sent)) && live.id
              : await this.repo.insertSet(tx, { period, role, unitId, version, ...sent })
            if (!id) throw new Error(`kpi: default set ${period}/${role}/${unitId} lost a race`)
            await this.repo.replaceLines(tx, id, toValues(lines))
            const note = { kpi: 'assignment-defaulted', period, role, unit: unitId, version }
            await this.audit.write(
              {
                actorId: SWEEP_ACTOR,
                action: 'edit',
                note: JSON.stringify({ ...note, draft: !!live }),
              },
              tx,
            )
            const slot = { period, role, unitId, version }
            await this.bells.received(tx, null, book, slot, lines, null, today)
            await this.bells.late(tx, book, role, unitId, today)
            written += 1
          }
        }
      }
      return written
    })
  }
}
