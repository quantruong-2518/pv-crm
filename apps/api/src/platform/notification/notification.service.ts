import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  NotificationListResponse,
  NotificationReadResponse,
  NotificationUnreadCount,
  type NotificationReadBody,
  type PageQuery,
} from '@pv/contracts'
import { toContract } from './notification.mapper'
import { NotificationRepository } from './notification.repository'

/** The caller's own bell. No engine is asked anything here: the rows are the
 *  caller's by `recipient_id`, and that is the whole rule. */
@Injectable()
export class NotificationService {
  constructor(private readonly repo: NotificationRepository) {}

  async list(who: Actor, q: PageQuery): Promise<NotificationListResponse> {
    const { rows, total } = await this.repo.page(who.id, q)
    return NotificationListResponse.parse({ rows: rows.map(toContract), total, hidden: 0 })
  }

  async unreadCount(who: Actor): Promise<NotificationUnreadCount> {
    return NotificationUnreadCount.parse({ count: await this.repo.unread(who.id) })
  }

  async read(who: Actor, body: NotificationReadBody): Promise<NotificationReadResponse> {
    if ('all' in body) {
      return NotificationReadResponse.parse({ changed: await this.repo.markRead(who.id) })
    }
    const changed = await this.repo.markRead(who.id, body.ids)
    return NotificationReadResponse.parse({ changed })
  }
}
