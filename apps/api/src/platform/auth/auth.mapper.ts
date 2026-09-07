import type { Actor, RoleId as EngineRoleId } from '@pv/engines'
import type {
  RoleId as ContractRoleId,
  SessionActor,
  SessionView,
  SessionWindow,
} from '@pv/contracts'
import type { ActorRow } from '../db/platform.schema'
import type { SessionRow } from './auth.schema'

/** THE ONE PLACE THE CONTRACT'S ROLE UNION MEETS THE ENGINE'S.
 *
 *  The two used to be spelled differently — Vietnamese in E2, ASCII on the wire
 *  — and two exhaustive `Record<>`s translated between them. They are one
 *  spelling now, and `platform.actor.role_id` stores that value verbatim, so
 *  the translation collapses into the two SIGNATURES below.
 *
 *  Those signatures are still the check, and it is the same check: assigning an
 *  `EngineRoleId` where a `ContractRoleId` is wanted only compiles while every
 *  role exists on both sides, and the other direction closes the loop. A role
 *  added to `@pv/engines` and forgotten in `@pv/contracts` is a RED BUILD here.
 *
 *  Letting one through fails nowhere visible, which is why the check is worth a
 *  function that returns its argument: E2's `allows` answers false for a key
 *  missing from `ROLE_PERMISSIONS`, so the person signs in, their name is in
 *  the corner, and every screen reports "hidden by your permissions" — a
 *  permission bug in appearance, a missing enum member in fact. */
export const toContractRole = (r: EngineRoleId): ContractRoleId => r

/** Wire spelling → DB/engine spelling.
 *
 *  The only supported way to turn a `RoleId` that arrived over HTTP into a
 *  value fit for `platform.actor.role_id`. Identity like its mirror, and kept
 *  for the same two reasons: it is half of the compile-time equality above, and
 *  it marks the `/users` write path as having gone through the contract's enum
 *  rather than straight from a request body. */
export const toEngineRole = (r: ContractRoleId): EngineRoleId => r

/** The row as E2 wants it — seven fields, no credentials.
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
