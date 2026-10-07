import { isNull, eq, type SQL } from 'drizzle-orm'
import type { Actor } from '@pv/engines'
import { lead } from './lead.schema'

/** THE lead book's scope axis (axis 3): by actor `id`, never by display name.
 *
 *  Lives outside `LeadRepository` so a reader of leads from another module (the
 *  opportunity drawer lists contacts of sibling leads) asks the same predicate
 *  instead of spelling `owner_id = $actor` a second time. `undefined` = the axis
 *  cuts nothing, which Drizzle reads as "no condition" inside `and(...)`. */
export function leadScope(who: Pick<Actor, 'id' | 'ownOnly'>, scoped: boolean): SQL | undefined {
  return scoped && who.ownOnly ? eq(lead.ownerId, who.id) : undefined
}

/** A lead nobody has switched off. EVERY reader that lists, counts or joins
 *  `sales.lead` puts this in its WHERE — a disabled lead is absent, not
 *  "hidden by permission", so it never goes inside `leadScope` (whose rows the
 *  books report as `hidden`). Deals and contracts have no flag of their own:
 *  they are off exactly when the lead they hang from is. */
export const leadLive: SQL = isNull(lead.disabledAt)
