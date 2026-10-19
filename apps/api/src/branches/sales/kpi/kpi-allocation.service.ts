import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  KPI_METRIC_LABEL,
  KpiAllocationResponse,
  type KpiAllocation,
  type KpiAllocationDecideBody,
  type KpiAllocationDraftBody,
  type KpiAllocationSubmitBody,
  type KpiMonthClose,
  type KpiPeriodKey,
  type RoleId,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, invalid } from '@api/platform/http/problem'
import { spansOf, type PeriodSpan } from '../performance/performance-period'
import { KpiAlertService } from './kpi-alert.service'
import {
  missingSharedLines,
  rosterOf,
  roomFaults,
  shareTargetOf,
  shareValues,
  teamAmounts,
  teamFaults,
  throwFaults,
  type Roster,
  type ShareInForce,
} from './kpi-allocation-team'
import {
  KpiAllocationRepository,
  type KpiLineRow,
  type KpiPackageRow,
} from './kpi-allocation.repository'
import type { KpiAllocationRowDb } from './kpi-allocation.schema'
import {
  mismatchOf,
  toAllocation,
  toShareLines,
  totalsOf,
  type FigureOf,
  type RoleTargetOf,
} from './kpi-allocation.mapper'
import { KpiCloseRepository } from './kpi-close.repository'
import type { KpiCatalog } from './kpi-config.overlay'
import { KpiConfigService } from './kpi-config.service'
import {
  KpiReadingsRepository,
  type Actors,
  type KpiKnown,
  type KpiPerson,
} from './kpi-readings.repository'
import { assertTargetValues, monthClock, stillOpen, vietnamToday } from './kpi-rules'
import { KpiTargetsRepository, type KpiTargetRow } from './kpi-targets.repository'
import { KpiTeamRepository, type RosterEntry } from './kpi-team.repository'
import { agreedIn, slotsOf, toReadings } from './kpi.mapper'

export const stale = () =>
  conflict('Gói chỉ tiêu vừa được người khác thay đổi. Tải lại rồi làm lại.')

/** A package its holders have been handed: they read it, confirm it, counter it. */
export const notLead = () => denied('permission-denied', 'Bạn không phụ trách nhóm này.')

export const handedDown = (p: Pick<KpiAllocationRowDb, 'status'>): boolean =>
  p.status === 'submitted' || p.status === 'agreed'

/** One package slot of a month: a role at a tier. */
const tierKey = (p: Pick<KpiAllocationRowDb, 'role' | 'teamId'>): string =>
  `${p.role}|${p.teamId ?? ''}`

const holdersOf = (
  people: readonly {
    id: string
    name: string
    roleIds: readonly Parameters<typeof toContractRole>[0][]
  }[],
  role: RoleId,
): Set<string> =>
  new Set(people.filter((p) => p.roleIds.map(toContractRole).includes(role)).map((p) => p.id))

/** The roster of the month and who holds each role, read together. */
export type KpiTier = {
  entries: RosterEntry[]
  roster: Roster
  holders: (role: RoleId) => Set<string>
  people: KpiPerson[]
}

/** What one request that fans out to several readers (the team page) loads
 *  once and hands to each of them, so none re-reads it. */
export type KpiPeriodContext = {
  tier: KpiTier
  catalog: KpiCatalog
  targetRows: KpiTargetRow[]
  shares: ShareInForce[]
  tolerance: number
  monthClose: KpiMonthClose
}

export const tierOf = (entries: RosterEntry[], people: KpiPerson[]): KpiTier => ({
  entries,
  roster: rosterOf(entries),
  holders: (role) => holdersOf(people, role),
  people,
})

/** A role's monthly package: drafted by one manager and sent by that same
 *  author, agreed or returned by another (ADR 0098 §1, 0082 §5). Whoever set
 *  the numbers last is the package's `submittedBy`, so they never agree them.
 *
 *  Two tiers (ADR 0101): the room package splits the target across people in
 *  no team and teams (shares); a team's lead then splits the share in a team
 *  package. Re-splitting an agreed or a returned package supersedes it and
 *  opens version + 1 of the same tier, so a return reason and an agreed split
 *  stay on disk. Every write locks the live package row first and is one
 *  transaction with its audit line.
 *
 *  The read is one door on `kpi.view`; E2 decides whether the caller also sees
 *  everyone's lines and the totals (`kpi.view-all`) — `comms.mapper.ts`'s cut. */
@Injectable()
export class KpiAllocationService {
  constructor(
    private readonly repo: KpiAllocationRepository,
    private readonly targets: KpiTargetsRepository,
    private readonly readings: KpiReadingsRepository,
    private readonly audit: AuditRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
    private readonly config: KpiConfigService,
    private readonly alerts: KpiAlertService,
    private readonly closes: KpiCloseRepository,
    private readonly teams: KpiTeamRepository,
  ) {}

  /** Without `kpi.view-all`: only packages handed down — or, while the next
   *  version is unsent, the one still in force (`lastAgreed`) — only the
   *  caller's lines, and no totals: a sum would give away others' shares. */
  async read(
    who: Actor,
    period: KpiPeriodKey,
    loaded?: Partial<KpiPeriodContext>,
  ): Promise<KpiAllocationResponse> {
    const all = this.access.allows(who, 'kpi.view-all')
    const [packages, inForce, monthClose] = await Promise.all([
      this.repo.packages(period),
      all ? [] : this.repo.lastAgreed(period),
      this.closes.of(period),
    ])
    const live = packages.filter((p) => p.status !== 'superseded')
    /* While a slot's next version is a draft or returned, its holder keeps
       reading the version their card is judged by — `superseded`, not new. */
    const unsent = new Set(live.filter((p) => !handedDown(p)).map(tierKey))
    const kept = new Set(inForce.filter((p) => unsent.has(tierKey(p))).map((p) => p.id))
    const shown = all ? live : packages.filter((p) => handedDown(p) || kept.has(p.id))
    return KpiAllocationResponse.parse({
      period,
      closed: monthClock(period).phase === 'closed',
      monthClose,
      allocations: await this.present(period, shown, all ? null : who.id, loaded),
    })
  }

  /** A team's live packages, whole: the answer of the team's own doors. The
   *  lead sees the lines and sums of their team's packages, and nothing else. */
  async teamResponse(period: KpiPeriodKey, teamId: string): Promise<KpiAllocationResponse> {
    return KpiAllocationResponse.parse({
      period,
      closed: monthClock(period).phase === 'closed',
      monthClose: await this.closes.of(period),
      allocations: await this.teamPackages(period, teamId),
    })
  }

  /** The live packages of one team. */
  async teamPackages(
    period: KpiPeriodKey,
    teamId: string,
    loaded?: KpiPeriodContext,
  ): Promise<KpiAllocation[]> {
    const packages = await this.repo.packages(period)
    const live = packages.filter((p) => p.teamId === teamId && p.status !== 'superseded')
    return this.present(period, live, null, loaded)
  }

  /** `only` null is the full view (every line, totals, shares): a reader with
   *  `kpi.view-all`, or a team's own lead reading their team's packages.
   *  `loaded` is what the caller has already read. Last month is read for the
   *  people on the lines (and a share's team members) and nobody else. */
  async present(
    period: KpiPeriodKey,
    shown: readonly KpiPackageRow[],
    only: string | null,
    loaded?: Partial<KpiPeriodContext>,
  ): Promise<KpiAllocation[]> {
    const today = vietnamToday()
    const ids = shown.map((p) => p.id)
    const [lines, roleTarget, inForce, ownShares, tier] = await Promise.all([
      this.repo.lines(ids),
      this.roleTargets(period, undefined, loaded?.targetRows),
      loaded?.shares ?? this.sharesInForce(period),
      this.repo.shares(ids),
      only === null ? (loaded?.tier ?? this.tierContext(period)) : null,
    ])
    const members = (teamId: string, role: RoleId) =>
      tier!.roster.membersOf(teamId).filter((m) => tier!.holders(role).has(m))
    const asked: Actors =
      only ??
      Array.from(
        new Set(
          shown.flatMap((p) => [
            ...lines.filter((l) => l.allocationId === p.id).map((l) => l.actorId),
            ...ownShares
              .filter((s) => s.allocationId === p.id)
              .flatMap((s) => members(s.teamId, p.role)),
          ]),
        ),
      )
    const lastMonth = await this.figures(
      spansOf(period).previous,
      shown.map((p) => p.role),
      asked,
      loaded?.catalog,
    )
    return shown.flatMap((p) => {
      const mine = lines.filter((l) => l.allocationId === p.id)
      const share = p.teamId ? shareValues(inForce, p.role, p.teamId) : null
      const target = share ? shareTargetOf(share) : roleTarget
      if (only !== null) {
        const own = mine.filter((l) => l.actorId === only)
        /* A member does not see the team's share: the lead's page does. */
        const seen = share ? () => null : target
        return own.length > 0 ? [toAllocation(p, own, [], seen, lastMonth, today)] : []
      }
      const shares = ownShares.filter((s) => s.allocationId === p.id)
      const totals = totalsOf(p.role, share ? mine : [...mine, ...shares], target)
      const changed =
        share && p.status !== 'draft'
          ? mismatchOf(p.role, teamAmounts(mine, share), target, 'team') !== null
          : false
      const shareLines = toShareLines(
        shares,
        p.role,
        (teamId) => members(teamId, p.role),
        roleTarget,
        lastMonth,
      )
      return [
        toAllocation(p, mine, totals, target, lastMonth, today, {
          shares: shareLines,
          shareChanged: changed,
        }),
      ]
    })
  }

  /** A draft is edited in place and its author becomes the caller; anything
   *  else live is superseded first and the caller authors version + 1. This
   *  door is `kpi.set-target` and so the room tier's: a team's package has its
   *  own door, whose permission is the lead's (ADR 0004). */
  async draft(
    who: Actor,
    period: KpiPeriodKey,
    body: KpiAllocationDraftBody,
  ): Promise<KpiAllocationResponse> {
    if (body.teamId)
      throw invalid({ teamId: ['Gói của nhóm do trưởng nhóm chia, không qua cửa này.'] })
    const tier = await this.saveDraft(who, period, body, null)
    return this.read(who, period, { tier })
  }

  async saveDraft(
    who: Actor,
    period: KpiPeriodKey,
    body: KpiAllocationDraftBody,
    teamId: string | null,
  ): Promise<KpiTier> {
    stillOpen(period)
    const { role } = body
    const [people, rosterRows] = await Promise.all([
      this.readings.people(),
      this.teams.rosterAt(period),
    ])
    const tier = tierOf(rosterRows, people)
    const { roster } = tier
    if (teamId) await this.assertActsFor(who, roster, teamId)
    const defs = await this.roleDefs(role)
    assertTargetValues(defs, body.lines, 'lines')
    assertTargetValues(defs, body.shares, 'shares')
    const names = new Map(people.map((p) => [p.id, p.name]))
    const input = {
      roster,
      holders: holdersOf(people, role),
      nameOf: (id: string) => names.get(id) ?? id,
      actorIds: body.lines.map((l) => l.actorId),
    }
    if (teamId) {
      const share = shareValues(await this.sharesInForce(period), role, teamId)
      if (share.size === 0) throw conflict('Nhóm chưa được giao phần chỉ tiêu của vai này.')
      const lineKeys = body.lines.map((l) => l.metricKey)
      throwFaults(teamFaults({ ...input, teamId, share, lineKeys }), 'draft')
    } else {
      throwFaults(roomFaults({ ...input, shares: body.shares, complete: false }), 'draft')
    }

    await this.repo.run(async (tx) => {
      const live = await this.repo.lockLive(tx, period, role, teamId)
      const rows = (id: string) =>
        body.lines.map((l) => ({ ...l, allocationId: id, value: String(l.value) }))
      let id: string
      if (live?.status === 'draft') {
        if (!(await this.repo.movePackage(tx, live, { submittedBy: who.id }))) throw stale()
        await this.keepCounteredLines(tx, live.id, body)
        await this.repo.saveDraftLines(tx, rows(live.id))
        id = live.id
      } else {
        if (live?.status === 'submitted') {
          throw conflict('Gói chỉ tiêu đang chờ duyệt nên chưa chia lại được.')
        }
        /* Superseding would strand an open counter on a version nobody reads. */
        if (live && (await this.repo.openCounters(tx, live.id)).length > 0) {
          throw conflict('Còn đề xuất chỉ tiêu chưa xử lý. Xử lý xong rồi chia lại.')
        }
        if (live && !(await this.repo.movePackage(tx, live, { status: 'superseded' }))) {
          throw stale()
        }
        const made = await this.repo.insertPackage(tx, {
          period,
          role,
          teamId,
          version: await this.repo.nextVersion(tx, period, role, teamId),
          status: 'draft',
          submittedBy: who.id,
        })
        if (!made) throw stale()
        await this.repo.insertLines(tx, rows(made))
        id = made
      }
      const shares = body.shares.map((s) => ({ ...s, value: String(s.value) }))
      if (!teamId) await this.repo.replaceShares(tx, id, shares)
      await this.note(tx, who, {
        kpi: 'allocation-drafted',
        period,
        role,
        team: teamId,
        lines: body.lines,
        shares: body.shares,
      })
    })
    return tier
  }

  /** Room door: `kpi.set-target`. A body naming a team is refused, as for `draft`. */
  async submit(
    who: Actor,
    period: KpiPeriodKey,
    body: KpiAllocationSubmitBody,
  ): Promise<KpiAllocationResponse> {
    if (body.teamId)
      throw invalid({ teamId: ['Gói của nhóm do trưởng nhóm gửi, không qua cửa này.'] })
    await this.send(who, period, body.role, body.ackDays, null)
    return this.read(who, period)
  }

  /** Only the draft's last author sends it: a second manager sending someone
   *  else's numbers would leave the author free to agree them. `ackDays` is
   *  the sender's, and starts counting once the package is agreed.
   *
   *  The roster lock comes first and the roster is read again under it: a team
   *  edit that landed since the draft must not slip a stale split through
   *  (ADR 0101, amendment A4). */
  async send(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    ackDays: number,
    teamId: string | null,
  ): Promise<void> {
    stillOpen(period)
    /* Read before the transaction: a second connection inside it would wait on it. */
    const people = await this.readings.people()
    if (teamId) await this.assertActsFor(who, rosterOf(await this.teams.rosterAt(period)), teamId)
    await this.repo.run(async (tx) => {
      await this.teams.lockRoster(tx)
      const live = await this.repo.lockLive(tx, period, role, teamId)
      if (teamId) {
        await this.assertActsFor(who, rosterOf(await this.teams.rosterAt(period, tx)), teamId, tx)
      }
      if (live?.status !== 'draft') {
        throw conflict('Vai này không có bản nháp chia chỉ tiêu để gửi.')
      }
      if (live.submittedBy !== who.id) {
        throw conflict('Bản nháp do người khác soạn sau cùng nên chỉ người đó gửi được.')
      }
      await this.assertSendable(tx, live, people)
      const sent = { status: 'submitted' as const, submittedAt: new Date(), ackDays }
      if (!(await this.repo.movePackage(tx, live, sent))) throw stale()
      await this.alerts.submitted(tx, who, live)
      await this.note(tx, who, {
        kpi: 'allocation-submitted',
        period,
        role,
        team: teamId,
        version: live.version,
        ackDays,
      })
    })
  }

  /** Four eyes, refused here with a sentence before the CHECK
   *  `kpi_allocation_decided_by_another` would answer with a bare 500. An
   *  agreement re-checks ADR 0098 §2: a line settled in place since the send
   *  may have moved the sum. One door for both tiers: `teamId` in the body
   *  picks the package, and the permission is `kpi.set-target` either way. */
  async decide(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    body: KpiAllocationDecideBody,
  ): Promise<KpiAllocationResponse> {
    stillOpen(period)
    const teamId = body.teamId ?? null
    await this.repo.run(async (tx) => {
      const live = await this.repo.lockLive(tx, period, role, teamId)
      if (live?.status !== 'submitted') {
        throw conflict('Vai này không có gói chỉ tiêu nào đang chờ duyệt.')
      }
      if (live.submittedBy === who.id) {
        throw conflict('Bạn là người đặt số sau cùng nên cần quản lý khác duyệt.')
      }
      if (body.decision === 'agree') await this.assertBalanced(tx, live)
      const decided = { decidedBy: who.id, decidedAt: new Date() }
      const set =
        body.decision === 'agree'
          ? { ...decided, status: 'agreed' as const }
          : { ...decided, status: 'returned' as const, returnReason: body.reason }
      if (!(await this.repo.movePackage(tx, live, set))) throw stale()
      if (body.decision === 'return') await this.alerts.returned(tx, who, live, body.reason)
      if (body.decision === 'agree' && !teamId) await this.tellTeams(tx, who, live)
      await this.note(tx, who, {
        kpi: body.decision === 'agree' ? 'allocation-agreed' : 'allocation-returned',
        period,
        role,
        team: teamId,
        version: live.version,
      })
    })
    return this.read(who, period)
  }

  /** Each team with a share in the agreed room package hears it from its lead's bell. */
  private async tellTeams(tx: Db, who: Actor, pkg: KpiAllocationRowDb): Promise<void> {
    const shares = await this.repo.shares([pkg.id], tx)
    const roster = rosterOf(await this.teams.rosterAt(pkg.period, tx))
    const told = new Map(shares.map((s) => [s.teamId, s.teamName]))
    const leads = [...told].flatMap(([id, name]) => {
      const leadId = roster.leadOf(id)
      return leadId ? [{ id, name, leadId }] : []
    })
    await this.alerts.shareAssigned(tx, who, pkg, leads)
  }

  /** The shares of every room package in force, with the role each belongs to. */
  async sharesInForce(period: KpiPeriodKey, handle?: Db): Promise<ShareInForce[]> {
    const rooms = (await this.repo.lastAgreed(period, handle)).filter((p) => p.teamId === null)
    const role = new Map(rooms.map((p) => [p.id, p.role]))
    const rows = await this.repo.shares(
      rooms.map((p) => p.id),
      handle,
    )
    return rows.map((r) => ({ ...r, role: role.get(r.allocationId)! }))
  }

  async tierContext(period: KpiPeriodKey): Promise<KpiTier> {
    const [entries, people] = await Promise.all([
      this.teams.rosterAt(period),
      this.readings.people(),
    ])
    return tierOf(entries, people)
  }

  /** Everything the team page's readers share, read in one round. */
  async periodContext(period: KpiPeriodKey): Promise<KpiPeriodContext> {
    const [tier, catalog, targetRows, shares, tolerance, monthClose] = await Promise.all([
      this.tierContext(period),
      this.config.effectiveCatalog(),
      this.targets.ofPeriod(period),
      this.sharesInForce(period),
      this.config.tolerance(),
      this.closes.of(period),
    ])
    return { tier, catalog, targetRows, shares, tolerance, monthClose }
  }

  /** The team's lead, judged by the roster of the month and not by a
   *  permission (amendment A1) — or, while that lead is locked out, a
   *  `kpi.set-target` holder, so the team is not stranded (ADR 0101 default). */
  async actsFor(who: Actor, roster: Roster, teamId: string, handle?: Db): Promise<boolean> {
    const lead = roster.leadOf(teamId)
    if (lead === who.id) return true
    return (
      lead !== null &&
      this.access.allows(who, 'kpi.set-target') &&
      (await this.teams.disabledAmong([lead], handle)).has(lead)
    )
  }

  async assertActsFor(who: Actor, roster: Roster, teamId: string, handle?: Db): Promise<void> {
    if (!(await this.actsFor(who, roster, teamId, handle))) throw notLead()
  }

  /** Each role's highest agreed target, by `slotsOf`'s own reading. Not cut to
   *  the effective catalog: an old package of a switched-off metric still
   *  balances against the target it was split from. */
  async roleTargets(
    period: KpiPeriodKey,
    handle?: Db,
    rows?: readonly KpiTargetRow[],
  ): Promise<RoleTargetOf> {
    const slots = slotsOf(rows ?? (await this.targets.ofPeriod(period, handle)))
    return (role, key) => {
      const agreed = agreedIn(slots, role, key)
      return agreed ? Number(agreed.value) : null
    }
  }

  /** The metrics `role` takes new targets on — the effective catalog's. */
  async roleDefs(role: RoleId, handle?: Db) {
    return (await this.config.effectiveCatalog(handle))[role]
  }

  /** One month's figures for `roles`, read the way a scorecard reads them
   *  (`toReadings`), so "absent tally = 0, snapshot as of the month's end" is not copied.
   *  Ask `only` for every actor the lookup will be called with: one left out reads as 0. */
  async figures(
    span: PeriodSpan,
    roles: readonly RoleId[],
    only?: Actors,
    loaded?: KpiCatalog,
    known?: KpiKnown,
  ): Promise<FigureOf> {
    const wanted = [...new Set(roles)]
    const catalog = loaded ?? (await this.config.effectiveCatalog())
    const seats = wanted.flatMap((role) => catalog[role].map((def) => ({ role, def })))
    const values = await this.readings.monthValues(seats, span, only, known)
    /* Only `.value` is read, so the verdict's tolerance is moot. The real
       clock, so a month not begun keeps `toReadings`' no-data snapshot. */
    const { elapsed, phase } = monthClock(span.key)
    const ctx = {
      catalog,
      values,
      slots: new Map(),
      elapsed,
      running: phase === 'running',
      tolerance: 0,
    }
    return (role, actorId, key) =>
      toReadings(role, actorId, ctx).find((r) => r.key === key)?.value ?? null
  }

  /** Same transaction as the rows, `KpiService.note`'s reason. */
  note(tx: Db, who: Actor, payload: object): Promise<void> {
    return this.audit.write({ actorId: who.id, action: 'edit', note: JSON.stringify(payload) }, tx)
  }

  /** The roster and the stored lines, judged again under the roster lock, then
   *  the balance: what the draft check saw may no longer be true. */
  private async assertSendable(
    tx: Db,
    pkg: KpiAllocationRowDb,
    people: Parameters<typeof holdersOf>[0],
  ): Promise<void> {
    const roster = rosterOf(await this.teams.rosterAt(pkg.period, tx))
    const holders = (role: RoleId) => holdersOf(people, role)
    const lines = await this.repo.lines([pkg.id], tx)
    const shares = await this.repo.shares([pkg.id], tx)
    const names = new Map([
      ...people.map((p) => [p.id, p.name] as const),
      ...lines.map((l) => [l.actorId, l.name] as const),
    ])
    const input = {
      roster,
      holders: holders(pkg.role),
      nameOf: (id: string) => names.get(id) ?? id,
      actorIds: lines.map((l) => l.actorId),
    }
    if (!pkg.teamId) {
      const target = await this.roleTargets(pkg.period, tx)
      const defs = await this.roleDefs(pkg.role, tx)
      const required = defs.map((d) => d.key).filter((key) => target(pkg.role, key) !== null)
      throwFaults(roomFaults({ ...input, shares, complete: true, required }), 'send')
    } else {
      const share = shareValues(await this.sharesInForce(pkg.period, tx), pkg.role, pkg.teamId)
      const lineKeys = lines.map((l) => l.metricKey)
      const faults = teamFaults({ ...input, teamId: pkg.teamId, share, lineKeys })
      const team = { teamId: pkg.teamId, role: pkg.role, lines, share }
      const gaps = missingSharedLines({ ...input, ...team })
      throwFaults({ ...faults, lines: [...faults.lines, ...gaps] }, 'send')
    }
    await this.assertBalanced(tx, pkg)
  }

  /** ADR 0098 §2 on the package's lines as they stand under the lock. On a
   *  team package the target is the team's share in the room package in force. */
  private async assertBalanced(tx: Db, pkg: KpiAllocationRowDb): Promise<void> {
    const lines = await this.repo.lines([pkg.id], tx)
    if (pkg.teamId) {
      const share = shareValues(await this.sharesInForce(pkg.period, tx), pkg.role, pkg.teamId)
      if (share.size === 0) throw conflict('Nhóm chưa được giao phần chỉ tiêu của vai này.')
      const fault = mismatchOf(pkg.role, teamAmounts(lines, share), shareTargetOf(share), 'team')
      if (fault) throw conflict(fault)
      return
    }
    const shares = await this.repo.shares([pkg.id], tx)
    const fault = mismatchOf(
      pkg.role,
      [...lines, ...shares],
      await this.roleTargets(pkg.period, tx),
    )
    if (fault) throw conflict(fault)
  }

  /** A line some counter points at cannot leave the draft: the counter's FK
   *  holds it, and so does the holder's open question. */
  private async keepCounteredLines(tx: Db, id: string, body: KpiAllocationDraftBody) {
    const wanted = new Set(body.lines.map((l) => `${l.actorId}|${l.metricKey}`))
    const gone = (await this.repo.lines([id], tx)).filter(
      (l) => !wanted.has(`${l.actorId}|${l.metricKey}`),
    )
    const held = new Set(
      (await this.repo.counterKeys(tx, id)).map((k) => `${k.actorId}|${k.metricKey}`),
    )
    const stuck = gone.filter((l) => held.has(`${l.actorId}|${l.metricKey}`))
    if (stuck.length > 0) {
      throw conflict(`Dòng đã có đề xuất nên không bỏ được: ${stuck.map(lineName).join(', ')}.`)
    }
    await this.repo.deleteLines(tx, gone)
  }
}

const lineName = (l: KpiLineRow): string => `${l.name} – ${KPI_METRIC_LABEL[l.metricKey]}`
