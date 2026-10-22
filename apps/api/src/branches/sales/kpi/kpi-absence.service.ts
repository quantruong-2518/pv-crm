import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  KpiAbsence,
  KpiAbsenceListResponse,
  KpiStandInCandidatesResponse,
  type KpiAbsenceCreate,
  type KpiAbsenceUpdate,
  type KpiStandInCandidatesQuery,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, invalid, notFound } from '@api/platform/http/problem'
import { KpiAbsenceRepository, type KpiAbsenceRow } from './kpi-absence.repository'
import { rosterOf } from './kpi-allocation-team'
import { KpiAlertService, monthLabel } from './kpi-alert.service'
import { vietnamToday } from './kpi-rules'
import { KpiSeatService } from './kpi-seat.service'
import { KpiTeamRepository } from './kpi-team.repository'

/** Absences and stand-ins for KPI work (ADR 0117 §1–2, §4).
 *
 *  The person declares their own; a `kpi.set-target` holder may declare,
 *  change or cancel anyone's. The checks that need today or other rows live
 *  here: the start is today or later, no two live absences of one person
 *  overlap (under a per-person lock — no exclusion constraint), and the
 *  stand-in is someone the seat needs, active and not away on any of the days.
 *  Each write is one transaction with its audit line; an absence starting today
 *  rings its stand-in at once, the daily sweep rings the rest. */

const DAY_MS = 86_400_000
const nextDay = (day: string) => new Date(Date.parse(day) + DAY_MS).toISOString().slice(0, 10)

const toWire = (r: KpiAbsenceRow): KpiAbsence => ({
  id: r.id,
  actor: { actorId: r.actorId, name: r.actorName },
  fromDay: r.fromDay,
  toDay: r.toDay,
  standIn: { actorId: r.standInId, name: r.standInName },
  declaredBy: { actorId: r.declaredById, name: r.declaredByName },
  declaredAt: r.declaredAt.toISOString(),
  cancelledAt: r.cancelledAt?.toISOString() ?? null,
})

@Injectable()
export class KpiAbsenceService {
  constructor(
    private readonly repo: KpiAbsenceRepository,
    private readonly seats: KpiSeatService,
    private readonly teams: KpiTeamRepository,
    private readonly alerts: KpiAlertService,
    private readonly audit: AuditRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  /** Live and coming absences, plus this month's cancelled ones: everyone's
   *  for a setter, else the caller's own and those they stand in for. */
  async list(who: Actor): Promise<KpiAbsenceListResponse> {
    const today = vietnamToday()
    const monthStart = new Date(Date.parse(`${today.slice(0, 7)}-01T00:00:00+07:00`))
    const all = this.access.allows(who, 'kpi.set-target')
    const rows = await this.repo.list(today, monthStart, all ? undefined : who.id)
    return KpiAbsenceListResponse.parse({ absences: rows.map(toWire) })
  }

  async candidates(
    who: Actor,
    q: KpiStandInCandidatesQuery,
  ): Promise<KpiStandInCandidatesResponse> {
    const personId = q.actorId ?? who.id
    this.assertMayDeclare(who, personId)
    const ids = await this.eligible(personId)
    const faces = await this.teams.actors(ids)
    return KpiStandInCandidatesResponse.parse({
      candidates: faces.map((a) => ({ actorId: a.id, name: a.name })),
    })
  }

  async create(who: Actor, body: KpiAbsenceCreate): Promise<KpiAbsence> {
    const personId = body.actorId ?? who.id
    this.assertMayDeclare(who, personId)
    if (body.standInId === personId) throw invalid({ standInId: ['Chọn người khác làm thay.'] })
    const today = vietnamToday()
    if (body.fromDay < today) {
      throw invalid({ fromDay: ['Ngày bắt đầu không được trước hôm nay.'] })
    }
    if ((await this.teams.actors([personId])).length === 0) throw notFound('người này')
    const id = await this.repo.run(async (tx) => {
      await this.repo.lockActor(tx, personId)
      await this.assertFree(tx, personId, body.fromDay, body.toDay)
      await this.assertStandIn(tx, personId, body.standInId, body.fromDay, body.toDay)
      const made = await this.repo.insert(tx, {
        actorId: personId,
        fromDay: body.fromDay,
        toDay: body.toDay,
        standInId: body.standInId,
        declaredById: who.id,
      })
      await this.note(tx, who, { kpi: 'absence-declared', absence: made, actor: personId })
      const row = await this.repo.byId(made, tx)
      if (row && row.fromDay === today) await this.ringStandIn(tx, row, today)
      return made
    })
    return this.read(id)
  }

  /** Only the end moves (ADR 0117 default 4); the stand-in is checked again on the added days. */
  async update(who: Actor, absenceId: string, body: KpiAbsenceUpdate): Promise<KpiAbsence> {
    const row = await this.repo.byId(absenceId)
    if (!row) throw notFound('kỳ vắng')
    this.assertMayDeclare(who, row.actorId)
    if (row.cancelledAt) throw conflict('Kỳ vắng này đã huỷ.')
    const today = vietnamToday()
    if (body.toDay < row.fromDay || body.toDay < today) {
      throw invalid({ toDay: ['Ngày kết thúc phải từ hôm nay và không trước ngày bắt đầu.'] })
    }
    await this.repo.run(async (tx) => {
      await this.repo.lockActor(tx, row.actorId)
      await this.assertFree(tx, row.actorId, row.fromDay, body.toDay, row.id)
      if (body.toDay > row.toDay) {
        await this.assertStandIn(tx, row.actorId, row.standInId, nextDay(row.toDay), body.toDay)
      }
      if (!(await this.repo.setToDay(tx, row.id, body.toDay))) throw conflict('Kỳ vắng này đã huỷ.')
      await this.note(tx, who, { kpi: 'absence-changed', absence: row.id, toDay: body.toDay })
    })
    return this.read(absenceId)
  }

  /** Ends at once (ADR 0117 default 2): the waiting lists move back. */
  async cancel(who: Actor, absenceId: string): Promise<KpiAbsence> {
    const row = await this.repo.byId(absenceId)
    if (!row) throw notFound('kỳ vắng')
    this.assertMayDeclare(who, row.actorId)
    await this.repo.run(async (tx) => {
      if (!(await this.repo.cancel(tx, row.id))) throw conflict('Kỳ vắng này đã huỷ.')
      await this.note(tx, who, { kpi: 'absence-cancelled', absence: row.id })
    })
    return this.read(absenceId)
  }

  /** The daily sweep's stand-in bells (ADR 0117 §4): absences starting today,
   *  and leads of the running month locked within `lockedWithinMs` — the
   *  caller's cadence, so a lock older than that is not rung on first deploy.
   *  The occurrence keys make a second pass, or the declaring door's own bell, a no-op. */
  async sweep(lockedWithinMs: number): Promise<void> {
    const today = vietnamToday()
    const since = Date.now() - lockedWithinMs
    const period = today.slice(0, 7)
    await this.repo.run(async (tx) => {
      for (const row of await this.repo.startingOn(today, tx))
        await this.ringStandIn(tx, row, today)
      const entries = await this.teams.rosterAt(period, tx)
      const roster = rosterOf(entries)
      const leads = entries.filter((e) => e.lead)
      const locked = await this.repo.lockedAt(
        leads.map((e) => e.actorId),
        tx,
      )
      const fresh = locked.filter((l) => l.disabledAt.getTime() >= since)
      if (fresh.length === 0) return
      const seats = await this.seats.bellLeadSeats(
        roster,
        leads.map((e) => e.teamId),
        today,
        tx,
      )
      for (const lead of fresh) {
        const team = leads.find((e) => e.actorId === lead.id)!
        await this.alerts.standIn(tx, {
          to: seats.get(team.teamId) ?? [],
          forName: lead.name,
          waiting: await this.repo.waitingFor(lead.id, [team.teamId], period, tx),
          occurrence: `locked/${lead.id}/${vietnamToday(lead.disabledAt.getTime())}`,
          subject: { kind: 'kpi-team', code: team.teamId, label: team.teamName },
        })
      }
    })
  }

  /** Whoever now acts for the person hears whom and what waits on their seats
   *  — through the seat rule, so a stand-in locked or away by the start day
   *  leaves the bell to the setters. A lead's line opens the team page, anyone
   *  else's the allocations. */
  private async ringStandIn(tx: Db, row: KpiAbsenceRow, today: string): Promise<void> {
    const period = today.slice(0, 7)
    const entries = await this.teams.rosterAt(period, tx)
    const led = entries.filter((e) => e.lead && e.actorId === row.actorId)
    const team = led[0]
    const waiting = await this.repo.waitingFor(
      row.actorId,
      led.map((e) => e.teamId),
      period,
      tx,
    )
    const sender = { kind: 'sender', actorId: row.actorId } as const
    /* No seat to act for and nothing waiting: a stand-in bell would say nothing. */
    if (!team && waiting === 0 && !(await this.seats.setterHolders(tx)).includes(row.actorId))
      return
    const seats = team
      ? [
          ...(
            await this.seats.bellLeadSeats(
              rosterOf(entries),
              led.map((e) => e.teamId),
              today,
              tx,
              [row.actorId],
            )
          ).values(),
        ]
      : [await this.seats.bellActors(sender, period, today, tx, [row.actorId])]
    await this.alerts.standIn(tx, {
      to: [...new Set(seats.flat())],
      forName: row.actorName,
      waiting,
      occurrence: `absence/${row.id}`,
      subject: team
        ? { kind: 'kpi-team', code: team.teamId, label: team.teamName }
        : { kind: 'kpi-allocation', code: period, label: monthLabel(period) },
    })
  }

  /** ADR 0117 §2: a setter for anyone (another setter for a setter); for a
   *  team's lead in the running month, also a member of that team. Active only. */
  private async eligible(personId: string, handle?: Db): Promise<string[]> {
    const db = handle ?? this.repo.readonlyHandle
    const entries = await this.teams.rosterAt(vietnamToday().slice(0, 7), db)
    const led = new Set(
      entries.filter((e) => e.lead && e.actorId === personId).map((e) => e.teamId),
    )
    const members = entries.filter((e) => led.has(e.teamId)).map((e) => e.actorId)
    const ids = [...new Set([...(await this.seats.setterHolders(db)), ...members])]
    const locked = await this.teams.disabledAmong(ids, db)
    return ids.filter((id) => id !== personId && !locked.has(id))
  }

  private async assertStandIn(
    tx: Db,
    personId: string,
    standInId: string,
    from: string,
    to: string,
  ) {
    if (!(await this.eligible(personId, tx)).includes(standInId)) {
      throw invalid({ standInId: ['Người này không làm thay được việc KPI của người vắng.'] })
    }
    if ((await this.repo.awayAmong([standInId], from, to, tx)).has(standInId)) {
      throw invalid({ standInId: ['Người làm thay cũng vắng trong những ngày này.'] })
    }
  }

  private async assertFree(tx: Db, personId: string, from: string, to: string, except?: string) {
    if ((await this.repo.overlapping(tx, personId, from, to, except)).length > 0) {
      throw conflict('Người này đã có kỳ vắng trùng những ngày này.')
    }
  }

  private assertMayDeclare(who: Actor, personId: string): void {
    if (personId !== who.id && !this.access.allows(who, 'kpi.set-target')) {
      throw denied(
        'permission-denied',
        'Chỉ người vắng hoặc người giao chỉ tiêu khai được kỳ vắng.',
      )
    }
  }

  private async read(id: string): Promise<KpiAbsence> {
    const row = await this.repo.byId(id)
    if (!row) throw notFound('kỳ vắng')
    return KpiAbsence.parse(toWire(row))
  }

  private note(tx: Db, who: Actor, payload: object): Promise<void> {
    return this.audit.write({ actorId: who.id, action: 'edit', note: JSON.stringify(payload) }, tx)
  }
}
