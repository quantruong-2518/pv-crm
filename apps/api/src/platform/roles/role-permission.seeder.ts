import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, type Permission, type RoleId } from '@pv/engines'
import { DB, type Db } from '../db/db.module'
import { Inject } from '@nestjs/common'
import { RolePermissionRepository } from './role-permission.repository'

/** Plants a permission into the matrix ONCE in its lifetime, then never again.
 *
 *  ------------------------------------------------------------------
 *  WHY NOT "SEED IF THE TABLE IS EMPTY"
 *  ------------------------------------------------------------------
 *  Because the interesting case is not the first boot, it is the boot after a
 *  developer adds a 28th permission. That permission exists in `@Need` on a new
 *  endpoint and in nobody's grants, so the feature ships dead: every role gets
 *  403, including the director. The old compile-time matrix could not have this
 *  problem — `director` and `head-of-sales` spelled their rows as `PERMISSIONS`,
 *  so a new key was theirs the moment it was declared, and `e2-access.ts` calls
 *  forgetting that an invisible bug in as many words.
 *
 *  So the seeder runs per PERMISSION, not per table: anything in `PERMISSIONS`
 *  with no row in `permission_seed` gets the defaults for every role, and is
 *  marked planted. That keeps the old guarantee and adds nothing to the job of
 *  whoever declares the key.
 *
 *  ------------------------------------------------------------------
 *  WHY IT CANNOT LOOK AT `role_permission` INSTEAD
 *  ------------------------------------------------------------------
 *  "No rows for this permission" reads the same whether nobody ever planted it
 *  or an administrator revoked it from all seven roles. Seeding on that signal
 *  would resurrect, on every deploy, exactly the grants somebody went to the
 *  admin screen to remove. `permission_seed` is the one bit of state that tells
 *  those two apart. */
@Injectable()
export class RolePermissionSeeder implements OnApplicationBootstrap {
  private readonly log = new Logger('roles')

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly repo: RolePermissionRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const forgotten = await this.repo.forgetUnknown()
    const planted = await this.plantNewPermissions()

    if (forgotten > 0) this.log.log(`${forgotten} grant of permissions no longer in code, dropped.`)
    this.log.log(
      planted.length > 0
        ? `${planted.length} new permission seeded: ${planted.join(', ')}`
        : `${await this.repo.grantCount()} grant in the role matrix, nothing new to seed.`,
    )
  }

  private async plantNewPermissions(): Promise<Permission[]> {
    const seeded = await this.repo.seededPermissions()
    const fresh = PERMISSIONS.filter((p) => !seeded.has(p))
    if (fresh.length === 0) return []

    const grants: { roleId: RoleId; permission: Permission }[] = []
    for (const [roleId, defaults] of Object.entries(DEFAULT_ROLE_PERMISSIONS) as [
      RoleId,
      readonly Permission[],
    ][]) {
      for (const permission of fresh) {
        if (defaults.includes(permission)) grants.push({ roleId, permission })
      }
    }

    /* One transaction for grants AND marks. Planting without marking means the
       next boot plants again on top of whatever an administrator has since
       done; marking without planting means the permission is dead for good and
       nothing will ever notice. */
    await this.db.transaction(async (tx) => {
      await this.repo.plant(tx, grants, fresh)
    })
    return [...fresh]
  }
}
