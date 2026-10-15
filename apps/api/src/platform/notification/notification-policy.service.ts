import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  NOTIFICATION_KIND_POLICY,
  NotificationKind,
  NotificationPolicyResponse,
  NotificationPolicyRow,
  effectiveImportant,
  type NotificationPolicyBody,
} from '@pv/contracts'
import { AuditRepository } from '../audit/audit.repository'
import { invalid } from '../http/problem'
import { RolePermissionRepository } from '../roles/role-permission.repository'
import type { NotificationKindPolicyRowDb } from './notification.schema'
import { inapplicableRoles, type Grants } from './notification-applicability'
import { NotificationPolicyRepository } from './notification-policy.repository'

const LOCKED_MUTE = 'Loại thông báo này luôn được gửi, không tắt được.'

/** The admin list of who hears which kind (ADR 0093 §1-§2). Rows hold
 *  overrides only, so `list` walks `NotificationKind` and fills the contract
 *  defaults, the shape `SettingService.list` keeps. No approval step: a write
 *  can only narrow, never widen past E4 or permissions. The audit line, with
 *  before and after, commits in the same transaction as the row it explains. */
@Injectable()
export class NotificationPolicyService {
  constructor(
    private readonly repo: NotificationPolicyRepository,
    private readonly audit: AuditRepository,
    private readonly roles: RolePermissionRepository,
  ) {}

  /** Grants are read live, one query for the whole matrix, so a role an admin
   *  just stripped of `lead.view` reads "not applicable" on the next load. */
  async list(): Promise<NotificationPolicyResponse> {
    const [found, grants] = await Promise.all([this.repo.all(), this.roles.allGrants()])
    const rows = new Map(found.map((r) => [r.row.kind, r]))
    return NotificationPolicyResponse.parse({
      rows: NotificationKind.options.map((kind) => {
        const hit = rows.get(kind)
        return toContract(kind, hit?.row ?? null, hit?.actorName ?? null, grants)
      }),
    })
  }

  /** Refused before the transaction opens, so a refusal leaves no audit line. */
  async set(
    who: Actor,
    kind: NotificationKind,
    body: NotificationPolicyBody,
  ): Promise<NotificationPolicyRow> {
    if (NOTIFICATION_KIND_POLICY[kind].locked && body.mutedRoleIds.length > 0) {
      throw invalid({ mutedRoleIds: [LOCKED_MUTE] }, LOCKED_MUTE)
    }
    const row = await this.repo.run(async (tx) => {
      const before = await this.repo.lock(tx, kind)
      const after = await this.repo.upsert(tx, kind, { ...body, updatedBy: who.id })
      await this.audit.write(
        { actorId: who.id, action: 'edit', note: changeNote(before, after) },
        tx,
      )
      return after
    })
    const grants = await this.roles.allGrants()
    return NotificationPolicyRow.parse(toContract(kind, row, who.name, grants))
  }
}

function toContract(
  kind: NotificationKind,
  row: NotificationKindPolicyRowDb | null,
  actorName: string | null,
  grants: Grants,
): NotificationPolicyRow {
  return {
    kind,
    important: effectiveImportant(kind, row?.important),
    mutedRoleIds: row?.mutedRoleIds ?? [],
    inapplicableRoleIds: inapplicableRoles(kind, grants),
    locked: NOTIFICATION_KIND_POLICY[kind].locked,
    updatedAt: row ? row.updatedAt.toISOString() : null,
    /* `updated_by` has no ON DELETE, so a row's writer always still exists. */
    updatedBy: row && actorName ? { id: row.updatedBy, name: actorName } : null,
  }
}

/** "Before" may never have been a row: the first edit moves away from the
 *  contract default, and the line says so, as `setting.service`'s does. */
function changeNote(
  before: NotificationKindPolicyRowDb | null,
  after: NotificationKindPolicyRowDb,
): string {
  const state = (important: boolean | null, muted: readonly string[]) => {
    const value = effectiveImportant(after.kind, important)
    return `important ${important === null ? `default (${value})` : value}, muted [${muted.join(', ')}]`
  }
  const from = before ? state(before.important, before.mutedRoleIds) : `${state(null, [])} (no row)`
  return `platform.notification_kind_policy ${after.kind} · ${from} → ${state(after.important, after.mutedRoleIds)}`
}
