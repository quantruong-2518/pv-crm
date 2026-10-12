import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import type { Actor } from '@pv/engines'
import { NotificationListQuery, NotificationReadBody } from '@pv/contracts'
import { Need } from '../access/need.decorator'
import { zod } from '../http/zod.pipe'
import { CurrentActor } from '../session/current-actor.decorator'
import { NotificationListener } from './notification.listener'
import { NotificationService } from './notification.service'
import { openStream } from './notification.stream'

/** `/notifications` — the caller's own bell (contract: `notification.ts`).
 *
 *  `@Need({})`, "just be signed in", for `GET /approvals/pending`'s reason:
 *  every row is the caller's by `recipient_id`, so there is no wider set a
 *  permission could fence, and no branch axis — one bell rings for all of them. */
@Controller('notifications')
export class NotificationController {
  private readonly log = new Logger('notification')

  constructor(
    private readonly notifications: NotificationService,
    private readonly listener: NotificationListener,
  ) {}

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

  /** A signal, never rows (ADR 0089): `changed` tells the page to re-read the
   *  GETs above, so the permission cut stays in one place. 503 where no LISTEN
   *  can be trusted: the page then keeps its fallback poll. */
  @Get('stream')
  @Need({})
  stream(@CurrentActor() who: Actor, @Res() reply: FastifyReply): void {
    if (!this.listener.available) throw new ServiceUnavailableException()
    openStream(reply, this.listener, who.id)
    reply.raw.once('close', () =>
      this.log.debug(`Stream closed - ${this.listener.size} subscriber(s) left`),
    )
  }

  /** 200, not 201: marking read creates nothing. */
  @Post('read')
  @HttpCode(200)
  @Need({})
  read(@CurrentActor() who: Actor, @Body(zod(NotificationReadBody)) body: NotificationReadBody) {
    return this.notifications.read(who, body)
  }
}
