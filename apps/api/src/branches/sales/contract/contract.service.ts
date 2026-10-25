import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor, ObjectRef } from '@pv/engines'
import {
  ContractBookResponse,
  ContractCollectorCandidates,
  ContractDetailResponse,
  ContractSummary,
  type ContractBookQuery,
  type ContractCode,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, notFound } from '@api/platform/http/problem'
import { toBookRow, toDetail, toRef } from './contract.mapper'
import { ContractCollectors } from './contract-collector.service'
import { ContractRepository, type ContractBookRead } from './contract.repository'
import {
  mayChangeCollector,
  mayEditPenalty,
  mayRecordPayment,
  mayWriteContract,
} from './contract-writer'

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
    private readonly collectors: ContractCollectors,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async book(who: Actor, q: ContractBookQuery): Promise<ContractBookResponse> {
    const page = await this.repo.book(who, q, true)

    /* Second net over the SQL one: it only has work when a door forgot
       `scoped: true`. `bookRef` makes both nets ask the same question. */
    const items = page.rows.map((r) => ({ ...r, ref: bookRef(who, r) }))
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

  /** The book folded to one row of numbers — `GET /sales/contracts/summary`.
   *
   *  Takes no `Actor` and cuts nothing: sums over EVERY contract, so the tile
   *  does not shrink when somebody turns to page 2. The door still demands the
   *  book's own permission. */
  async summary(): Promise<ContractSummary> {
    return ContractSummary.parse(await this.repo.summary())
  }

  /** The picker of who collects the money, for the sign form and the change
   *  drawer: either permission opens it, the controller asked only the floor. */
  async collectorCandidates(who: Actor): Promise<ContractCollectorCandidates> {
    if (
      !this.access.allows(who, 'opportunity.close') &&
      !this.access.allows(who, 'contract.edit')
    ) {
      throw denied('permission-denied', 'Bạn không có quyền xem danh sách người thu tiền.')
    }
    return ContractCollectorCandidates.parse(await this.collectors.candidates())
  }

  /** One contract. Two ways to fail, and they answer with the SAME 404.
   *
   *  Not because the difference does not matter — E2 keeps the two axes apart
   *  precisely because they need different next steps — but because a door
   *  addressed BY CODE cannot say them apart without leaking. Answer 403 for a
   *  colleague's contract and 404 for a code that never existed, and anyone
   *  holding a session can walk the code space and read off which customers
   *  the company has. The scope axis is worth less than the customer list.
   *
   *  Aggregate scope is still disclosed, and deliberately: the book reports
   *  `hidden`, so a reader learns HOW MANY rows are out of reach and can ask
   *  for the owner to hand one over. What they never learn is WHICH codes.
   *  That split — counts yes, codes no — is the whole policy.
   *
   *  This diverges from the sibling opportunity door on purpose; the screen
   *  copy in `apps/web/src/data/contracts.ts` already collapses both to null
   *  and says out loud that the merge is intentional. Two answers to one
   *  question was the bug. */
  async profile(who: Actor, code: ContractCode): Promise<ContractDetailResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found || !found.inScope) throw notFound('hợp đồng', code)

    return ContractDetailResponse.parse({
      ...toDetail(found),
      canEdit: mayWriteContract(who, found.row.ownerId),
      canCollect: mayRecordPayment(
        this.access,
        who,
        found.row.collectorId,
        found.termination !== null,
      ),
      canChangeCollector: mayChangeCollector(this.access, who, found.termination !== null),
      canEditPenalty: mayEditPenalty(
        this.access,
        who,
        found.row.ownerId,
        found.termination !== null,
      ),
    })
  }
}

/** The book row's ref for E2's second grid. The SQL fence (`scopeOf`) lets in
 *  the closer OR the payment PIC; the ref names one owner, so a PIC reading
 *  their own collection is named as owner — the move `runRef` makes for a run —
 *  or axis 3 hides a row the SQL already let through. */
function bookRef(who: Actor, r: ContractBookRead): ObjectRef {
  const owner =
    r.row.collectorId === who.id
      ? { id: who.id, name: who.name }
      : r.row.ownerId && r.ownerName
        ? { id: r.row.ownerId, name: r.ownerName }
        : null
  return toRef(r.row, { label: r.customer, owner })
}
