import { and, eq, inArray, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { NotificationKind } from '@pv/contracts'
import type { RoleId } from '@pv/engines'
import { DB, type Db } from '../db/db.module'
import { actor } from '../db/platform.schema'
import { notificationKindPolicy, type NotificationKindPolicyRowDb } from './notification.schema'

export type PolicyWithActor = { row: NotificationKindPolicyRowDb; actorName: string | null }

/** The only SQL on `platform.notification_kind_policy` (ADR 0093 §1). Merges
 *  nothing: a missing row standing for the contract defaults is the service's
 *  business. Writes take the caller's `tx`, so the audit line shares it. */
@Injectable()
export class NotificationPolicyRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Every override, at most one per kind, with the writer's name. */
  all(): Promise<PolicyWithActor[]> {
    return this.db
      .select({ row: notificationKindPolicy, actorName: actor.name })
      .from(notificationKindPolicy)
      .leftJoin(actor, eq(actor.id, notificationKindPolicy.updatedBy))
  }

  /** Held until the transaction ends, so two admins editing one kind file
   *  audit lines whose "before" is what the other actually left. */
  async lock(tx: Db, kind: NotificationKind): Promise<NotificationKindPolicyRowDb | null> {
    const [row] = await tx
      .select()
      .from(notificationKindPolicy)
      .where(eq(notificationKindPolicy.kind, kind))
      .for('update')
    return row ?? null
  }

  /** One statement, for `SettingRepository.upsert`'s reason; `updated_at` is
   *  set by hand because `defaultNow()` only fires on INSERT. */
  async upsert(
    tx: Db,
    kind: NotificationKind,
    values: { important: boolean | null; mutedRoleIds: RoleId[]; updatedBy: string },
  ): Promise<NotificationKindPolicyRowDb> {
    const [row] = await tx
      .insert(notificationKindPolicy)
      .values({ kind, ...values })
      .onConflictDoUpdate({
        target: notificationKindPolicy.kind,
        set: { ...values, updatedAt: sql`now()` },
      })
      .returning()
    if (!row) throw new Error('platform.notification_kind_policy: upsert returned no row')
    return row
  }

  /** The hub's read, on the announcing transaction: only rows that mute somebody. */
  mutes(
    tx: Db,
    kinds: readonly NotificationKind[],
  ): Promise<{ kind: NotificationKind; mutedRoleIds: RoleId[] }[]> {
    return tx
      .select({
        kind: notificationKindPolicy.kind,
        mutedRoleIds: notificationKindPolicy.mutedRoleIds,
      })
      .from(notificationKindPolicy)
      .where(
        and(
          inArray(notificationKindPolicy.kind, [...kinds]),
          sql`cardinality(${notificationKindPolicy.mutedRoleIds}) > 0`,
        ),
      )
  }
}
