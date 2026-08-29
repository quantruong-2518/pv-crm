import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  MaObject,
  QuoteBookQuery,
  QuoteCreate,
  QuoteDecision,
  QuoteReplace,
  QuoteUpdate,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { QuoteService } from './quote.service'

/** `/sales/quotes` — module 4 of the Sales branch.
 *
 *  Thin on purpose: take, validate, call, return. No business `if`, no SQL, no
 *  `req`/`res` — everything worth reading is in the declarations.
 *
 *  ------------------------------------------------------------------
 *  THREE PERMISSIONS ACROSS SEVEN DOORS, SPLIT BY WHAT CANNOT BE TAKEN BACK
 *  ------------------------------------------------------------------
 *  Reading is reading. EDITING drafts a number, and typing over it undoes that.
 *  SENDING puts the number in front of a customer, and nothing undoes that — so
 *  it is its own permission, on the same seam that already separates editing a
 *  campaign from firing one. Presales holds read and edit, not send.
 *
 *  Recording the customer's answer asks for the DEAL-CLOSING permission instead
 *  of a fourth quote permission. The hand that marks a version accepted is the
 *  hand that fixes the number a contract will be signed for; binding the two to
 *  one permission describes what actually happens and saves a row in the matrix.
 *
 *  ------------------------------------------------------------------
 *  `POST /sales/quotes` IS THE ONE DOOR THAT CANNOT BE SCOPED
 *  ------------------------------------------------------------------
 *  It names its deal in the BODY, so there is no `ref` for the guard to read —
 *  the row does not exist yet. `scoped: true` on it would be a declaration that
 *  enforces nothing, which is worse than none: it reads like a fence. The real
 *  check is in the service, against the PARENT DEAL, and it is not optional —
 *  without it a Sale who may only see their own deals can draft a quote onto
 *  somebody else's, and no other door catches that.
 *
 *  The deal code travels in the body rather than the path for the reason the
 *  deal book gives for its own create door: a quote is not a sub-resource of an
 *  opportunity. It lives its life at `/sales/quotes/:code`, and one resource
 *  gets one root. */
@Controller('sales/quotes')
export class QuoteController {
  constructor(private readonly quotes: QuoteService) {}

  /** The book, cutting across every deal.
   *
   *  Also the door the deal profile's quote card rides on, via
   *  `?opportunityCode=` — "every version on this deal" is this book asked a
   *  narrower question, and a second door returning the same rows would be two
   *  definitions of one list. */
  @Get()
  @Need({ branch: 'Sales', permission: 'báo-giá.xem', scoped: true })
  book(@CurrentActor() who: Actor, @Query(zod(QuoteBookQuery)) q: QuoteBookQuery) {
    return this.quotes.book(who, q)
  }

  /** One version, plus every version of the same deal for comparison.
   *
   *  Declared AFTER `@Get()` and carrying the same three axes. `MaObject` is the
   *  first fence: a malformed code dies in `ZodPipe` with a 400 naming the field
   *  and never reaches a query. Whether the quote exists, and whether it belongs
   *  to this reader, needs data to answer and so belongs to the service. */
  @Get(':code')
  @Need({ branch: 'Sales', permission: 'báo-giá.xem', scoped: true })
  profile(@CurrentActor() who: Actor, @Param('code', zod(MaObject)) code: MaObject) {
    return this.quotes.profile(who, code)
  }

  /** Draft the first quote on a deal. 201 with the whole row — the screen shows
   *  the code and the version the server just assigned without asking again. */
  @Post()
  @Need({ branch: 'Sales', permission: 'báo-giá.sửa' })
  create(@CurrentActor() who: Actor, @Body(zod(QuoteCreate)) body: QuoteCreate) {
    return this.quotes.create(who, body)
  }

  /** Draft the next round: a NEW code, the next version number, linked behind
   *  the version it replaces. Not an edit of that version — see the service. */
  @Post(':code/replace')
  @Need({ branch: 'Sales', permission: 'báo-giá.sửa', scoped: true })
  replace(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaObject)) code: MaObject,
    @Body(zod(QuoteReplace)) body: QuoteReplace,
  ) {
    return this.quotes.replace(who, code, body)
  }

  /** The draft leaves the building.
   *
   *  `@HttpCode(200)`: nothing is created here, a row changes state. And no
   *  body — everything this door needs is the code on the path, so accepting one
   *  would only invite a caller to send a send timestamp of their own choosing. */
  @Post(':code/send')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'báo-giá.gửi', scoped: true })
  send(@CurrentActor() who: Actor, @Param('code', zod(MaObject)) code: MaObject) {
    return this.quotes.send(who, code)
  }

  /** Record what the customer said. See the permission note at the top. */
  @Post(':code/decide')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'cơ-hội.chốt', scoped: true })
  decide(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaObject)) code: MaObject,
    @Body(zod(QuoteDecision)) body: QuoteDecision,
  ) {
    return this.quotes.decide(who, code, body)
  }

  /** Save a draft. 409 once it has been sent — the service says why.
   *
   *  `PATCH` rather than `PUT` while the body still carries the whole form: the
   *  verb talks about the RESOURCE — this touches part of a quote, never its
   *  deal or its code — and the body talks about the FORM. Same split the deal
   *  profile's save button already uses. */
  @Patch(':code')
  @Need({ branch: 'Sales', permission: 'báo-giá.sửa', scoped: true })
  update(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaObject)) code: MaObject,
    @Body(zod(QuoteUpdate)) body: QuoteUpdate,
  ) {
    return this.quotes.update(who, code, body)
  }
}
