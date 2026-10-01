import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { DebriefClose, DebriefId, PendingDebriefQuery } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { DebriefService } from './debrief.service'

/** Comm close-out doors (ADR 0074), all on `comm.view` for the reason
 *  `ThreadController` gives: `comm.view-content` cuts a field, not a request.
 *  No `scoped: true` either — the owner fence and the thread's reach are
 *  enforced in `DebriefService`, not by an `owner_id` cut a flag would promise. */
@Controller('comms/debriefs')
export class DebriefController {
  constructor(private readonly debriefs: DebriefService) {}

  @Get('pending')
  @Need({ permission: 'comm.view' })
  pending(@CurrentActor() who: Actor, @Query(zod(PendingDebriefQuery)) q: PendingDebriefQuery) {
    return this.debriefs.pending(who, q)
  }

  @Get('counts')
  @Need({ permission: 'comm.view' })
  counts(@CurrentActor() who: Actor) {
    return this.debriefs.counts(who)
  }

  /** 200, not 201: closing changes a row that already exists. */
  @Post(':id/close')
  @HttpCode(200)
  @Need({ permission: 'comm.view' })
  close(
    @CurrentActor() who: Actor,
    @Param('id', zod(DebriefId)) id: string,
    @Body(zod(DebriefClose)) body: DebriefClose,
  ) {
    return this.debriefs.close(who, id, body)
  }
}
