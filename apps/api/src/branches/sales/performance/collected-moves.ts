import { sql, type SQL } from 'drizzle-orm'
import { toVndSql } from '../money'

/** THE one reading of "money collected", asked by KPI `collected-value` and the
 *  overview's money read alike, so the two cannot print different sums.
 *
 *  Cash stays on its paid day even if the contract is terminated later; the
 *  refund is a negative row on the termination day (ADR 0119). A lead switched
 *  off takes its contracts with it, as everywhere money is read.
 *
 *  Rows of `(contract_code, installment_no, label, at, vnd, signed_at)`;
 *  `installment_no` is NULL on a refund. `fence` cuts the moment column, so
 *  each caller keeps its own span form. Private `cm_` aliases, `open-deal.ts`'s
 *  reason: the fragment nests inside queries with their own `k` and `l`. */
export const collectedMoves = (fence: (at: SQL) => SQL): SQL => sql`
  SELECT cm_k.code AS contract_code, cm_i.no AS installment_no, cm_i.label, cm_i.paid_at AS at,
         ${toVndSql(sql`cm_i.amount`, sql`cm_k.currency`)} AS vnd, cm_k.signed_at
    FROM sales.contract_installment cm_i
    JOIN sales.contract cm_k ON cm_k.code = cm_i.contract_code
    JOIN sales.lead cm_l ON cm_l.code = cm_k.lead_code AND cm_l.disabled_at IS NULL
   WHERE ${fence(sql`cm_i.paid_at`)}
  UNION ALL
  SELECT cm_k.code, NULL::int, NULL::text, cm_t.terminated_at,
         -(${toVndSql(sql`cm_t.refunded_amount`, sql`cm_k.currency`)}), cm_k.signed_at
    FROM sales.contract_termination cm_t
    JOIN sales.contract cm_k ON cm_k.code = cm_t.contract_code
    JOIN sales.lead cm_l ON cm_l.code = cm_k.lead_code AND cm_l.disabled_at IS NULL
   WHERE cm_t.refunded_amount > 0 AND ${fence(sql`cm_t.terminated_at`)}`
