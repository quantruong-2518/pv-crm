import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import { KPI_ONE_ON_ONE_WRITTEN } from '@pv/engines'
import {
  type KpiMyActionsResponse,
  type KpiOneOnOneBody,
  type KpiOneOnOneResponse,
  type KpiPeriodKey,
  type KpiScoreResponse,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import { DB, type Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, notFound } from '@api/platform/http/problem'
import { headOf, unitsAbove } from '@api/platform/org/org-heads'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { monthLabel } from './kpi-alert.service'
import { personAccuracy } from './kpi-accuracy'
import { KpiCloseRepository } from './kpi-close.repository'
import { KpiConfigService } from './kpi-config.service'
import { KpiOneOnOneRepository } from './kpi-one-on-one.repository'
import { assertReadsPerson, readsPerson } from './kpi-person-access'
import { assertTieredMonth, holdsSigned, vietnamToday } from './kpi-rules'
import { KpiScoreReader } from './kpi-score.reader'
import { KpiSeatService } from './kpi-seat.service'
import { KpiTeamRepository } from './kpi-team.repository'

/** Total score read and the monthly 1:1 (ADR 0158 §3–4). The month must be tiered and
 *  closed before a 1:1 exists; the writer is whoever acts today for the head of the
 *  person's lowest unit (the unit above for that unit's own head). Doors sit on
 *  `kpi.view` (ADR 0004): who may write is the tree's fact, checked here. */

type Seat = { unitId: string | null; actors: string[] }

const notOpen = () => conflict('Buổi 1:1 chỉ có sau khi tháng đã chốt.')
const acknowledged = () => conflict('Người nhận đã xác nhận nên không sửa được nữa.')
const notYours = () => denied('permission-denied', 'Bạn không phụ trách người này.')

@Injectable()
export class KpiOneOnOneService {
  constructor(
    private readonly repo: KpiOneOnOneRepository,
    private readonly teams: KpiTeamRepository,
    private readonly seats: KpiSeatService,
    private readonly closes: KpiCloseRepository,
    private readonly scores: KpiScoreReader,
    private readonly config: KpiConfigService,
    private readonly hub: NotificationHub,
    private readonly audit: AuditRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
    @Inject(DB) private readonly db: Db,
  ) {}

  async score(who: Actor, period: KpiPeriodKey, actorId: string): Promise<KpiScoreResponse> {
    await assertReadsPerson(this.access, this.teams, this.seats, who, period, actorId)
    return this.scoreOf(period, actorId)
  }

  async view(
    who: Actor,
    period: KpiPeriodKey,
    actorId: string,
    today = vietnamToday(),
  ): Promise<KpiOneOnOneResponse> {
    const seat = await this.seatOver(period, actorId, today)
    const writes = seat.actors.includes(who.id)
    if (!writes) await this.assertReads(who, period, actorId)
    if (!(await this.isOpen(period))) return this.empty()
    const [score, row] = await Promise.all([
      this.scoreOf(period, actorId),
      this.repo.find(period, actorId),
    ])
    const actions = row ? await this.repo.actionsOf(row.id) : []
    return {
      ...score,
      note: row?.note ?? null,
      actions: actions.map((a) => ({
        id: a.id,
        text: a.text,
        due: a.due,
        doneAt: a.doneAt?.toISOString() ?? null,
      })),
      writerName: row?.writerName ?? null,
      sentAt: row?.sentAt.toISOString() ?? null,
      acknowledgedAt: row?.acknowledgedAt?.toISOString() ?? null,
      canWrite: writes && !row?.acknowledgedAt,
      canAcknowledge: who.id === actorId && !!row && !row.acknowledgedAt,
      canMarkDone: who.id === actorId || writes,
    }
  }

  async write(
    who: Actor,
    period: KpiPeriodKey,
    actorId: string,
    body: KpiOneOnOneBody,
    today = vietnamToday(),
  ): Promise<KpiOneOnOneResponse> {
    assertTieredMonth(period)
    if (!(await this.isOpen(period))) throw notOpen()
    await this.repo.run(async (tx) => {
      await this.teams.lockRoster(tx)
      if (!(await this.seatOver(period, actorId, today, tx)).actors.includes(who.id))
        throw notYours()
      const existing = await this.repo.find(period, actorId, tx, true)
      if (existing?.acknowledgedAt) throw acknowledged()
      const id = await this.repo.upsert(
        tx,
        { period, actorId, writerId: who.id, note: body.note },
        existing,
      )
      await this.repo.replaceActions(tx, id, body.actions)
      await this.note(tx, who, { kpi: 'one-on-one-written', period, person: actorId })
      if (!existing) await this.ring(tx, who, period, actorId, id)
    })
    return this.view(who, period, actorId, today)
  }

  async acknowledge(
    who: Actor,
    period: KpiPeriodKey,
    actorId: string,
    today = vietnamToday(),
  ): Promise<KpiOneOnOneResponse> {
    if (who.id !== actorId) throw denied('permission-denied', 'Chỉ người nhận mới xác nhận.')
    await this.repo.run(async (tx) => {
      const row = await this.repo.find(period, actorId, tx, true)
      if (!row) throw notFound('buổi 1:1')
      if (row.acknowledgedAt) throw acknowledged()
      await this.repo.acknowledge(tx, row.id)
      await this.note(tx, who, { kpi: 'one-on-one-acknowledged', period })
    })
    return this.view(who, period, actorId, today)
  }

  async done(who: Actor, actionId: string, today = vietnamToday()): Promise<void> {
    const owner = await this.repo.actionOwner(actionId)
    if (!owner) throw notFound('việc cần làm')
    const period = owner.period as KpiPeriodKey
    if (owner.actorId !== who.id) {
      const seat = await this.seatOver(period, owner.actorId, today)
      if (!seat.actors.includes(who.id)) throw notYours()
    }
    await this.repo.run(async (tx) => {
      await this.repo.lockRow(tx, owner.action.oneOnOneId)
      if (await this.repo.markDone(tx, actionId, who.id))
        await this.note(tx, who, { kpi: 'one-on-one-action-done', period, action: actionId })
    })
  }

  async mine(who: Actor): Promise<KpiMyActionsResponse> {
    const rows = await this.repo.openActionsOf(who.id)
    return {
      actions: rows.map((a) => ({
        id: a.id,
        text: a.text,
        due: a.due,
        doneAt: null,
        period: a.period as KpiPeriodKey,
      })),
    }
  }

  private async isOpen(period: KpiPeriodKey): Promise<boolean> {
    return this.tiered(period) && (await this.closes.of(period)) !== null
  }

  private tiered(period: KpiPeriodKey): boolean {
    try {
      assertTieredMonth(period)
      return true
    } catch {
      return false
    }
  }

  private async scoreOf(period: KpiPeriodKey, actorId: string): Promise<KpiScoreResponse> {
    const score = (await this.scores.monthScores(period, [actorId])).get(actorId) ?? null
    const [catalog, roles] = await Promise.all([
      this.config.effectiveCatalog(),
      this.repo.rolesOf(actorId),
    ])
    const signed = roles.some((r) => catalog[toContractRole(r)].some(holdsSigned))
    const accuracy = signed
      ? ((await personAccuracy(period, [actorId], this.db)).get(actorId) ?? null)
      : null
    return { score, accuracy }
  }

  private empty(): KpiOneOnOneResponse {
    return {
      score: null,
      accuracy: null,
      note: null,
      actions: [],
      writerName: null,
      sentAt: null,
      acknowledgedAt: null,
      canWrite: false,
      canAcknowledge: false,
      canMarkDone: false,
    }
  }

  /** Who acts today over `actorId`'s lowest unit; the person never sits in their own seat. */
  private async seatOver(
    period: KpiPeriodKey,
    actorId: string,
    today: string,
    handle?: Db,
  ): Promise<Seat> {
    const tree = await this.teams.orgTreeAt(period, handle)
    const home = tree?.members.find((m) => m.actorId === actorId)?.unitId
    if (!tree || !home) return { unitId: null, actors: [] }
    const unitId = headOf(tree, home) === actorId ? (unitsAbove(tree, home)[0] ?? null) : home
    if (!unitId) return { unitId: null, actors: [] }
    const seat = (await this.seats.unitSeats(tree, [unitId], today, handle)).get(unitId) ?? []
    return { unitId, actors: seat.filter((id) => id !== actorId) }
  }

  private async assertReads(who: Actor, period: KpiPeriodKey, actorId: string): Promise<void> {
    if (!(await readsPerson(this.access, this.teams, this.seats, who, period, actorId)))
      throw denied(
        'permission-denied',
        'Bạn chỉ xem được buổi 1:1 của mình và của người bạn phụ trách.',
      )
  }

  /** Digested kind: the hub writes it read and the morning sweep sums it. */
  private ring(tx: Db, who: Actor, period: KpiPeriodKey, actorId: string, id: string) {
    return this.hub.announce(tx, {
      event: {
        name: KPI_ONE_ON_ONE_WRITTEN,
        ref: { code: period },
        occurrence: id,
        actorId: who.id,
        audiences: { person: [actorId] },
      },
      subject: {
        kind: 'kpi-scorecard',
        code: period,
        label: `${who.name} viết buổi 1:1 · ${monthLabel(period)}`,
      },
    })
  }

  /** Same transaction as the rows. */
  private note(tx: Db, who: Actor, payload: object): Promise<void> {
    return this.audit.write({ actorId: who.id, action: 'edit', note: JSON.stringify(payload) }, tx)
  }
}
