import { OPPORTUNITY_OPENED, OPPORTUNITY_OWNERS_CHANGED } from '@pv/engines'
import type { Db } from '@api/platform/db/db.module'
import type { NotificationHub } from '@api/platform/notification/notification.hub'

/** What a deal door reports to the bell (ADR 0085), in the door's own `tx`.
 *  A door names the audiences and the facts; E4 picks who hears what. Plain
 *  functions, one copy each: create, import and stop share the first, and
 *  accept, assign and the profile save share the second. */

/** A deal entered the board, or died (`lost`) — ONE event for both, told apart
 *  by two facts about the row. `holders` is the stop door's: no rule reads it
 *  unless the deal is lost. `acceptors` is passed by a batch that already read
 *  the role audience once. */
export async function announceOpened(
  tx: Db,
  hub: NotificationHub,
  deal: {
    code: string
    name: string
    actorId: string
    holders?: readonly (string | null | undefined)[]
    accepted: boolean
    lost: boolean
  },
  acceptors?: readonly string[],
): Promise<void> {
  await hub.announce(tx, {
    event: {
      name: OPPORTUNITY_OPENED,
      ref: { code: deal.code },
      actorId: deal.actorId,
      audiences: {
        acceptors: acceptors ?? (await hub.holding(tx, 'opportunity.accept', 'Sales')),
        holders: (deal.holders ?? []).filter((id): id is string => !!id),
      },
      data: { lost: deal.lost, accepted: deal.accepted },
    },
    subject: { kind: 'opportunity', code: deal.code, label: deal.name },
  })
}

/** Who entered and who left a deal's people. Ids are compared across BOTH
 *  lanes, so someone moving between SALE and BD is told nothing. */
export function announceOwners(
  tx: Db,
  hub: NotificationHub,
  change: {
    code: string
    label: string
    /** Absent when nobody at a keyboard did it. */
    actorId: string | undefined
    before: readonly string[]
    after: readonly string[]
    /** The touch written for the change: a second change must ring again. */
    occurrence: string | undefined
  },
): Promise<void> {
  const { before, after } = change
  return hub.announce(tx, {
    event: {
      name: OPPORTUNITY_OWNERS_CHANGED,
      ref: { code: change.code },
      actorId: change.actorId,
      audiences: {
        added: after.filter((id) => !before.includes(id)),
        removed: before.filter((id) => !after.includes(id)),
      },
      occurrence: change.occurrence,
    },
    subject: { kind: 'opportunity', code: change.code, label: change.label },
  })
}
