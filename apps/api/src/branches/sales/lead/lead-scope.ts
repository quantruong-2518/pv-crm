import { eq, type SQL } from 'drizzle-orm'
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
