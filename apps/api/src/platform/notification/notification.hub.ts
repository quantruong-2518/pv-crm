import { Injectable, Logger } from '@nestjs/common'
import { NOTIFICATION_KIND_POLICY, NotificationKind, type NotificationSubject } from '@pv/contracts'
import {
  NOTIFICATION_RULES,
  plan,
  type Branch,
  type EventPayload,
  type Permission,
  type RoleId,
} from '@pv/engines'
import type { Db } from '../db/db.module'
import { RolePermissionRepository } from '../roles/role-permission.repository'
import { inapplicableRoles } from './notification-applicability'
import { NotificationPolicyRepository } from './notification-policy.repository'
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
 *  landing lead is refused. Bad ids are filtered before the insert anyway.
 *
 *  After E4, the admin kind policy only narrows (ADR 0093 §1): it drops
 *  intents, never adds one, so it cannot reach past E4 or permissions. */
@Injectable()
export class NotificationHub {
  private readonly log = new Logger('notification')

  constructor(
    private readonly repo: NotificationRepository,
    private readonly roles: RolePermissionRepository,
    private readonly policies: NotificationPolicyRepository,
  ) {}

  async announce(tx: Db, input: Announcement): Promise<void> {
    await tx
      .transaction((savepoint) => this.write(savepoint, input))
      .catch((error: unknown) =>
        this.log.error(`Bell line for ${input.event.name} was not written: ${String(error)}`),
      )
  }

  private async write(tx: Db, { event, subject, detail }: Announcement): Promise<void> {
    const intents = plan(event, NOTIFICATION_RULES)
      .filter((i) => i.channel === 'in-app')
      .map((i) => ({ ...i, kind: NotificationKind.parse(i.kind) }))
    if (intents.length === 0) return

    const ids = new Set(intents.map((i) => i.to))
    if (event.actorId) ids.add(event.actorId)
    const known = new Map((await this.repo.actors(tx, [...ids])).map((a) => [a.id, a]))
    const muted = await this.mutes(tx, [...new Set(intents.map((i) => i.kind))])

    const rows = intents
      .filter((i) => {
        const to = known.get(i.to)
        if (to?.disabledAt !== null) return false
        const rule = muted.get(i.kind)
        /* A union, like permissions: one role that is neither muted nor out keeps it. */
        if (!rule || !to.roleIds.some((r) => rule.muted.has(r))) return true
        return to.roleIds.some((r) => !rule.muted.has(r) && !rule.out.has(r))
      })
      .map((i) => ({
        recipientId: i.to,
        kind: i.kind,
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

  /** Muted and not-applicable roles per kind, read on the announcing
   *  transaction with no cache: the worker announces too, and an admin's
   *  change must reach it at once. Grants are read only when something is
   *  muted, since an inapplicable role must not keep a muted person's line.
   *  Locked kinds are skipped, so a stray row can never silence them. */
  private async mutes(
    tx: Db,
    kinds: readonly NotificationKind[],
  ): Promise<Map<NotificationKind, { muted: Set<RoleId>; out: Set<RoleId> }>> {
    const open = kinds.filter((k) => !NOTIFICATION_KIND_POLICY[k].locked)
    if (open.length === 0) return new Map()
    const rows = await this.policies.mutes(tx, open)
    if (rows.length === 0) return new Map()
    const grants = await this.roles.allGrants(tx)
    return new Map(
      rows.map((r) => [
        r.kind,
        { muted: new Set(r.mutedRoleIds), out: new Set(inapplicableRoles(r.kind, grants)) },
      ]),
    )
  }

  /** For a sweeper that would otherwise re-announce a standing backlog every
   *  tick: the subjects already told. A saving only — the ledger's UNIQUE is
   *  what refuses a duplicate. Unlike `announce`, a failed read rejects. */
  told(
    tx: Db,
    kind: NotificationKind,
    subjectKind: NotificationSubject,
    codes: readonly string[],
  ): Promise<Set<string>> {
    return this.repo.told(tx, kind, subjectKind, codes)
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
