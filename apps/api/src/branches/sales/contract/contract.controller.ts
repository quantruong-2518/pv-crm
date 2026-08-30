import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { ContractBookQuery, ContractTermDraft, ContractTermPatch, MaHopDong } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { ContractService } from './contract.service'

/** `/sales/contracts` — the contract book, module 4 of the Sales branch.
 *
 *  ------------------------------------------------------------------
 *  A TOP-LEVEL RESOURCE NOW, WHILE SIGNING STAYS UNDER THE DEAL
 *  ------------------------------------------------------------------
 *  `OpportunityController` put signing at `POST /sales/opportunities/:code/contract`
 *  and wrote down why: a contract does not exist independently — its composite
 *  key anchors it to exactly one (deal, lead) pair, and the path says so. That
 *  docblock also named the day this file arrives: "the day there is a screen
 *  reading a book of contracts, `GET /sales/contracts` is a different resource,
 *  with a root of its own". This is that day, and the split holds — signing is
 *  an act on a deal, reading the book is not.
 *
 *  ------------------------------------------------------------------
 *  `MaHopDong` ON THE PATH, NOT `MaObject`
 *  ------------------------------------------------------------------
 *  `MaObject` is `^[A-Z]{1,3}-\d{3,6}$`, and the contract prefix carries a
 *  letter that is not in `A-Z` — so a contract code fails that primitive. The
 *  docblock on `MaHopDong` has recorded that consequence since the primitive was
 *  split out, noting that nothing took a contract code on a path yet. These
 *  three routes are the first, and they use the primitive that actually matches:
 *  validating them with `MaObject` would 400 at the pipe with a message about
 *  object codes, which is correct and unreadable.
 *
 *  ------------------------------------------------------------------
 *  TWO PERMISSIONS, AND READING IS NOT THE SAME AS PLANNING COLLECTION
 *  ------------------------------------------------------------------
 *  Reading the book asks for the contract-view permission, both write doors on
 *  the payment plan ask for the contract-edit one — both new in this module,
 *  both `scoped: true`. The split is the one this branch already draws
 *  everywhere: seeing the signed value of a deal you stand on is one thing,
 *  writing the schedule the company will chase money by is another. Neither
 *  belongs to presales, who hold no contract permission at all. */
@Controller('sales/contracts')
export class ContractController {
  constructor(private readonly contracts: ContractService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'hợp-đồng.xem', scoped: true })
  book(@CurrentActor() who: Actor, @Query(zod(ContractBookQuery)) q: ContractBookQuery) {
    return this.contracts.book(who, q)
  }

  /** One contract with its instalments.
   *
   *  Declared AFTER `@Get()` and with no fixed-string route beside it, so the
   *  ordering trap `OpportunityController` records — Fastify matching in
   *  declaration order, a literal path swallowed by `:code` — has nothing to
   *  catch here yet. The day this book grows a `scorecard`, that route goes
   *  ABOVE this line. */
  @Get(':code')
  @Need({ branch: 'Sales', permission: 'hợp-đồng.xem', scoped: true })
  profile(@CurrentActor() who: Actor, @Param('code', zod(MaHopDong)) code: MaHopDong) {
    return this.contracts.profile(who, code)
  }

  /** Add one instalment to the plan. */
  @Post(':code/terms')
  @Need({ branch: 'Sales', permission: 'hợp-đồng.sửa', scoped: true })
  addTerm(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaHopDong)) code: MaHopDong,
    @Body(zod(ContractTermDraft)) body: ContractTermDraft,
  ) {
    return this.contracts.addTerm(who, code, body)
  }

  /** Change one instalment — which one is in the body.
   *
   *  `PATCH` on the collection rather than `PATCH .../terms/:termNo`, and the
   *  path is the reason: an instalment's key is the PAIR (contract, number), so
   *  a route addressing it alone would be a path that names half a key. Same
   *  logic that keeps `leadCode` out of the sign path. */
  @Patch(':code/terms')
  @Need({ branch: 'Sales', permission: 'hợp-đồng.sửa', scoped: true })
  patchTerm(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaHopDong)) code: MaHopDong,
    @Body(zod(ContractTermPatch)) body: ContractTermPatch,
  ) {
    return this.contracts.patchTerm(who, code, body)
  }
}
