import { Injectable, Logger } from '@nestjs/common'
import { NotificationKind, type NotificationSubject } from '@pv/contracts'
import {
  NOTIFICATION_RULES,
  plan,
  type Branch,
  type EventPayload,
  type Permission,
} from '@pv/engines'
import type { Db } from '../db/db.module'
import { RolePermissionRepository } from '../roles/role-permission.repository'
import { NotificationRepository } from './notification.repository'

export type Announcement = {
  event: EventPayload
  subject: { kind: NotificationSubject; code: string; label?: string | null }
  detail?: Record<string, string | number> | null
}

/** The bell's only door for emitters (ADR 0085). A module reports what
 *  happened and who each audience is; E4 picks the kinds, this class writes
 *  the rows inside the CALLER's transaction, so a bell line commits or
 *  vanishes with the write it describes.
 *
 *  One-way only: the fact can take the bell down with it, never the reverse.
 *  The write runs under a SAVEPOINT and a failure is logged and dropped — a
 *  bell line is a courtesy, and must not be why a run stays uncancelled or a
 *  landing lead is refused. Bad ids are filtered before the insert anyway. */
@Injectable()
export class NotificationHub {
  private readonly log = new Logger('notification')

  constructor(
    private readonly repo: NotificationRepository,
    private readonly roles: RolePermissionRepository,
  ) {}

  async announce(tx: Db, input: Announcement): Promise<void> {
    await tx
      .transaction((savepoint) => this.write(savepoint, input))
      .catch((error: unknown) =>
        this.log.error(`Bell line for ${input.event.name} was not written: ${String(error)}`),
      )
  }

  private async write(tx: Db, { event, subject, detail }: Announcement): Promise<void> {
    const intents = plan(event, NOTIFICATION_RULES).filter((i) => i.channel === 'in-app')
    if (intents.length === 0) return

    const ids = new Set(intents.map((i) => i.to))
    if (event.actorId) ids.add(event.actorId)
    const known = new Map((await this.repo.actors(tx, [...ids])).map((a) => [a.id, a]))

    const rows = intents
      .filter((i) => known.get(i.to)?.disabledAt === null)
      .map((i) => ({
        recipientId: i.to,
        kind: NotificationKind.parse(i.kind),
        eventKey: i.eventKey,
        subjectKind: subject.kind,
        subjectCode: subject.code,
        subjectLabel: subject.label ?? null,
        /* A locked account can still be the cause; only a missing one cannot. */
        actorId: event.actorId && known.has(event.actorId) ? event.actorId : null,
        detail: detail ?? null,
      }))
    if (rows.length > 0) await this.repo.insert(tx, rows)
  }

  /** A role audience: every unlocked actor whose role grants `permission`,
   *  read from the live matrix so an admin's change moves the audience too. */
  async holding(tx: Db, permission: Permission, branch?: Branch): Promise<string[]> {
    /* Same one-way rule as `announce`: a failed audience read tells nobody,
       it does not abort the caller's transaction. */
    return tx
      .transaction(async (savepoint) => {
        const roles = await this.roles.rolesHolding(permission, savepoint)
        return roles.length === 0 ? [] : this.repo.activeIn(savepoint, roles, branch)
      })
      .catch((error: unknown) => {
        this.log.error(`Audience for ${permission} was not read: ${String(error)}`)
        return []
      })
  }
}
