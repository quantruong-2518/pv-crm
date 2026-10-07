import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  CommRecordCreateBody,
  DebriefClose,
  DebriefId,
  DebriefListQuery,
  DebriefTargetQuery,
  MeetingDebriefClose,
  PendingDebriefQuery,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { DebriefService } from './debrief.service'
import { MeetingDebriefService } from './meeting-debrief.service'

/** Comm record doors (ADR 0074, 0075), all on `comm.view` for the reason
 *  `ThreadController` gives: `comm.view-content` cuts a field, not a request.
 *  No `scoped: true` either — the owner fence and the subject's reach are
 *  enforced in `DebriefService`, not by an `owner_id` cut a flag would promise.
 *  `target`, `pending` and `counts` come before `:id` so they are not read as ids. */
@Controller('comms/debriefs')
export class DebriefController {
  constructor(
    private readonly debriefs: DebriefService,
    private readonly meetings: MeetingDebriefService,
  ) {}

  @Post()
  @Need({ permission: 'comm.view' })
  create(@CurrentActor() who: Actor, @Body(zod(CommRecordCreateBody)) body: CommRecordCreateBody) {
    return this.debriefs.create(who, body)
  }

  @Get()
  @Need({ permission: 'comm.view' })
  list(@CurrentActor() who: Actor, @Query(zod(DebriefListQuery)) q: DebriefListQuery) {
    return this.debriefs.list(who, q)
  }

  @Get('target')
  @Need({ permission: 'comm.view' })
  target(@CurrentActor() who: Actor, @Query(zod(DebriefTargetQuery)) q: DebriefTargetQuery) {
    return this.debriefs.target(who, q)
  }

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

  @Get(':id')
  @Need({ permission: 'comm.view' })
  one(@CurrentActor() who: Actor, @Param('id', zod(DebriefId)) id: string) {
    return this.debriefs.one(who, id)
  }

  /** 200, not 201: confirming changes a row that already exists. */
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

  /** The "meeting held" close on a booked meeting's record; same gate, the fence is in the
   *  service (owner, or an outranking closer). 200 for `close`'s reason. */
  @Post(':id/close-meeting')
  @HttpCode(200)
  @Need({ permission: 'comm.view' })
  closeMeeting(
    @CurrentActor() who: Actor,
    @Param('id', zod(DebriefId)) id: string,
    @Body(zod(MeetingDebriefClose)) body: MeetingDebriefClose,
  ) {
    return this.meetings.close(who, id, body)
  }
}
