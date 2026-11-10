import type { AccessControl, Actor } from '@pv/engines'
import type { KpiScope } from '@pv/contracts'

/** Whose pipeline line a reader sees, per metric scope; `null` computes none
 *  (the alert sweep). */
export type Sees = ((actorId: string, scope: KpiScope) => boolean) | null

/** The weighted pipeline is the deal book's figure (ADR 0143 §5), so reading
 *  any of it needs the whole book: `opportunity.view` without `ownOnly`. An own
 *  figure is also its owner's; someone else's, or a room figure (the whole
 *  book's), needs `kpi.view-all` unless it is the reader's own seat. */
export function pipelineSight(access: AccessControl, who: Actor): NonNullable<Sees> {
  const book = access.allows(who, 'opportunity.view') && !who.ownOnly
  const all = access.allows(who, 'kpi.view-all')
  return (actorId, scope) =>
    scope === 'room' ? book && (actorId === who.id || all) : actorId === who.id || (all && book)
}
