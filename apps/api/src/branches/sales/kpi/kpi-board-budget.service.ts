import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  isKpiV2Period,
  KpiMarketingBudgetResponse,
  type KpiMarketingBudgetBody,
  type KpiPeriodKey,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, notFound } from '@api/platform/http/problem'
import { membersUnder } from '@api/platform/org/org-heads'
import { spansOf } from '../performance/performance-period'
import { holdersUnder } from './kpi-assignment.mapper'
import { KpiBoardRepository } from './kpi-board.repository'
import { readsInTree } from './kpi-person-access'
import { monthEnded, vietnamToday } from './kpi-rules'
import { KpiSeatService } from './kpi-seat.service'
import { KpiTeamRepository, type KpiOrgTree } from './kpi-team.repository'

/** Why this month or unit takes no budget; `null` when it does. */
function refusalOf(period: KpiPeriodKey, tree: KpiOrgTree, unitId: string): string | null {
  if (!isKpiV2Period(period)) return 'Ngân sách Marketing chỉ đặt được từ tháng 01/2027.'
  if (monthEnded(period, vietnamToday())) return 'Tháng này đã qua, không đặt ngân sách được nữa.'
  if (holdersUnder(tree, 'marketing', unitId).length === 0)
    return 'Đơn vị này không có ai làm Marketing.'
  return null
}

/** Marketing budget of a unit and month (ADR 0160 §8): shown beside the spend, never scored.
 *
 *  The unit's head, whoever stands in for the head, or a head above it sets it —
 *  `readsInTree`, the same seat rule the unit's other reads use — for a v2 month not
 *  yet over, on a unit with someone in Marketing. `canEdit` answers the same checks. */
@Injectable()
export class KpiBudgetService {
  constructor(
    private readonly repo: KpiBoardRepository,
    private readonly teams: KpiTeamRepository,
    private readonly seats: KpiSeatService,
    private readonly audit: AuditRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  /** A reader of the unit: a `kpi.view-all` holder or a seat on its chain. */
  async of(who: Actor, period: KpiPeriodKey, unitId: string): Promise<KpiMarketingBudgetResponse> {
    const tree = await this.treeOf(period, unitId)
    const editor = await readsInTree(this.seats, tree, who, unitId)
    if (!editor && !this.access.allows(who, 'kpi.view-all'))
      throw denied('permission-denied', 'Bạn không phụ trách đơn vị này.')
    return this.read(period, tree, unitId, editor && refusalOf(period, tree, unitId) === null)
  }

  /** `canEdit` for a reader the caller already vetted: the seat and the month and unit rules. */
  async editable(who: Actor, period: KpiPeriodKey, tree: KpiOrgTree, unitId: string) {
    return (
      refusalOf(period, tree, unitId) === null && (await readsInTree(this.seats, tree, who, unitId))
    )
  }

  async set(
    who: Actor,
    period: KpiPeriodKey,
    unitId: string,
    body: KpiMarketingBudgetBody,
  ): Promise<KpiMarketingBudgetResponse> {
    const tree = await this.treeOf(period, unitId)
    if (!(await readsInTree(this.seats, tree, who, unitId)))
      throw denied(
        'permission-denied',
        'Chỉ người phụ trách đơn vị hoặc cấp trên mới đặt ngân sách.',
      )
    const refusal = refusalOf(period, tree, unitId)
    if (refusal) throw conflict(refusal)
    await this.repo.run(async (tx) => {
      await this.repo.saveBudget(tx, unitId, period, body.amount, who.id)
      await this.audit.write(
        {
          actorId: who.id,
          action: 'edit',
          note: JSON.stringify({
            kind: 'kpi-marketing-budget',
            period,
            unitId,
            amount: body.amount,
          }),
        },
        tx,
      )
    })
    return this.read(period, tree, unitId, true)
  }

  /** The unit's budget for a reader the caller already vetted (the person's own board). */
  async read(
    period: KpiPeriodKey,
    tree: KpiOrgTree,
    unitId: string,
    canEdit: boolean,
  ): Promise<KpiMarketingBudgetResponse> {
    const [row, spent] = await Promise.all([
      this.repo.budgetOf(unitId, period),
      this.repo.spentBy(spansOf(period).current, membersUnder(tree, unitId)),
    ])
    return KpiMarketingBudgetResponse.parse({
      period,
      unitId,
      amount: row?.amount ?? null,
      spent: Math.round(spent),
      setBy: row ? { actorId: row.setBy, name: row.setByName } : null,
      setAt: row?.setAt.toISOString() ?? null,
      canEdit,
    })
  }

  private async treeOf(period: KpiPeriodKey, unitId: string): Promise<KpiOrgTree> {
    const tree = await this.teams.orgTreeAt(period)
    if (!tree) throw notFound('sơ đồ phòng ban của tháng này')
    if (!tree.nodes.some((n) => n.unitId === unitId)) throw notFound('đơn vị')
    return tree
  }
}
