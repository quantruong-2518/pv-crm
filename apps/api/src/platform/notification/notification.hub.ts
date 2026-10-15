import { Injectable, Logger } from '@nestjs/common'
import {
  NOTIFICATION_KIND_POLICY,
  NOTIFICATION_KINDS_RING_WITHOUT_LINK,
  NOTIFICATION_SUBJECT_PERMISSION,
  NotificationKind,
  type NotificationSubject,
} from '@pv/contracts'
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
import { inapplicableRoles, opensSubject, type Grants } from './notification-applicability'
import { NotificationPolicyRepository } from './notification-policy.repository'
import { NotificationRepository } from './notification.repository'

const RING_WITHOUT_LINK: ReadonlySet<NotificationKind> = new Set(
  NOTIFICATION_KINDS_RING_WITHOUT_LINK,
)

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
 *  After E4 two filters only narrow: a reader who could not open the line's
 *  link loses it (ADR 0093 §7), then the admin kind policy drops muted roles
 *  (§1). Neither adds an intent, so neither can reach past E4. */
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
    const open = [...new Set(intents.map((i) => i.kind))].filter(
      (k) => !NOTIFICATION_KIND_POLICY[k].locked,
    )
    const policy = open.length > 0 ? await this.policies.mutes(tx, open) : []
    const gate = NOTIFICATION_SUBJECT_PERMISSION[subject.kind]
    /* One grants read per announce, shared by the backstop and the mute filter. */
    const grants: Grants =
      gate !== null || policy.length > 0 ? await this.roles.allGrants(tx) : new Map()
    const muted = this.mutes(policy, grants)

    const rows = intents
      .filter((i) => {
        const to = known.get(i.to)
        if (to?.disabledAt !== null) return false
        if (gate && !RING_WITHOUT_LINK.has(i.kind) && !opensSubject(subject.kind, to, grants)) {
          this.log.log(`bell ${i.kind} to ${i.to} dropped: cannot open ${subject.kind} (${gate})`)
          return false
        }
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

  /** Muted and not-applicable roles per kind. The policy rows and grants are
   *  read on the announcing transaction with no cache: the worker announces
   *  too, and an admin's change must reach it at once. An inapplicable role
   *  must not keep a muted person's line. Locked kinds never reach here, so a
   *  stray row can never silence them. */
  private mutes(
    rows: readonly { kind: NotificationKind; mutedRoleIds: RoleId[] }[],
    grants: Grants,
  ): Map<NotificationKind, { muted: Set<RoleId>; out: Set<RoleId> }> {
    return new Map(
      rows.map((r) => [
        r.kind,
        { muted: new Set(r.mutedRoleIds), out: new Set(inapplicableRoles(r.kind, grants)) },
      ]),
    )
  }

  /** A role audience: every unlocked actor whose role grants `permission`,
   *  read from the live matrix so an admin's change moves the audience too. */
  holding(tx: Db, permission: Permission, branch?: Branch): Promise<string[]> {
    return this.bellRead(tx, `audience for ${permission}`, [], async (savepoint) => {
      const roles = await this.roles.rolesHolding(permission, savepoint)
      return roles.length === 0 ? [] : this.repo.activeIn(savepoint, roles, branch)
    })
  }

  /** Everyone holding one of these roles, own-only people included (unlike
   *  `holding`): for news about the role itself. */
  inRoles(tx: Db, roles: RoleId[], branch?: Branch): Promise<string[]> {
    if (roles.length === 0) return Promise.resolve([])
    return this.bellRead(tx, `audience for roles ${roles.join(',')}`, [], (s) =>
      this.repo.activeInRoles(s, roles, branch),
    )
  }

  /** `inRoles` without own-only people: a role audience for one record, which
   *  someone who may only see their own could not open unless they hold it. */
  sharedInRoles(tx: Db, roles: RoleId[], branch?: Branch): Promise<string[]> {
    if (roles.length === 0) return Promise.resolve([])
    return this.bellRead(tx, `audience for roles ${roles.join(',')}`, [], (s) =>
      this.repo.activeIn(s, roles, branch),
    )
  }

  /** Any read made only for a bell line, by any emitter. Same one-way rule as
   *  `announce`: it runs under a SAVEPOINT, and a failure is logged and turns
   *  into `fallback` instead of aborting the caller's transaction. */
  bellRead<T>(tx: Db, what: string, fallback: T, read: (savepoint: Db) => Promise<T>): Promise<T> {
    return tx.transaction(read).catch((error: unknown) => {
      this.log.error(`Bell read (${what}) failed: ${String(error)}`)
      return fallback
    })
  }
}
