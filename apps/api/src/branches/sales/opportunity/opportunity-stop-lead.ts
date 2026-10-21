import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import type { LeadAfterStop, OpportunityOwner } from '@pv/contracts'
import { toActor } from '@api/platform/auth/auth.mapper'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { ACCESS } from '@api/platform/engines/tokens'
import { RolePermissionRepository } from '@api/platform/roles/role-permission.repository'
import { movesLead } from '../lead/lead-exit.service'
import { lead } from '../lead/lead.schema'
import { leadLive } from '../lead/lead-scope'
import { dealOpen, leadHasContract } from '../open-deal'
import type { OpportunityRead } from './opportunity.repository'

/** The stop of a lead's last live deal asks its stopper where the lead goes
 *  (owner, 15/10/2026), replacing the automatic park of ADR 0069 §3 (and 0097
 *  §2 as first built). The profile read and the stop door both ask `options`,
 *  so what the drawer offers is exactly what the door accepts. */

export type LeadAfterOptions = { holders: Actor[]; canStop: boolean }

@Injectable()
export class LeadAfterStopRule {
  constructor(
    @Inject(ACCESS) private readonly access: AccessControl,
    private readonly grants: RolePermissionRepository,
  ) {}

  /** The profile's `leadAfterStop`: set when this open deal is the last one of
   *  a `converted` lead with nothing signed. Read outside any lock; the stop
   *  door judges the same fact again under its own. */
  async of(db: Db, who: Actor, found: OpportunityRead): Promise<LeadAfterStop | null> {
    if (found.row.state !== 'open' || found.signed) return null
    const [last] = await db
      .select({ ownerId: lead.ownerId })
      .from(lead)
      .where(
        and(
          eq(lead.code, found.row.leadCode),
          eq(lead.state, 'converted'),
          leadLive,
          sql`NOT ${leadHasContract(lead.code)}`,
          sql`NOT EXISTS (SELECT 1 FROM sales.opportunity sl_o WHERE sl_o.lead_code = ${lead.code} AND sl_o.code <> ${found.row.code} AND ${dealOpen(sql`sl_o.code`, sql`sl_o.state`)})`,
        ),
      )
    if (!last) return null
    const { holders, canStop } = await this.options(db, who, last.ownerId, found.owners)
    return { holders: holders.map(({ id, name }) => ({ id, name })), canStop }
  }

  /** Holders: unlocked people who may work a lead (`lead.edit`), in the order
   *  lead holder, primary Sale, stopper, rest of the SALE lane. Without
   *  `lead.assign` only the first of the first three — the owner door's rule
   *  (`LeadWriteService.setOwner`). `canStop` is the lead exit door's own gate:
   *  `lead.disqualify` and its scope (`movesLead`). */
  async options(
    db: Db,
    who: Actor,
    leadOwnerId: string | null,
    owners: readonly OpportunityOwner[],
  ): Promise<LeadAfterOptions> {
    const sale = owners.filter((o) => o.role === 'SALE')
    const head = [leadOwnerId, sale.find((o) => o.primary)?.id, who.id]
    const chain = [...new Set([...head, ...sale.map((o) => o.id)])].filter(
      (id): id is string => typeof id === 'string',
    )
    const rows = await db
      .select()
      .from(actor)
      .where(and(inArray(actor.id, chain), isNull(actor.disabledAt)))
    const eligible: Actor[] = []
    /* Grants on `db`, not the pool: inside the stop the tx holds PGlite's one connection. */
    const matrix = await this.grants.allGrants(db)
    for (const row of chain.flatMap((id) => rows.filter((r) => r.id === id))) {
      const granted = [...new Set(row.roleIds.flatMap((roleId) => matrix.get(roleId) ?? []))].sort()
      const them = toActor(row, granted)
      if (this.may(them, 'lead.edit')) eligible.push(them)
    }
    const first = eligible.find((h) => head.includes(h.id))
    return {
      holders: this.may(who, 'lead.assign') ? eligible : first ? [first] : [],
      canStop: this.may(who, 'lead.disqualify') && movesLead(who, leadOwnerId),
    }
  }

  private may(who: Actor, permission: 'lead.edit' | 'lead.assign' | 'lead.disqualify'): boolean {
    return this.access.check(who, { branch: 'Sales', permission }).ok
  }
}
