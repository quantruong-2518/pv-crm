import { eq } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { DB, type Db } from '../db/db.module'
import { actor } from '../db/platform.schema'

/** Đọc người dùng. Trả thẳng kiểu `Actor` của engine — E2 nhận đúng kiểu đó,
 *  nên không có bước chuyển đổi nào để làm lệch. */
@Injectable()
export class ActorRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async byId(id: string): Promise<Actor | null> {
    const [row] = await this.db.select().from(actor).where(eq(actor.id, id)).limit(1)
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      roleId: row.roleId,
      branches: row.branches,
      ownOnly: row.ownOnly,
    }
  }
}
