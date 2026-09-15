import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { LinkCreate, MessageCreate, ThreadId, ThreadQuery } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { ThreadService } from './thread.service'

/** C1–C4 of the HTTP door table — the conversation book, turn 1 of `comms`.
 *
 *  Thin on purpose, the shape `campaign.controller.ts` keeps: take, check,
 *  call, return. No business `if`, no SQL.
 *
 *  ------------------------------------------------------------------
 *  ONE `@Controller('comms')` FOR TWO PATHS, AND NO `branch`
 *  ------------------------------------------------------------------
 *  `/comms/threads` and `/comms/messages` are two paths of one book: posting a
 *  turn mints the thread under it when there is none, so splitting them across
 *  two controllers would put both halves of one write behind two front doors.
 *  `IdentityController` owns `comms/identities` and nothing here collides
 *  with it.
 *
 *  No `branch` for the reason that controller writes down: a conversation with
 *  a supplier is this same table the day Supply exists, so naming `Sales` here
 *  would license the book to one branch and lock it against every branch
 *  after. The branch axis still runs — E2 reads it off the OBJECT a thread
 *  hangs on, which is where it belongs, because the object is the thing that
 *  has a branch.
 *
 *  ------------------------------------------------------------------
 *  ONE PERMISSION ON ALL FOUR, AND NO `scoped: true`
 *  ------------------------------------------------------------------
 *  `comm.view` on every door, `comm.view-content` declared on none of them —
 *  the second permission does not decide whether a request is allowed, it
 *  decides which branch of `MessageContent` one field arrives as, so a route
 *  that declared it would refuse the manager who is entitled to the count and
 *  not to the words. That is §5b's whole line, and it is enforced in
 *  `comms.mapper.ts`.
 *
 *  `scoped: true` is absent even on C1, which §9 marks scoped, because the
 *  flag means one specific thing here: "this endpoint has row data and its
 *  repository cuts by `owner_id` in SQL". `comms.thread` has no owner column
 *  to cut by. The scope axis IS enforced — see `thread.service.ts`, it runs
 *  against the `platform.object` row the thread hangs on — and declaring a
 *  flag no repository reads would be a promise pointing at nothing.
 *
 *  The query key is `objectCode`, not `object`: `ThreadQuery` in
 *  `@pv/contracts` names the field, the whole object goes through `zod()`, and
 *  the contract is the single source of the wire shape the way every other
 *  `@Query` in this repo treats it. */
@Controller('comms')
export class ThreadController {
  constructor(private readonly threads: ThreadService) {}

  @Get('threads')
  @Need({ permission: 'comm.view' })
  byObject(@CurrentActor() who: Actor, @Query(zod(ThreadQuery)) q: ThreadQuery) {
    return this.threads.byObject(who, q)
  }

  @Get('threads/:id/messages')
  @Need({ permission: 'comm.view' })
  messages(@CurrentActor() who: Actor, @Param('id', zod(ThreadId)) id: string) {
    return this.threads.messages(who, id)
  }

  /** `MessageCreate` is a union on `thread`, so the two cases a person means
   *  by "log this call" — the first one on this deal and the fifth — arrive at
   *  one door and the caller never has to know which they are having. */
  @Post('messages')
  @Need({ permission: 'comm.view' })
  create(@CurrentActor() who: Actor, @Body(zod(MessageCreate)) body: MessageCreate) {
    return this.threads.create(who, body)
  }

  @Post('threads/:id/links')
  @Need({ permission: 'comm.view' })
  link(
    @CurrentActor() who: Actor,
    @Param('id', zod(ThreadId)) id: string,
    @Body(zod(LinkCreate)) body: LinkCreate,
  ) {
    return this.threads.link(who, id, body)
  }
}
