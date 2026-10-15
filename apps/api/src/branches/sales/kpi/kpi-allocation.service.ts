import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  KPI_METRIC_LABEL,
  KpiAllocationResponse,
  type KpiAllocationDecideBody,
  type KpiAllocationDraftBody,
  type KpiPeriodKey,
  type RoleId,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, invalid } from '@api/platform/http/problem'
import { spansOf, type PeriodSpan } from '../performance/performance-period'
import { KpiAlertService } from './kpi-alert.service'
import { KpiAllocationRepository, type KpiLineRow } from './kpi-allocation.repository'
import type { KpiAllocationRowDb } from './kpi-allocation.schema'
import {
  mismatchOf,
  toAllocation,
  totalsOf,
  type FigureOf,
  type RoleTargetOf,
} from './kpi-allocation.mapper'
import { KpiConfigService } from './kpi-config.service'
import { KpiReadingsRepository } from './kpi-readings.repository'
import { assertTargetValues, monthClock, stillOpen } from './kpi-rules'
import { KpiTargetsRepository } from './kpi-targets.repository'
import { agreedIn, slotsOf, toReadings } from './kpi.mapper'

export const stale = () =>
  conflict('Gói chỉ tiêu vừa được người khác thay đổi. Tải lại rồi làm lại.')

/** A package its holders have been handed: they read it, confirm it, counter it. */
export const handedDown = (p: Pick<KpiAllocationRowDb, 'status'>): boolean =>
  p.status === 'submitted' || p.status === 'agreed'

/** A role's monthly package: drafted by one manager and sent by that same
 *  author, agreed or returned by another (ADR 0098 §1, 0082 §5). Whoever set
 *  the numbers last is the package's `submittedBy`, so they never agree them.
 *
 *  Re-splitting an agreed or a returned package supersedes it and opens
 *  version + 1, so a return reason and an agreed split stay on disk. Every
 *  write locks the live package row first and is one transaction with its
 *  audit line.
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
  ) {}

  /** Without `kpi.view-all`: only packages handed down — or, while the next
   *  version is unsent, the one still in force (`lastAgreed`) — only the
   *  caller's lines, and no totals: a sum would give away others' shares. */
  async read(who: Actor, period: KpiPeriodKey): Promise<KpiAllocationResponse> {
    const all = this.access.allows(who, 'kpi.view-all')
    const [packages, inForce] = await Promise.all([
      this.repo.packages(period),
      all ? [] : this.repo.lastAgreed(period),
    ])
    const live = packages.filter((p) => p.status !== 'superseded')
    /* While a role's next version is a draft or returned, its holder keeps
       reading the version their card is judged by — `superseded`, not new. */
    const unsent = new Set(live.filter((p) => !handedDown(p)).map((p) => p.role))
    const kept = new Set(inForce.filter((p) => unsent.has(p.role)).map((p) => p.id))
    const shown = all ? live : packages.filter((p) => handedDown(p) || kept.has(p.id))
    const only = all ? undefined : who.id
    const [lines, roleTarget, lastMonth] = await Promise.all([
      this.repo.lines(shown.map((p) => p.id)),
      this.roleTargets(period),
      this.figures(
        spansOf(period).previous,
        shown.map((p) => p.role),
        only,
      ),
    ])
    const allocations = shown.flatMap((p) => {
      const mine = lines.filter((l) => l.allocationId === p.id)
      if (!all) {
        const own = mine.filter((l) => l.actorId === who.id)
        return own.length > 0 ? [toAllocation(p, own, [], roleTarget, lastMonth)] : []
      }
      return [toAllocation(p, mine, totalsOf(p.role, mine, roleTarget), roleTarget, lastMonth)]
    })
    return KpiAllocationResponse.parse({
      period,
      closed: monthClock(period).phase === 'closed',
      allocations,
    })
  }

  /** A draft is edited in place and its author becomes the caller; anything
   *  else live is superseded first and the caller authors version + 1. */
  async draft(
    who: Actor,
    period: KpiPeriodKey,
    body: KpiAllocationDraftBody,
  ): Promise<KpiAllocationResponse> {
    stillOpen(period)
    const { role } = body
    assertTargetValues(await this.roleDefs(role), body.lines, 'lines')
    const holders = new Set(
      (await this.readings.people())
        .filter((p) => p.roleIds.map(toContractRole).includes(role))
        .map((p) => p.id),
    )
    const strangers = new Set(
      body.lines.filter((l) => !holders.has(l.actorId)).map((l) => l.actorId),
    )
    if (strangers.size > 0) {
      throw invalid({ lines: [`${strangers.size} người được giao không giữ vai này.`] })
    }

    await this.repo.run(async (tx) => {
      const live = await this.repo.lockLive(tx, period, role)
      const rows = (id: string) =>
        body.lines.map((l) => ({ ...l, allocationId: id, value: String(l.value) }))
      if (live?.status === 'draft') {
        if (!(await this.repo.movePackage(tx, live, { submittedBy: who.id }))) throw stale()
        await this.keepCounteredLines(tx, live.id, body)
        await this.repo.saveDraftLines(tx, rows(live.id))
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
        const version = await this.repo.nextVersion(tx, period, role)
        const id = await this.repo.insertPackage(tx, {
          period,
          role,
          version,
          status: 'draft',
          submittedBy: who.id,
        })
        if (!id) throw stale()
        await this.repo.insertLines(tx, rows(id))
      }
      await this.note(tx, who, { kpi: 'allocation-drafted', period, role, lines: body.lines })
    })
    return this.read(who, period)
  }

  /** Only the draft's last author sends it: a second manager sending someone
   *  else's numbers would leave the author free to agree them. */
  async submit(who: Actor, period: KpiPeriodKey, role: RoleId): Promise<KpiAllocationResponse> {
    stillOpen(period)
    await this.repo.run(async (tx) => {
      const live = await this.repo.lockLive(tx, period, role)
      if (live?.status !== 'draft') {
        throw conflict('Vai này không có bản nháp chia chỉ tiêu để gửi.')
      }
      if (live.submittedBy !== who.id) {
        throw conflict('Bản nháp do người khác soạn sau cùng nên chỉ người đó gửi được.')
      }
      await this.assertBalanced(tx, live)
      if (
        !(await this.repo.movePackage(tx, live, { status: 'submitted', submittedAt: new Date() }))
      ) {
        throw stale()
      }
      await this.alerts.submitted(tx, who, live)
      await this.note(tx, who, { kpi: 'allocation-submitted', period, role, version: live.version })
    })
    return this.read(who, period)
  }

  /** Four eyes, refused here with a sentence before the CHECK
   *  `kpi_allocation_decided_by_another` would answer with a bare 500. An
   *  agreement re-checks ADR 0098 §2: a line settled in place since the send
   *  may have moved the sum. */
  async decide(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    body: KpiAllocationDecideBody,
  ): Promise<KpiAllocationResponse> {
    stillOpen(period)
    await this.repo.run(async (tx) => {
      const live = await this.repo.lockLive(tx, period, role)
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
      await this.note(tx, who, {
        kpi: body.decision === 'agree' ? 'allocation-agreed' : 'allocation-returned',
        period,
        role,
        version: live.version,
      })
    })
    return this.read(who, period)
  }

  /** Each role's highest agreed target, by `slotsOf`'s own reading. Not cut to
   *  the effective catalog: an old package of a switched-off metric still
   *  balances against the target it was split from. */
  async roleTargets(period: KpiPeriodKey, handle?: Db): Promise<RoleTargetOf> {
    const slots = slotsOf(await this.targets.ofPeriod(period, handle))
    return (role, key) => {
      const agreed = agreedIn(slots, role, key)
      return agreed ? Number(agreed.value) : null
    }
  }

  /** The metrics `role` takes new targets on — the effective catalog's. */
  async roleDefs(role: RoleId) {
    return (await this.config.effectiveCatalog())[role]
  }

  /** One month's figures for `roles`, read the way a scorecard reads them
   *  (`toReadings`), so "absent tally = 0, snapshot only today" is not copied. */
  async figures(span: PeriodSpan, roles: readonly RoleId[], only?: string): Promise<FigureOf> {
    const wanted = [...new Set(roles)]
    const catalog = await this.config.effectiveCatalog()
    const seats = wanted.flatMap((role) => catalog[role].map((def) => ({ role, def })))
    const values = await this.readings.values(seats, span, only)
    const ctx = {
      catalog,
      values,
      slots: new Map(),
      elapsed: 1,
      running: monthClock(span.key).phase === 'running',
    }
    return (role, actorId, key) =>
      toReadings(role, actorId, ctx).find((r) => r.key === key)?.value ?? null
  }

  /** Same transaction as the rows, `KpiService.note`'s reason. */
  note(tx: Db, who: Actor, payload: object): Promise<void> {
    return this.audit.write({ actorId: who.id, action: 'edit', note: JSON.stringify(payload) }, tx)
  }

  /** ADR 0098 §2 on the package's lines as they stand under the lock. */
  private async assertBalanced(tx: Db, pkg: KpiAllocationRowDb): Promise<void> {
    const lines = await this.repo.lines([pkg.id], tx)
    const fault = mismatchOf(pkg.role, lines, await this.roleTargets(pkg.period, tx))
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
