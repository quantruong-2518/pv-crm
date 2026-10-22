import { Inject, Injectable } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'
import type { AccessControl, Permission } from '@pv/engines'
import type { ContractCollectorCandidate } from '@pv/contracts'
import { toActor } from '@api/platform/auth/auth.mapper'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor, type ActorRow } from '@api/platform/db/platform.schema'
import { ACCESS } from '@api/platform/engines/tokens'
import { invalid } from '@api/platform/http/problem'
import { RolePermissionRepository } from '@api/platform/roles/role-permission.repository'

const COLLECT: Permission = 'contract.record-payment'
const NOT_COLLECTOR = 'Người thu tiền phải đang hoạt động và có quyền ghi thu.'

/** Who may be named a contract's payment PIC: an active actor the guard would
 *  let through `contract.record-payment`. ONE copy for the picker and for the
 *  sign door's refusal, so the list never offers someone the door then rejects.
 *  Reads go through `handle` — under a held transaction a pool read would wait. */
@Injectable()
export class ContractCollectors {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly grants: RolePermissionRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  private may(row: ActorRow, granted: readonly Permission[]): boolean {
    return this.access.check(toActor(row, granted), { branch: 'Sales', permission: COLLECT }).ok
  }

  async candidates(handle: Db = this.db): Promise<ContractCollectorCandidate[]> {
    const rows = await handle
      .select()
      .from(actor)
      .where(isNull(actor.disabledAt))
      .orderBy(actor.name, actor.id)
    const matrix = await this.grants.allGrants(handle)
    return rows
      .filter((r) => this.may(r, [...new Set(r.roleIds.flatMap((id) => matrix.get(id) ?? []))]))
      .map((r) => ({ id: r.id, name: r.name, role: r.role }))
  }

  async assertPick(handle: Db, id: string): Promise<void> {
    const [row] = await handle
      .select()
      .from(actor)
      .where(and(eq(actor.id, id), isNull(actor.disabledAt)))
      .limit(1)
    if (row && this.may(row, await this.grants.grantsFor(row.roleIds, handle))) return
    throw invalid({ collectorId: [NOT_COLLECTOR] }, NOT_COLLECTOR)
  }
}
