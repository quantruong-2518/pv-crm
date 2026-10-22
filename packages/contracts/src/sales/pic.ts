import type { MeetingSide } from './meeting'
import type { OpportunityOwnerRole } from './opportunity'

/** Who stands on each stage of the sales flow — the one PIC rule table.
 *
 *  Descriptive, with no endpoint of its own: screens read lane labels and the
 *  `primary` flag from it. The server does not — its fences are the write
 *  doors and the database constraints, which these rows restate. Fixed in
 *  code, not configurable (ADR 0086).
 *
 *  `account` is absent on purpose: an account has no holder. Commission split
 *  and an SDR role are not modelled here (ADR 0082). */

/** Compile-time fence only: every row spells the same five fields. */
type Row = {
  role: string
  label: string
  cardinality: 'one' | 'many'
  mayBeEmpty: boolean
  primary: boolean
}

export const PIC_RULES = {
  // HOLDER = `ownerId` (the scope axis); BD_CREDIT = `bdOwnerId`;
  // MARKETING_CREDIT = `marketingOwnerId`. Credits never grant sight of the lead.
  lead: [
    {
      role: 'HOLDER',
      label: 'Người phụ trách',
      cardinality: 'one',
      mayBeEmpty: true,
      primary: false,
    },
    {
      role: 'BD_CREDIT',
      label: 'BD đã liên hệ',
      cardinality: 'one',
      mayBeEmpty: true,
      primary: false,
    },
    {
      role: 'MARKETING_CREDIT',
      label: 'Marketing phụ trách',
      cardinality: 'one',
      mayBeEmpty: true,
      primary: false,
    },
  ],
  // The stored `sales.opportunity_owner.role` values. A non-empty SALE lane has
  // exactly one primary; BD has none.
  opportunity: [
    {
      role: 'SALE' satisfies OpportunityOwnerRole,
      label: 'Sale đứng đơn',
      cardinality: 'many',
      mayBeEmpty: true,
      primary: true,
    },
    {
      role: 'BD' satisfies OpportunityOwnerRole,
      label: 'BD mở cửa',
      cardinality: 'many',
      mayBeEmpty: true,
      primary: false,
    },
  ],
  // OWNER = `sales.contract.owner_id`, whose commission; COLLECTOR =
  // `collector_id`, who chases payment. The SALE/BD snapshot
  // (`ContractRow.participants`) is copied from the deal, not a lane of its own.
  contract: [
    {
      role: 'OWNER',
      label: 'Người phụ trách',
      cardinality: 'one',
      mayBeEmpty: true,
      primary: false,
    },
    {
      role: 'COLLECTOR',
      label: 'Người thu tiền',
      cardinality: 'one',
      mayBeEmpty: false,
      primary: false,
    },
  ],
  // OWNER = `sales.campaign.owner_id`.
  campaign: [
    {
      role: 'OWNER',
      label: 'Người phụ trách',
      cardinality: 'one',
      mayBeEmpty: true,
      primary: false,
    },
  ],
  // The stored `MeetingSide` values, lowercase as that column keeps them.
  meeting: [
    {
      role: 'host' satisfies MeetingSide,
      label: 'Chủ trì',
      cardinality: 'many',
      mayBeEmpty: false,
      primary: false,
    },
    {
      role: 'guest' satisfies MeetingSide,
      label: 'Khách',
      cardinality: 'many',
      mayBeEmpty: true,
      primary: false,
    },
  ],
} as const satisfies Record<string, readonly Row[]>
