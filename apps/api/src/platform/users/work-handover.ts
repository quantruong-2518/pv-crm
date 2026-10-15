import type { Actor } from '@pv/engines'
import type { UserHoldingsResponse } from '@pv/contracts'
import type { Db } from '../db/db.module'

/** THE SEAM BETWEEN LOCKING AN ACCOUNT AND THE WORK THAT ACCOUNT STILL HOLDS.
 *
 *  Locking asks "what open work is on this person, and who takes it" (ADR
 *  0088 §14, 0097 §7) — `sales` rows `platform/` may not import. So the
 *  dependency runs backward, the `PIN_REACH` way: users ask through this
 *  token, the Sales branch answers, and `app.module.ts` is the one file that
 *  names both (`UsersModule.withHandover`).
 *
 *  Unbound, the server still boots but every lock and every holdings read
 *  fails closed (500): failing open would lock an account with work on it. */
export interface WorkHandover {
  /** What would move, counted with the same predicates `handOver` moves by. */
  holdings(tx: Db, userId: string): Promise<UserHoldingsResponse>
  /** May `toId` receive sales work. Throws a 400 on `handoverTo` when not.
   *  Asked BEFORE the lock's transaction: it reads on the pool. */
  vetReceiver(toId: string): Promise<void>
  /** Moves everything `holdings` counted, inside the lock's transaction. */
  handOver(tx: Db, move: { fromId: string; toId: string; by: Actor }): Promise<void>
}

export const WORK_HANDOVER = Symbol('pv.users.work-handover')
