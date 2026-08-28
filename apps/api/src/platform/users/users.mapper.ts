import type { Branch, RoleId as EngineRoleId } from '@pv/engines'
import type { UserCreate, UserPatch, UserRow } from '@pv/contracts'
import { toEngineRole, toSessionActor } from '../auth/auth.mapper'
import type { ActorRow } from '../db/platform.schema'

/** THE PEOPLE BOOK'S TWO DIRECTIONS — row → admin DTO, and body → columns.
 *
 *  ------------------------------------------------------------------
 *  THIS FILE OWNS NO ROLE TABLE, AND THAT IS THE POINT
 *  ------------------------------------------------------------------
 *  `auth.mapper.ts` already holds the two exhaustive `Record<>`s that translate
 *  between the engine's Vietnamese `RoleId` and the contract's ASCII one, and
 *  it explains at length why a `Record` rather than a `switch`: adding a
 *  seventh role to E2 must be a red build, not a screen receiving a string it
 *  cannot read. A third copy here would be a third thing to remember on that
 *  day, and the one that gets forgotten — so `toSessionActor` and
 *  `toEngineRole` are imported, never re-derived.
 *
 *  `toEngineRole` had no caller until this module existed; its docblock says so
 *  and says why it was written anyway. This is that caller. */

/** The core licence every account needs. Not a `Branch` literal scattered
 *  around: it appears in three decisions below and in the screen's own
 *  `CORE_BRANCH`, and a typo'd sixth branch name would fail silently — E2 reads
 *  `branches` as a list of licences, so an unknown string is simply a licence
 *  nobody has, i.e. a person who sees nothing and no error anywhere. */
const CORE: Branch = 'One'

/** Every account carries `One`, whatever the caller sent.
 *
 *  `UserCreate.branches` has no minimum and the contract says the server adds
 *  the core when it is absent. That is not tidying: One Core is what draws the
 *  home page, the nav shell and the search bar, so an account without it opens
 *  to a licence refusal on the first screen it touches — a person who cannot
 *  reach the home page is not an account, they are a support ticket.
 *
 *  Applied on PATCH as well as on POST, which the contract does not spell out
 *  because the screen makes One unremovable (`toggleBranch` refuses to filter
 *  it out). The screen is a courtesy; `curl -X PATCH -d '{"branches":["Sales"]}'`
 *  is the case this line is here for, and the failure it produces is identical.
 *
 *  Deduplicated on the way through: `z.array(Branch).max(5)` counts entries and
 *  not distinct values, so five copies of `Sales` is a legal body, and a
 *  licence list holding one name twice is a list that answers "which lines has
 *  this company bought" with a number that is wrong. */
export const withCore = (branches: readonly Branch[]): Branch[] => [
  ...new Set<Branch>([CORE, ...branches]),
]

/** The row as an administrator is allowed to see it.
 *
 *  `toSessionActor` supplies the seven fields the browser already receives for
 *  the signed-in person; this adds the three facts that only somebody holding
 *  `người-dùng.quản-lý` has any business reading.
 *
 *  `passwordSet` is computed from the hash and NEVER carries it — the shape
 *  going out has nowhere to put a credential, which is the same property
 *  `toActor` exists for on the guard's side. `password_hash IS NULL` is an
 *  ordinary state, not a broken row: it is an account whose owner has not
 *  followed the invite yet, and the screen prints "Chờ đặt mật khẩu" for it. */
export function toUserRow(row: ActorRow): UserRow {
  return {
    ...toSessionActor(row),
    passwordSet: row.passwordHash !== null,
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}

/** What `INSERT INTO platform.actor` needs. `id` comes from the caller because
 *  the column has no default and choosing it is a decision with rules of its
 *  own — see `UsersService.create`. */
export type ActorDraft = {
  id: string
  name: string
  email: string
  role: string
  roleId: EngineRoleId
  branches: Branch[]
  ownOnly: boolean
}

export function toActorDraft(id: string, body: UserCreate): ActorDraft {
  return {
    id,
    name: body.name,
    email: body.email,
    role: body.role,
    /* Vietnamese in the column, ASCII on the wire. `auth.mapper.ts` explains
       which side stores which and why storing ASCII would mean translating on
       every permission check instead of at the two edges that touch a wire. */
    roleId: toEngineRole(body.roleId),
    branches: withCore(body.branches),
    ownOnly: body.ownOnly,
  }
}

/** The columns a PATCH touches. Absent key = column untouched.
 *
 *  `password_hash` is not in this type and cannot be added by accident, which
 *  is the whole reason the patch does not go to the table as an object built
 *  inline at the call site: `UserPatch` has no password field on purpose, and a
 *  loosely typed `set` object is where that purpose would eventually leak. */
export type ActorColumns = {
  name?: string
  role?: string
  roleId?: EngineRoleId
  branches?: Branch[]
  ownOnly?: boolean
  disabledAt?: Date | null
}

/** `UserPatch` → columns. Compares against `undefined`, never against
 *  truthiness: `ownOnly: false` and `disabled: false` are both values that must
 *  reach the table, and `if (patch.ownOnly)` would silently drop the half of
 *  every toggle that turns something off. Same rule `SalesConfigRepository`
 *  writes out for its own `set` object. */
export function toActorColumns(patch: UserPatch): ActorColumns {
  const columns: ActorColumns = {}
  if (patch.name !== undefined) columns.name = patch.name
  if (patch.role !== undefined) columns.role = patch.role
  if (patch.roleId !== undefined) columns.roleId = toEngineRole(patch.roleId)
  if (patch.branches !== undefined) columns.branches = withCore(patch.branches)
  if (patch.ownOnly !== undefined) columns.ownOnly = patch.ownOnly
  /* `disabled` is a boolean on the wire and a MOMENT in the table. The column
     is a timestamp because "khoá từ bao giờ" is the question actually asked
     about a locked account and a boolean answers it with a shrug — see
     `platform.schema.ts`. The service decides whether this stamp is allowed to
     move; here it is only translated. */
  if (patch.disabled !== undefined) columns.disabledAt = patch.disabled ? new Date() : null
  return columns
}
