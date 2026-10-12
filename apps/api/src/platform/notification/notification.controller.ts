import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { NotificationListQuery, NotificationReadBody } from '@pv/contracts'
import { Need } from '../access/need.decorator'
import { zod } from '../http/zod.pipe'
import { CurrentActor } from '../session/current-actor.decorator'
import { NotificationService } from './notification.service'

/** `/notifications` — the caller's own bell (contract: `notification.ts`).
 *
 *  `@Need({})`, "just be signed in", for `GET /approvals/pending`'s reason:
 *  every row is the caller's by `recipient_id`, so there is no wider set a
 *  permission could fence, and no branch axis — one bell rings for all of them. */
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @Need({})
  list(@CurrentActor() who: Actor, @Query(zod(NotificationListQuery)) q: NotificationListQuery) {
    return this.notifications.list(who, q)
  }

  @Get('unread-count')
  @Need({})
  unreadCount(@CurrentActor() who: Actor) {
    return this.notifications.unreadCount(who)
  }

  /** 200, not 201: marking read creates nothing. */
  @Post('read')
  @HttpCode(200)
  @Need({})
  read(@CurrentActor() who: Actor, @Body(zod(NotificationReadBody)) body: NotificationReadBody) {
    return this.notifications.read(who, body)
  }
}
