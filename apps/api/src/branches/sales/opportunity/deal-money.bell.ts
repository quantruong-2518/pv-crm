import { CONTRACT_SIGNED, OPPORTUNITY_STAGE_MOVED, QUOTATION_RECORDED } from '@pv/engines'
import {
  NOTIFICATION_DETAIL_CONTRACT,
  NOTIFICATION_DETAIL_STAGE,
  OPPORTUNITY_STAGE_LABEL,
  type StageKey,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import type { NotificationHub } from '@api/platform/notification/notification.hub'
import type { OpportunityRepository } from './opportunity.repository'

/** What a deal's money path tells the bell (ADR 0093 §6): a column moved, a
 *  quotation round landed, a contract was signed. One act rings one line —
 *  the precedence (superseded > stage moved > new round) is the callers'. */

type Deal = { code: string; label: string; actorId: string | undefined }

/** Everyone on the deal's two lanes, from the owners read the book already
 *  uses. A bell-only read: a failure rings nobody and keeps the write. */
export function dealOwnerIds(
  tx: Db,
  hub: NotificationHub,
  deals: OpportunityRepository,
  code: string,
): Promise<string[]> {
  return hub.bellRead(tx, `owners of ${code}`, [], async (savepoint) =>
    ((await deals.ownersOf(savepoint, [code])).get(code) ?? []).map((o) => o.id),
  )
}

/** The deal entered `engaged` or `quotation`. Forward-only, so the column is
 *  enough to key the line: a deal enters each column once. */
export function announceStageMoved(
  tx: Db,
  hub: NotificationHub,
  move: Deal & { to: StageKey; owners: readonly string[] },
): Promise<void> {
  return hub.announce(tx, {
    event: {
      name: OPPORTUNITY_STAGE_MOVED,
      ref: { code: move.code },
      actorId: move.actorId,
      audiences: { owners: move.owners },
      occurrence: move.to,
    },
    subject: { kind: 'opportunity', code: move.code, label: move.label },
    detail: { [NOTIFICATION_DETAIL_STAGE]: OPPORTUNITY_STAGE_LABEL[move.to] },
  })
}

/** A quotation round was recorded; the new ledger row keys the line. */
export function announceRound(
  tx: Db,
  hub: NotificationHub,
  round: Deal & { roundId: string; superseded: boolean; owners: readonly string[] },
): Promise<void> {
  return hub.announce(tx, {
    event: {
      name: QUOTATION_RECORDED,
      ref: { code: round.code },
      actorId: round.actorId,
      audiences: { owners: round.owners },
      occurrence: round.roundId,
      data: { superseded: round.superseded },
    },
    subject: { kind: 'opportunity', code: round.code, label: round.label },
  })
}

/** A contract was signed on the deal. Keyed on the contract, so a won deal
 *  signing again rings again. `skip` leaves out someone another line already
 *  tells — the raiser of an approved request hears `approval-approved`. */
export function announceSigned(
  tx: Db,
  hub: NotificationHub,
  sign: Deal & {
    contractCode: string
    director: readonly string[]
    owners: readonly string[]
    commissionOwner: string | undefined
    skip: readonly string[]
  },
): Promise<void> {
  const keep = (ids: readonly string[]) => ids.filter((id) => !sign.skip.includes(id))
  return hub.announce(tx, {
    event: {
      name: CONTRACT_SIGNED,
      ref: { code: sign.contractCode },
      actorId: sign.actorId,
      audiences: {
        director: keep(sign.director),
        owners: keep(sign.owners),
        'commission-owner': keep(sign.commissionOwner ? [sign.commissionOwner] : []),
      },
    },
    subject: { kind: 'opportunity', code: sign.code, label: sign.label },
    detail: { [NOTIFICATION_DETAIL_CONTRACT]: sign.contractCode },
  })
}
