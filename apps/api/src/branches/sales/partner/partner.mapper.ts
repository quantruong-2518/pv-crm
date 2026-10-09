import type { Partner } from '@pv/contracts'
import type { PartnerRowDb } from './partner.schema'

/** Table row → `Partner`. `contact_code` stays behind — see `PartnerCreate`. */
export function toContract(row: PartnerRowDb): Partner {
  return {
    code: row.code,
    ref: row.ref,
    name: row.name,
    originId: row.originId,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
