import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  IdentityCreate,
  IdentityId,
  IdentityMerge,
  IdentityPatch,
  IdentityQuery,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { IdentityService } from './identity.service'

/** `/comms/identities` — C9 of the HTTP door table, turn 0 of `comms`.
 *
 *  Thin on purpose, the shape `campaign.controller.ts` keeps: take, check,
 *  call, return. No business `if`, no SQL.
 *
 *  ONE PERMISSION ON ALL FOUR, and no `branch`. `comm.capture-manage` is a
 *  platform-wide capability — a conversation with a supplier is this same table
 *  the day Supply exists — so naming a branch here would license the identity
 *  book to Sales and lock it against every branch after. Same reasoning
 *  `users.controller.ts` writes down for `/users`.
 *
 *  No `scoped` either: the table has no owner column to cut by. See
 *  `identity.service.ts`.
 *
 *  `merge` IS ITS OWN DOOR rather than a field on `PATCH`, the rule decision 3
 *  of `docs/ban-giao-campaign.md` set: it takes a body of its own (two ids, not
 *  one), it touches two rows, and reading the log has to show who folded two
 *  people into one without inferring it from a `PATCH` shared with every
 *  spelling correction. And it is now true rather than aspirational: all three
 *  write doors put a line in `platform.audit` inside their own transaction —
 *  see `identity.service.ts`. */
@Controller('comms/identities')
export class IdentityController {
  constructor(private readonly identities: IdentityService) {}

  @Get()
  @Need({ permission: 'comm.capture-manage' })
  book(@Query(zod(IdentityQuery)) q: IdentityQuery) {
    return this.identities.book(q)
  }

  @Post()
  @Need({ permission: 'comm.capture-manage' })
  create(@CurrentActor() who: Actor, @Body(zod(IdentityCreate)) body: IdentityCreate) {
    return this.identities.create(who, body)
  }

  /** Before `PATCH :id` in the file only for reading order — `merge` is a POST
   *  on a fixed segment, so no `:id` route can shadow it. */
  @Post('merge')
  @Need({ permission: 'comm.capture-manage' })
  merge(@CurrentActor() who: Actor, @Body(zod(IdentityMerge)) body: IdentityMerge) {
    return this.identities.merge(who, body)
  }

  @Patch(':id')
  @Need({ permission: 'comm.capture-manage' })
  patch(
    @CurrentActor() who: Actor,
    @Param('id', zod(IdentityId)) id: string,
    @Body(zod(IdentityPatch)) body: IdentityPatch,
  ) {
    return this.identities.amend(who, id, body)
  }
}
