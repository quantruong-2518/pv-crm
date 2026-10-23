import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor, Permission } from '@pv/engines'
import { STOP_LOG_KINDS, StopLogResponse, type StopLogKind, type StopLogQuery } from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { toFacet, toRow, toStageFacets } from './stop-log.mapper'
import { StopLogRepository } from './stop-log.repository'

/** The view each kind needs on top of the route's `lead.view` (ADR 0125 D3). */
const VIEW: Record<StopLogKind, Permission> = {
  lead: 'lead.view',
  deal: 'opportunity.view',
  contract: 'contract.view',
}

/** The stop log. A kind the caller may not view is left out of the SQL rather
 *  than cut afterwards, so the total and the facets never count it; an
 *  `ownOnly` caller reads only the stops they made themselves. */
@Injectable()
export class StopLogService {
  constructor(
    private readonly repo: StopLogRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async page(who: Actor, q: StopLogQuery): Promise<StopLogResponse> {
    const asked = q.kind === 'all' ? STOP_LOG_KINDS : [q.kind]
    const kinds = asked.filter((k) => this.access.allows(who, VIEW[k]))
    const empty = { total: 0, rows: [], byReason: [], byStage: [], byActor: [] }
    const read = kinds.length
      ? await this.repo.page(q, { kinds, onlyActorId: who.ownOnly ? who.id : null })
      : empty
    return StopLogResponse.parse({
      rows: read.rows.map(toRow),
      total: read.total,
      page: q.page,
      size: q.size,
      byReason: read.byReason.map(toFacet),
      byStage: toStageFacets(read.byStage),
      byActor: read.byActor.map(toFacet),
    })
  }
}
