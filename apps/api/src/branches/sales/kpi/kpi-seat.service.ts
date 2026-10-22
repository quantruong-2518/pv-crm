import { Injectable } from '@nestjs/common'
import type { Actor, Permission } from '@pv/engines'
import type { KpiPeriodKey, KpiTargetActor } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { KpiAbsenceRepository } from './kpi-absence.repository'
import { rosterOf, type Roster } from './kpi-allocation-team'
import { vietnamToday } from './kpi-rules'
import { KpiTeamRepository } from './kpi-team.repository'

/** `seatActors` (ADR 0117 §3, §6): THE one answer to "who acts on this KPI
 *  item today"; it replaces both copies of ADR 0101 default 16.
 *
 *  A holder seat (a team's lead in a month, a package's sender) is its holder
 *  if active and not away; else the holder's declared stand-in if active, not
 *  away and still fit for THIS seat (a team lead's: a member of that team in
 *  that month's roster, or a setter; a sender's: a setter); else the setters
 *  not away. "Setter" is one definition: `kpi.set-target` and `kpi.view-all`
 *  (ADR 0117 default 5). Nobody gains a permission by standing in.
 *
 *  Two paths. Doors and waiting lists read `seatActors`/`leadSeats`: strict,
 *  and pool doors add `isAway`. Bells read `bellActors`/`bellLeadSeats`/
 *  `presentHolders`, which may name away people (`poolOf`, owner 22/10) —
 *  never decide who may act from them. */

export type KpiStandInSeat =
  { kind: 'team-lead'; teamId: string } | { kind: 'sender'; actorId: string } | { kind: 'setters' }

/** A holder and who may stand in for them on this seat, beyond the setters. */
type Holder = { id: string | null; members: readonly string[] }

const present = (ids: readonly string[], away: ReadonlyMap<string, string>): string[] =>
  ids.filter((id) => !away.has(id))

/** THE rule of every pool's bell, the setters' and any permission's (ADR 0117 §5):
 *  members less `without` (the actor, whom E4 drops anyway), present ones, else
 *  all of them — owner's choice of 22/10, so waiting work is never orphaned. */
function poolOf(
  ids: readonly string[],
  away: ReadonlyMap<string, string>,
  without: readonly string[],
): string[] {
  const others = ids.filter((id) => !without.includes(id))
  const here = present(others, away)
  return here.length > 0 ? here : others
}

@Injectable()
export class KpiSeatService {
  constructor(
    private readonly absences: KpiAbsenceRepository,
    private readonly teams: KpiTeamRepository,
    private readonly hub: NotificationHub,
  ) {}

  async seatActors(
    seat: KpiStandInSeat,
    period: KpiPeriodKey,
    today = vietnamToday(),
    handle: Db = this.absences.readonlyHandle,
  ): Promise<string[]> {
    if (seat.kind === 'team-lead') {
      const roster = rosterOf(await this.teams.rosterAt(period, handle))
      return (await this.leadSeats(roster, [seat.teamId], today, handle)).get(seat.teamId) ?? []
    }
    if (seat.kind === 'sender') {
      return (await this.acting([{ id: seat.actorId, members: [] }], today, handle))[0] ?? []
    }
    return present(await this.setterHolders(handle), await this.absences.awayOn(today, handle))
  }

  /** The bell path of `seatActors`: its answer less `without`, and where that
   *  is empty the setters' pool under `poolOf`. Never a door. */
  async bellActors(
    seat: KpiStandInSeat,
    period: KpiPeriodKey,
    today = vietnamToday(),
    handle: Db = this.absences.readonlyHandle,
    without: readonly string[] = [],
  ): Promise<string[]> {
    const acting = seat.kind === 'setters' ? [] : await this.seatActors(seat, period, today, handle)
    return (await this.orPool([acting], today, handle, without))[0] ?? []
  }

  /** The bell path of `leadSeats`, per team as `bellActors`. */
  async bellLeadSeats(
    roster: Roster,
    teamIds: readonly string[],
    today = vietnamToday(),
    handle: Db = this.absences.readonlyHandle,
    without: readonly string[] = [],
  ): Promise<Map<string, string[]>> {
    const seats = await this.leadSeats(roster, teamIds, today, handle)
    const lists = teamIds.map((id) => seats.get(id) ?? [])
    const bells = await this.orPool(lists, today, handle, without)
    return new Map(teamIds.map((id, i) => [id, bells[i] ?? []]))
  }

  /** Who acts for each team's lead under `roster` — the caller's roster, so a
   *  door that read it under the roster lock judges that one. One read for many teams. */
  async leadSeats(
    roster: Roster,
    teamIds: readonly string[],
    today = vietnamToday(),
    handle: Db = this.absences.readonlyHandle,
  ): Promise<Map<string, string[]>> {
    const holders = teamIds.map((id) => ({ id: roster.leadOf(id), members: roster.membersOf(id) }))
    const acting = await this.acting(holders, today, handle)
    return new Map(teamIds.map((id, i) => [id, acting[i] ?? []]))
  }

  /** Reading follows the seat (ADR 0117 §6): the roster's lead keeps the team
   *  while away, and whoever acts for the lead today reads it too. */
  async readsTeam(who: Actor, roster: Roster, teamId: string): Promise<boolean> {
    if (roster.leadOf(teamId) === who.id) return true
    return (await this.leadSeats(roster, [teamId])).get(teamId)?.includes(who.id) ?? false
  }

  /** `KpiTeam.actingFor` per team: who acts for the lead today, named; empty
   *  when the lead acts themself. The roster screen and the team page read it. */
  async actingFor(
    roster: Roster,
    teamIds: readonly string[],
  ): Promise<Map<string, KpiTargetActor[]>> {
    const seats = await this.leadSeats(roster, teamIds)
    const ids = [...new Set([...seats.values()].flat())]
    const names = new Map((await this.teams.actors(ids)).map((a) => [a.id, a.name]))
    return new Map(
      teamIds.map((teamId) => {
        const acting = seats.get(teamId) ?? []
        const self = acting.length === 1 && acting[0] === roster.leadOf(teamId)
        const named = acting.map((id) => ({ actorId: id, name: names.get(id) ?? id }))
        return [teamId, self ? [] : named]
      }),
    )
  }

  /** An away holder drops out of a pool and its doors (ADR 0117 §5). */
  async isAway(actorId: string, today = vietnamToday(), handle?: Db): Promise<boolean> {
    return (await this.absences.awayAmong([actorId], today, today, handle)).has(actorId)
  }

  /** Every active setter, away or not — who may be named a stand-in.
   *  Sequential, not parallel: each `holding` opens a savepoint on `handle`. */
  async setterHolders(handle: Db = this.absences.readonlyHandle): Promise<string[]> {
    const setters = await this.hub.holding(handle, 'kpi.set-target', 'Sales')
    const viewers = await this.hub.holding(handle, 'kpi.view-all', 'Sales')
    return setters.filter((id) => viewers.includes(id))
  }

  /** A pool's bell by permission, under `poolOf`. An away holder's stand-in is
   *  not added: nobody gains a permission by standing in. */
  async presentHolders(
    permission: Permission,
    today = vietnamToday(),
    handle: Db = this.absences.readonlyHandle,
    without: readonly string[] = [],
  ): Promise<string[]> {
    const holders = await this.hub.holding(handle, permission, 'Sales')
    return poolOf(holders, await this.absences.awayOn(today, handle), without)
  }

  /** The holder rule for each holder; no holder falls to the setters. The
   *  stand-in is re-checked against the seat here, not only when declared:
   *  a roster or a grant may have changed since. */
  private async acting(holders: readonly Holder[], today: string, handle: Db) {
    const away = await this.absences.awayOn(today, handle)
    const people = holders.flatMap((h) => (h.id ? [h.id, away.get(h.id) ?? h.id] : []))
    const locked = await this.teams.disabledAmong([...new Set(people)], handle)
    const holding = await this.setterHolders(handle)
    const setters = present(holding, away)
    const fit = (who: string) => !locked.has(who) && !away.has(who)
    return holders.map(({ id, members }): string[] => {
      if (!id) return setters
      if (fit(id)) return [id]
      const standIn = away.get(id)
      const allowed = standIn && (holding.includes(standIn) || members.includes(standIn))
      return standIn && allowed && fit(standIn) ? [standIn] : setters
    })
  }

  /** Each list less `without`; an emptied one takes the setters' bell pool. */
  private async orPool(
    lists: readonly string[][],
    today: string,
    handle: Db,
    without: readonly string[],
  ): Promise<string[][]> {
    const kept = lists.map((l) => l.filter((id) => !without.includes(id)))
    if (kept.every((l) => l.length > 0)) return kept
    const away = await this.absences.awayOn(today, handle)
    const pool = poolOf(await this.setterHolders(handle), away, without)
    return kept.map((l) => (l.length > 0 ? l : pool))
  }
}
