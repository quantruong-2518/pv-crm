import { sql, type SQL } from 'drizzle-orm'
import { ORDER, TABLES, type TableKey } from './tables'

/** The rows one run writes: one insert array per table, keyed as in `TABLES`
 *  (`plan.lead`, `plan.opportunityOwner`, `plan.object` for platform.object).
 *  Row types are drizzle's own `$inferInsert`, so a column rename breaks here. */

export type Plan = { [K in TableKey]: (typeof TABLES)[K]['$inferInsert'][] }

export const emptyPlan = (): Plan =>
  Object.fromEntries(ORDER.map((key) => [key, []])) as unknown as Plan

/** Human code families, each off its own real sequence so a later door write
 *  cannot collide with a seeded code. `prefix` may be SQL (scan batches embed
 *  the DB month: a seeded SCN code carries the run month, not the seeded one). */
export const SEQUENCES = {
  AC: { prefix: 'AC-', seq: 'sales.account_code_seq', width: 4 },
  WS: { prefix: 'WS-', seq: 'sales.workstream_code_seq', width: 4 },
  LD: { prefix: 'LD-', seq: 'sales.lead_code_seq', width: 4 },
  CT: { prefix: 'CT-', seq: 'sales.contact_code_seq', width: 4 },
  OP: { prefix: 'OP-', seq: 'sales.opportunity_code_seq', width: 4 },
  HĐ: { prefix: 'HĐ-', seq: 'sales.contract_code_seq', width: 4 },
  CP: { prefix: 'CP-', seq: 'sales.campaign_code_seq', width: 4 },
  REF: { prefix: 'REF-', seq: 'sales.partner_code_seq', width: 4 },
  SCN: {
    prefix: sql`'SCN-' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMM') || '-'` as
      string | SQL,
    seq: 'sales.scan_batch_code_seq',
    width: 2,
  },
} as const satisfies Record<string, { prefix: string | SQL; seq: string; width: number }>

export type CodeKind = keyof typeof SEQUENCES

/** Draws the next code of a family. The build runs twice (count, then draw), so
 *  an emitter must never branch on a code's value or call `new Date()`. */
export type Mint = (kind: CodeKind) => string
