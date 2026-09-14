import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { ApprovalDecisionBody, ApprovalId } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { ApprovalService } from './approval.service'

/** `/approvals` — the One inbox. A platform door, not a branch one.
 *
 *  It sits in `platform` because nine of the eleven pipelines end at somebody
 *  saying yes: a purchase order and a discount must arrive in the same inbox,
 *  under the same two routes, or "what is waiting on me" becomes a question you
 *  ask each branch separately. */
@Controller('approvals')
export class ApprovalController {
  constructor(private readonly approvals: ApprovalService) {}

  /** What is waiting on ME.
   *
   *  ------------------------------------------------------------------
   *  `@Need({})` — A LIVE SESSION AND NOTHING ELSE, DELIBERATELY
   *  ------------------------------------------------------------------
   *  The same declaration `/users/directory` makes, and for a stronger reason:
   *  this list is cut by the chain itself, which names the person waited on. A
   *  reader who approves nothing gets an empty array — there is no wider set to
   *  leak, so a permission here would only decide who may read their own empty
   *  inbox.
   *
   *  `approval.decide` gates the door below instead, which is where the power
   *  actually is. Gating the READ on it too would hide from a proposer the one
   *  thing they want to know: whether the thing they asked for is still sitting
   *  with somebody. */
  @Get('pending')
  @Need({})
  pending(@CurrentActor() who: Actor) {
    return this.approvals.pendingFor(who)
  }

  /** Yes or no, from the person the chain is waiting on.
   *
   *  Two fences, not one. `approval.decide` says the ROLE may decide things at
   *  all; `ApprovalService` then asks E3 whether THIS request is waiting on
   *  THIS person, and answers 403 if it is not. The first is static metadata,
   *  the second needs the row in hand — the same split `PATCH :code/owner` makes
   *  on the lead book.
   *
   *  `POST` rather than `PATCH` because the body is not a partial state of the
   *  request: `{ decision: 'rejected', reason }` is an ACT, and the request's
   *  own state is computed from the chain rather than assigned by the caller. */
  @Post(':id/decide')
  @Need({ permission: 'approval.decide' })
  decide(
    @CurrentActor() who: Actor,
    @Param('id', zod(ApprovalId)) id: string,
    @Body(zod(ApprovalDecisionBody)) body: ApprovalDecisionBody,
  ) {
    return this.approvals.decide(who, id, body)
  }
}
