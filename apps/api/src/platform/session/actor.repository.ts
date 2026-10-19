import { eq } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '../db/db.module'
import { actor } from '../db/platform.schema'
import { toActor } from '../auth/auth.mapper'
import { RolePermissionRepository } from '../roles/role-permission.repository'
import type { Caller } from './caller'

/** Đọc người dùng. Bên trong `Caller` là đúng kiểu `Actor` của engine — E2
 *  nhận thẳng, không có bước chuyển đổi nào để làm lệch. Phần bọc ngoài chở
 *  đúng một cờ xác thực; lý do nó không nằm trong `Actor` ghi ở `caller.ts`. */
@Injectable()
export class ActorRepository {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly grants: RolePermissionRepository,
  ) {}

  async byId(id: string): Promise<Caller | null> {
    const [row] = await this.db.select().from(actor).where(eq(actor.id, id)).limit(1)
    if (!row) return null
    /* Axis 2 is data now, so building an `Actor` means reading it. A second
       round trip on this path, and the alternative — caching the matrix in
       memory — is what would let two server instances disagree about who may
       do what for as long as the cache lives. */
    const permissions = await this.grants.grantsFor(row.roleIds)
    return {
      actor: toActor(row, permissions),
      /* The header back door reads the same column as the cookie path. It is a
         development tool that `env.ts` refuses to boot with in production, but
         a tool that skips ONE gate is easier to reason about than one that
         quietly skips two. */
      owesPasswordChange: row.mustChangePasswordAt !== null,
    }
  }
}
