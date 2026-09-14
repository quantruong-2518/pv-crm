import { eq } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { DB, type Db } from '../db/db.module'
import { actor } from '../db/platform.schema'
import { RolePermissionRepository } from '../roles/role-permission.repository'

/** Đọc người dùng. Trả thẳng kiểu `Actor` của engine — E2 nhận đúng kiểu đó,
 *  nên không có bước chuyển đổi nào để làm lệch. */
@Injectable()
export class ActorRepository {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly grants: RolePermissionRepository,
  ) {}

  async byId(id: string): Promise<Actor | null> {
    const [row] = await this.db.select().from(actor).where(eq(actor.id, id)).limit(1)
    if (!row) return null
    /* Axis 2 is data now, so building an `Actor` means reading it. A second
       round trip on this path, and the alternative — caching the matrix in
       memory — is what would let two server instances disagree about who may
       do what for as long as the cache lives. */
    const permissions = await this.grants.grantsFor(row.roleId)
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      roleId: row.roleId,
      permissions,
      branches: row.branches,
      ownOnly: row.ownOnly,
    }
  }
}
