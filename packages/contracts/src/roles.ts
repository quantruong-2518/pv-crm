import { z } from 'zod'
import { Permission, RoleId } from './auth'

/** The ROLE → PERMISSION MATRIX on the wire — a compile-time constant in
 *  `@pv/engines` until 14/09, editable data ever since.
 *
 *  Carries no display labels. The screen owns the Vietnamese wording for a role
 *  and for a permission (`ROLE_LABEL` already does exactly that for roles), and
 *  it groups permissions by the resource prefix of the key itself. Putting
 *  labels here would make the server keep a table of words only one screen ever
 *  reads. */

/** One ROW of the matrix: what this role may do today. */
export const RoleGrants = z.object({
  roleId: RoleId,
  permissions: z.array(Permission),
})

/** The whole matrix. Seven rows, unpaged — the number of roles is a constant of
 *  the product, and the screen needs every row at once to draw the grid. */
export const RoleMatrixView = z.object({ rows: z.array(RoleGrants) })

/** Replace a role's ENTIRE grant set, rather than send a list of adds and
 *  removes.
 *
 *  The screen shows a whole row and saves a whole row, so sending the whole row
 *  describes what the person actually did. A delta API (`grant: […]`,
 *  `revoke: […]`) sounds more flexible and buys one situation nobody wants: two
 *  administrators open the same role, each sends a delta, and the result is a
 *  grant set neither of them intended — while both screens reported success.
 *
 *  Whole-row replacement means the later writer wins, visibly, and the audit
 *  entry says what changed. The cost is that it CANNOT tell that somebody else
 *  just edited the row; the day more than two people hold `role.manage`, this
 *  needs a version marker to reject a stale write. */
export const RoleGrantsPatch = z.object({ permissions: z.array(Permission) })

export type RoleGrants = z.infer<typeof RoleGrants>
export type RoleMatrixView = z.infer<typeof RoleMatrixView>
export type RoleGrantsPatch = z.infer<typeof RoleGrantsPatch>
