import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  NOTIFICATION_KIND_GROUP,
  NOTIFICATION_KIND_LABEL,
  NotificationKind,
  NotificationListResponse,
  NotificationReadResponse,
  NotificationUnreadCount,
  type NotificationListQuery,
  type NotificationReadBody,
} from '@pv/contracts'
import { toContract } from './notification.mapper'
import { NotificationRepository } from './notification.repository'

/** The caller's own bell. No engine is asked anything here: the rows are the
 *  caller's by `recipient_id`, and that is the whole rule. */
@Injectable()
export class NotificationService {
  constructor(private readonly repo: NotificationRepository) {}

  async list(who: Actor, q: NotificationListQuery): Promise<NotificationListResponse> {
    const kinds = q.group
      ? NotificationKind.options.filter((k) => NOTIFICATION_KIND_GROUP[k] === q.group)
      : undefined
    const needle = q.q?.toLocaleLowerCase('vi')
    const labelKinds = needle
      ? NotificationKind.options.filter((k) =>
          NOTIFICATION_KIND_LABEL[k].toLocaleLowerCase('vi').includes(needle),
        )
      : []
    const filter = { unread: q.unread === '1', kinds, text: q.q, labelKinds }
    const { rows, total } = await this.repo.page(who.id, q, filter)
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
