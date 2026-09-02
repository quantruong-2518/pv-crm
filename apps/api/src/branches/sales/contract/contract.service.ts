import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  ContractBookResponse,
  ContractDetailResponse,
  type MaHopDong,
  type PageQuery,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, notFound } from '@api/platform/http/problem'
import { toBookRow, toDetail, toRef } from './contract.mapper'
import { ContractRepository } from './contract.repository'

/** The contract book — read only, and the only place that holds both the
 *  repository and an engine.
 *
 *  Three layers, the boundary the other two books drew: the repository is
 *  async, the engine is sync, and this is the one file that joins them. The
 *  engine is always handed data ALREADY LOADED, which is the condition for E2
 *  running unchanged in the browser and on the server. */
@Injectable()
export class ContractService {
  constructor(
    private readonly repo: ContractRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async book(who: Actor, q: PageQuery): Promise<ContractBookResponse> {
    const page = await this.repo.book(who, q, true)

    /* Second net. SQL already cut by scope, so normally E2 cuts nothing more —
       and that is the point: two fences reading ONE axis, the inner one only
       has work when the outer one was written wrong. Drop it and the day
       somebody adds a door without `scoped: true` there is nothing left. The
       two ask the same question here, because the owner name on the ref comes
       from the very row whose `owner_id` the predicate matched. */
    const items = page.rows.map((r) => ({
      ...r,
      ref: toRef(r.row, { label: r.customer, ownerName: r.ownerName }),
    }))
    const { visible, hidden } = this.access.visible(who, items)

    /* Check what we are about to send against the contract itself. A column
       that changed type, a field the mapper forgot — neither trips `tsc` if
       the mapper drifted along with it, both trip here. Bounded by `size`. */
    return ContractBookResponse.parse({
      rows: visible.map(toBookRow),
      total: page.total,
      hidden: page.hidden + hidden,
    })
  }

  /** One contract. Two ways to fail, and they do not merge.
   *
   *  404 is "no such contract", 403 is "not your contract" — two different
   *  next steps for whoever is reading the screen, so the server has to tell
   *  them apart. The book answers someone out of scope by dropping rows and
   *  reporting `hidden`; a profile has exactly one row, so there is nothing to
   *  drop. */
  async profile(who: Actor, code: MaHopDong): Promise<ContractDetailResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found) throw notFound('hợp đồng', code)
    if (!found.inScope) throw denied('out-of-scope')

    return ContractDetailResponse.parse(toDetail(found))
  }
}
