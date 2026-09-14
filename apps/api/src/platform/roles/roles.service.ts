import { Inject, Injectable } from '@nestjs/common'
import type { Actor, Permission, RoleId } from '@pv/engines'
import { RoleId as ContractRoleId, type RoleGrants, type RoleMatrixView } from '@pv/contracts'
import { AuditRepository } from '../audit/audit.repository'
import { ADMIN_KEYS, lockAdminSurface } from '../db/admin-surface'
import { DB, type Db } from '../db/db.module'
import { conflict } from '../http/problem'
import { RolePermissionRepository } from './role-permission.repository'

/** Rules about WHO may change the matrix, and what change would leave nobody
 *  able to change it back.
 *
 *  Both rules below are about specific rows rather than about the matrix as a
 *  shape, which is why they live here and not in `@pv/engines` — the same
 *  reason `e2-access.ts` gives for keeping axis 3 out of the matrix. */
@Injectable()
export class RolesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly repo: RolePermissionRepository,
    private readonly audit: AuditRepository,
  ) {}

  /** Every role, including roles holding nothing.
   *
   *  Built from `RoleId.options` rather than from the rows: a role stripped to
   *  zero permissions has no rows at all, and a matrix that silently omitted it
   *  would leave the screen unable to give it anything back. */
  async matrix(): Promise<RoleMatrixView> {
    const grants = await this.repo.allGrants()
    return {
      rows: ContractRoleId.options.map((roleId) => ({
        roleId,
        permissions: grants.get(roleId) ?? [],
      })),
    }
  }

  async replace(who: Actor, roleId: RoleId, next: readonly Permission[]): Promise<RoleGrants> {
    /* Dedupe before anything else. The screen cannot send a duplicate, but the
       endpoint is not the screen, and a repeated pair would fail on the
       composite primary key with a message about an index. */
    const wanted = [...new Set(next)]

    return await this.db.transaction(async (tx) => {
      /* FIRST statement, before any read the rules depend on. Two
         administrators editing two different roles would otherwise each read a
         matrix in which the other role still holds the keys, each pass rule 2,
         and between them leave nobody able to administer anything. The same
         lock `UsersService` takes, because the invariant spans both tables. */
      await lockAdminSurface(tx)

      const before = await this.repo.grantsFor(roleId, tx)
      this.assertNotLockingSelfOut(who, roleId, wanted)
      await this.assertSomebodyKeepsTheKeys(tx, roleId, wanted)

      await this.repo.replace(tx, roleId, wanted, who.id)

      const note = this.noteFor(roleId, before, wanted)
      if (note) await this.audit.write({ actorId: who.id, action: 'edit', note }, tx)

      return { roleId, permissions: wanted }
    })
  }

  /** RULE 1 · you cannot take the keys off your own role.
   *
   *  The mirror of `UsersService`'s "you cannot demote yourself": there, the
   *  route out was editing your own `roleId`; here it is editing what your role
   *  may do, which reaches every person wearing it including you. Left open, an
   *  administrator clears `role.manage` from their own row to tidy up and
   *  discovers the screen that would put it back is now shut to them.
   *
   *  Deliberately narrow. Changing your own role's OTHER permissions is
   *  ordinary work and stays allowed; only the two keys are held down. */
  private assertNotLockingSelfOut(who: Actor, roleId: RoleId, wanted: readonly Permission[]): void {
    if (who.roleId !== roleId) return
    const dropped = ADMIN_KEYS.filter((k) => who.permissions.includes(k) && !wanted.includes(k))
    if (dropped.length === 0) return
    throw conflict(
      `Bạn không tự bỏ ${dropped.join(' và ')} khỏi vai của chính mình được — nhờ một quản trị viên khác làm việc này. Người tự bỏ quyền sửa phân quyền sẽ không mở lại được chính màn vừa dùng.`,
    )
  }

  /** RULE 2 · the last door cannot be shut.
   *
   *  Rule 1 stops you removing yourself; this stops you removing everyone else.
   *  Neither alone is enough — two administrators in different roles can each
   *  strip the other, and a single administrator is untouchable by rule 1 yet
   *  still reachable through a role they do not personally wear.
   *
   *  "Somebody" means an ENABLED account whose role holds the key. A role that
   *  holds it but nobody occupies leaves the door just as shut as no role at
   *  all, and so does a role held only by locked accounts.
   *
   *  Correct only inside the caller's transaction: it reads a world that the
   *  write in the same transaction is about to change, and takes the pending
   *  change into account by hand rather than by writing first and asking after. */
  private async assertSomebodyKeepsTheKeys(
    tx: Db,
    roleId: RoleId,
    wanted: readonly Permission[],
  ): Promise<void> {
    for (const key of ADMIN_KEYS) {
      const holders = await this.repo.rolesHolding(key, tx)
      const after = wanted.includes(key)
        ? [...new Set([...holders, roleId])]
        : holders.filter((r) => r !== roleId)

      if (await this.repo.anyEnabledActorIn(after, tx)) continue

      throw conflict(
        `Bỏ ${key} khỏi vai này thì không còn tài khoản nào đang hoạt động giữ được nó. Cấp ${key} cho một vai đang có người trước, rồi hãy bỏ ở đây — nếu không sẽ không còn ai sửa được phân quyền.`,
      )
    }
  }

  /** What changed, in words, for the audit trail. `null` when nothing did — an
   *  entry saying a role was edited into exactly its previous shape is noise in
   *  the one log someone reads to find a real change. */
  private noteFor(
    roleId: RoleId,
    before: readonly Permission[],
    after: readonly Permission[],
  ): string | null {
    const granted = after.filter((p) => !before.includes(p))
    const revoked = before.filter((p) => !after.includes(p))
    if (granted.length === 0 && revoked.length === 0) return null

    const parts = [
      granted.length > 0 ? `cấp ${granted.join(', ')}` : null,
      revoked.length > 0 ? `thu ${revoked.join(', ')}` : null,
    ].filter((p) => p !== null)
    return `vai ${roleId} · ${parts.join(' · ')}`
  }
}
