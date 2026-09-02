import { Controller, Get, Param, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { MaHopDong, PageQuery } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { ContractService } from './contract.service'

/** `/sales/contracts` — the contract book, READ ONLY.
 *
 *  Thin on purpose, like its two siblings: take, validate, call, return. No
 *  business `if`, no SQL, nothing worth reading outside the declarations.
 *
 *  ------------------------------------------------------------------
 *  ONE PERMISSION, AND THIS IS THE FIRST ROUTE TO ASK FOR IT
 *  ------------------------------------------------------------------
 *  Both doors ask the view-contract permission with `scoped: true`. Until the
 *  contract kind gained a permission domain in E2, every question about a
 *  contract was waved through; these are the routes that domain was added for.
 *
 *  Signing still does NOT live here. A contract is created at
 *  `POST /sales/opportunities/:code/contract`, because signing is an action on
 *  a deal and the composite foreign key anchors a contract to exactly one
 *  (deal, lead) pair. Reading is the other way round: the book is a resource of
 *  its own, with its own root, which is what the sign door's docblock said
 *  would happen the day a contract screen existed.
 *
 *  ------------------------------------------------------------------
 *  NO FILTER QUERY, ON PURPOSE
 *  ------------------------------------------------------------------
 *  The book takes plain `PageQuery` and nothing else. No screen has asked for
 *  a filter yet, and a parameter with no column behind it is a shape the
 *  clients will start relying on before it means anything. */
@Controller('sales/contracts')
export class ContractController {
  constructor(private readonly contracts: ContractService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'hợp-đồng.xem', scoped: true })
  book(@CurrentActor() who: Actor, @Query(zod(PageQuery)) q: PageQuery) {
    return this.contracts.book(who, q)
  }

  /** One contract, fully nested.
   *
   *  `MaHopDong` rather than `MaObject` is the first fence, and it is not
   *  interchangeable: a contract code carries a letter outside `A-Z`, so the
   *  generic object-code primitive rejects it. The second fence — does it
   *  exist, is it yours — belongs to the service, which needs the row to
   *  answer. */
  @Get(':code')
  @Need({ branch: 'Sales', permission: 'hợp-đồng.xem', scoped: true })
  profile(@CurrentActor() who: Actor, @Param('code', zod(MaHopDong)) code: MaHopDong) {
    return this.contracts.profile(who, code)
  }
}
