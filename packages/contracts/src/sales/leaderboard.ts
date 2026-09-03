import { z } from 'zod'
import { Dong, textNhap } from '../primitives'
import { RoleId } from '../auth'

/** `GET /sales/leaderboard` — one row per salesperson, the desk side by side.
 *
 *  Its own file and its own route because it belongs to no module: a row here
 *  joins leads, opportunities and contracts, so hanging it off any one of those
 *  three would make the other two reach across a module boundary to read it.
 *
 *  This is NOT the Performance screen's people table. That one scores a person
 *  against the KPI model of their ROLE (targets, pace, verdict) and deliberately
 *  refuses to rank. This one carries no targets and no verdict — it is the raw
 *  count of what each person is holding, which is the question an overview
 *  screen asks and the only one it can answer without a target table. */

/** What one person is holding. Every figure is a count or a sum over rows that
 *  person owns — nothing here is derived against a goal. */
export const LeaderboardRow = z.object({
  actorId: z.string().min(1).max(64),
  name: textNhap(120),
  roleId: RoleId,

  /** Leads whose `status` is still `running` and whose `owner_id` is this
   *  person. Leads they used to hold are not counted — the column answers
   *  "how much is on this desk today". */
  leadsOwned: z.number().int().nonnegative(),

  /** Deals still standing in a column, where this person is the `SALE` owner.
   *  A deal with two owners (Sale + BD) counts once, on the Sale. */
  opsOpen: z.number().int().nonnegative(),
  opsOpenAmountVnd: Dong,
  /** Open deals of theirs carrying no amount — missing from the sum above. */
  opsBlank: z.number().int().nonnegative(),

  won: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),

  /** Contracts where this person is `contract.owner_id`. Counted over the whole
   *  book, not a period — the overview has no period axis of its own and
   *  inventing one here would disagree with the Performance screen's. */
  signedCount: z.number().int().nonnegative(),
  signedAmountVnd: Dong,
})

/** The desk. Rows come back ordered by `signedAmountVnd` desc then name, so the
 *  screen can print it as-is; a screen that re-sorts is free to. */
export const SalesLeaderboard = z.object({
  rows: z.array(LeaderboardRow),
})

export type LeaderboardRow = z.infer<typeof LeaderboardRow>
export type SalesLeaderboard = z.infer<typeof SalesLeaderboard>
