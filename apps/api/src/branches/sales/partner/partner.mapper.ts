import type { Partner } from '@pv/contracts'
import type { PartnerRowDb } from './partner.schema'

/** Table row → `Partner`. Every column travels; only the dates change shape. */
export function toContract(row: PartnerRowDb): Partner {
  return {
    code: row.code,
    name: row.name,
    originId: row.originId,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
