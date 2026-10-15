import {
  OPPORTUNITY_ACCEPTED,
  OPPORTUNITY_OPENED,
  OPPORTUNITY_OWNERS_CHANGED,
  OPPORTUNITY_PRIMARY_CHANGED,
} from '@pv/engines'
import { NOTIFICATION_DETAIL_COUNT } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import type { Announcement, NotificationHub } from '@api/platform/notification/notification.hub'

/** What a deal door reports to the bell (ADR 0085), in the door's own `tx`.
 *  A door names the audiences and the facts; E4 picks who hears what. Plain
 *  functions, one copy each: create, import and stop share the first, and
 *  accept, assign and the profile save share the second. */

/** Overrides for the re-targets (a lead owner hears of the deal on the lead,
 *  ADR 0093 §7) and the import collapse (§4). `ref.code` stays the caller's
 *  `code`, so the event key does not move with the subject. */
type Retarget = { subject?: Announcement['subject']; detail?: Announcement['detail'] }

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
  } & Retarget,
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
    subject: deal.subject ?? { kind: 'opportunity', code: deal.code, label: deal.name },
    detail: deal.detail,
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
  } & Retarget,
): Promise<void> {
  return hub.announce(tx, {
    event: {
      name: OPPORTUNITY_OWNERS_CHANGED,
      ref: { code: change.code },
      actorId: change.actorId,
      audiences: moved(change.before, change.after),
      occurrence: change.occurrence,
    },
    subject: change.subject ?? { kind: 'opportunity', code: change.code, label: change.label },
    detail: change.detail,
  })
}

/** The Sale primary moved (ADR 0086). One line per act: whoever the same act
 *  added or removed already hears `announceOwners`, so only the people who
 *  stayed on the deal are told here. No touch id → `at` keys the line. */
export async function announcePrimary(
  tx: Db,
  hub: NotificationHub,
  change: {
    code: string
    label: string
    actorId: string
    before: readonly string[]
    after: readonly string[]
    from: string | null
    to: string | null
    occurrence: string | undefined
    at: Date
  },
): Promise<void> {
  if (change.from === change.to) return
  const { added, removed } = moved(change.before, change.after)
  const stayed = (id: string | null) =>
    id && !added.includes(id) && !removed.includes(id) ? [id] : []
  await hub.announce(tx, {
    event: {
      name: OPPORTUNITY_PRIMARY_CHANGED,
      ref: { code: change.code },
      actorId: change.actorId,
      audiences: { 'old-primary': stayed(change.from), 'new-primary': stayed(change.to) },
      occurrence: change.occurrence ?? change.at.toISOString(),
    },
    subject: { kind: 'opportunity', code: change.code, label: change.label },
  })
}

/** A deal was accepted. No occurrence: a deal is accepted once. */
export function announceAccepted(
  tx: Db,
  hub: NotificationHub,
  deal: { code: string; label: string; actorId: string; holders: readonly string[] } & Retarget,
): Promise<void> {
  return hub.announce(tx, {
    event: {
      name: OPPORTUNITY_ACCEPTED,
      ref: { code: deal.code },
      actorId: deal.actorId,
      audiences: { holders: deal.holders },
    },
    subject: deal.subject ?? { kind: 'opportunity', code: deal.code, label: deal.label },
  })
}

/** An import file's bell, rung once the batch receipt exists (ADR 0093 §4):
 *  one line per owner, and one for the acceptors when the deals wait for one.
 *  A single deal keeps today's line on that deal; several collapse into one
 *  `opportunity-batch` line keyed on the batch id, with the count in `detail`. */
export async function announceImport(
  tx: Db,
  hub: NotificationHub,
  file: {
    batchId: string
    fileName: string
    actorId: string
    deals: readonly { code: string; label: string; ownerIds: readonly string[]; touchId?: string }[]
    awaiting: boolean
  },
): Promise<void> {
  const batch = (n: number): Retarget => ({
    subject: { kind: 'opportunity-batch', code: file.batchId, label: file.fileName },
    detail: { [NOTIFICATION_DETAIL_COUNT]: n },
  })
  const byOwner = new Map<string, (typeof file.deals)[number][]>()
  for (const deal of file.deals) {
    for (const id of new Set(deal.ownerIds))
      byOwner
        .set(id, byOwner.get(id) ?? [])
        .get(id)
        ?.push(deal)
  }
  for (const [ownerId, deals] of byOwner) {
    const [one] = deals
    const to = { actorId: file.actorId, before: [], after: [ownerId] }
    await (deals.length === 1 && one
      ? announceOwners(tx, hub, {
          ...to,
          code: one.code,
          label: one.label,
          occurrence: one.touchId,
        })
      : announceOwners(tx, hub, {
          ...to,
          ...batch(deals.length),
          code: file.batchId,
          label: file.fileName,
          occurrence: undefined,
        }))
  }
  const [only] = file.deals
  if (!file.awaiting || !only) return
  const opened = { actorId: file.actorId, accepted: false, lost: false }
  await (file.deals.length === 1
    ? announceOpened(tx, hub, { ...opened, code: only.code, name: only.label })
    : announceOpened(tx, hub, {
        ...opened,
        ...batch(file.deals.length),
        code: file.batchId,
        name: file.fileName,
      }))
}

/** Ids new to and gone from a deal's people, across both lanes. */
function moved(before: readonly string[], after: readonly string[]) {
  return {
    added: after.filter((id) => !before.includes(id)),
    removed: before.filter((id) => !after.includes(id)),
  }
}
