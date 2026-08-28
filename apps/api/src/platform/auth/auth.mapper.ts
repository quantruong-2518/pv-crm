import type { Actor, RoleId as EngineRoleId } from '@pv/engines'
import type {
  RoleId as ContractRoleId,
  SessionActor,
  SessionView,
  SessionWindow,
} from '@pv/contracts'
import type { ActorRow } from '../db/platform.schema'
import type { SessionRow } from './auth.schema'

/** THE ONE PLACE THE TWO SPELLINGS OF A ROLE MEET.
 *
 *  ------------------------------------------------------------------
 *  WHY THERE ARE TWO SPELLINGS AT ALL
 *  ------------------------------------------------------------------
 *  `@pv/engines` spells roles in Vietnamese (`'trưởng-phòng'`) because a person
 *  reading `ROLE_PERMISSIONS` should read the role, not a translation of it.
 *  `@pv/contracts` re-declares the same six in ASCII because a key that crosses
 *  HTTP, a URL and a log line must not depend on everyone's encoding being
 *  right — the same trade `problem.ts` makes for `DenyReason`, and the contract
 *  says so in its own docblock.
 *
 *  `platform.actor.role_id` keeps the VIETNAMESE value. That is not an
 *  accident of seeding: the column is what E2 reads through `Actor.roleId`, and
 *  E2 is the half that must run identically on the server and in the browser.
 *  Storing ASCII would mean translating on every read on the hot path instead
 *  of at the two edges where a wire format is actually involved.
 *
 *  ------------------------------------------------------------------
 *  TWO EXHAUSTIVE `Record<>`s, AND THAT IS THE WHOLE POINT
 *  ------------------------------------------------------------------
 *  Exactly the pattern `access.guard.ts` uses for `DenyReason`, for exactly the
 *  same failure. A `Record<EngineRoleId, …>` has no valid value with a key
 *  missing, so adding a seventh role to E2 and forgetting it here is a RED
 *  BUILD — not a screen that receives a role string it cannot read, weeks
 *  later, in front of a customer. Both directions are declared because both
 *  directions are travelled: rows come out ASCII-side for the browser, and the
 *  `/users` door will write them back Vietnamese-side into the column.
 *
 *  A `Record` and not a `switch`: a switch with a `default` is exactly the
 *  shape that swallows the new value silently. */
const CONTRACT_ROLE: Record<EngineRoleId, ContractRoleId> = {
  'giám-đốc': 'director',
  'trưởng-phòng': 'head-of-sales',
  marketing: 'marketing',
  bd: 'bd',
  presales: 'presales',
  sale: 'sale',
}

const ENGINE_ROLE: Record<ContractRoleId, EngineRoleId> = {
  director: 'giám-đốc',
  'head-of-sales': 'trưởng-phòng',
  marketing: 'marketing',
  bd: 'bd',
  presales: 'presales',
  sale: 'sale',
}

/** DB/engine spelling → wire spelling. */
export const toContractRole = (r: EngineRoleId): ContractRoleId => CONTRACT_ROLE[r]

/** Wire spelling → DB/engine spelling.
 *
 *  The only supported way to turn a `RoleId` that arrived over HTTP into a
 *  value fit for `platform.actor.role_id`. It has no caller in this module —
 *  the sign-in flow only ever reads people — and exists because the `/users`
 *  door creates and edits them. Writing that column from a raw request string
 *  instead would put a role E2 cannot read into the permission matrix, where it
 *  reads as "no permissions at all" and looks like a bug in the matrix. */
export const toEngineRole = (r: ContractRoleId): EngineRoleId => ENGINE_ROLE[r]

/** The row as E2 wants it — Vietnamese `roleId`, seven fields, no credentials.
 *
 *  This is what `req.actor` must hold. `password_hash` and `disabled_at` are
 *  dropped here and that is the point of the function existing: everything
 *  downstream of the guard receives an object that CANNOT leak a credential,
 *  because the shape has nowhere to put one. */
export function toActor(row: ActorRow): Actor {
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

/** The same person as the browser is allowed to see them — ASCII `roleId`. */
export function toSessionActor(row: ActorRow): SessionActor {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    roleId: toContractRole(row.roleId),
    branches: row.branches,
    ownOnly: row.ownOnly,
  }
}

/** When this session dies, in the two marks the screen needs.
 *
 *  ISO strings with a timezone, per the `Moc` primitive — never epoch numbers.
 *  The browser arms its "phiên sắp hết hạn" countdown off these, and a moment
 *  without a zone is a moment that means something different on a laptop set to
 *  UTC than on one set to Asia/Ho_Chi_Minh. */
export function toWindow(row: SessionRow): SessionWindow {
  return {
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    idleUntil: row.idleUntil ? row.idleUntil.toISOString() : null,
  }
}

export function toSessionView(actorRow: ActorRow, sessionRow: SessionRow): SessionView {
  return { actor: toSessionActor(actorRow), session: toWindow(sessionRow) }
}
