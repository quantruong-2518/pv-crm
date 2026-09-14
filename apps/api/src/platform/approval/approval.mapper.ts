import type { ApprovalRequestView } from '@pv/contracts'
import type { ApprovalLinkRowDb, ApprovalRowDb } from './approval.schema'

/** Rows ↔ wire. Decides nothing, reads nothing.
 *
 *  `payload` never crosses: it is the branch's own description of the change,
 *  opaque to this layer and meaningless to a screen that did not write it. What
 *  the screen shows is `consequence`, the sentence the branch wrote for a human
 *  when the request was raised. Sending the payload as well would invite a
 *  screen to render it, and then `platform` would have a second, accidental
 *  contract with every branch. */
export function toContract(
  row: ApprovalRowDb,
  links: readonly ApprovalLinkRowDb[],
): ApprovalRequestView {
  return {
    id: row.id,
    kind: row.kind,
    links: links.map((l) => ({ objectCode: l.objectCode, objectLabel: l.objectLabel })),
    raisedBy: row.raisedBy,
    raisedAt: row.raisedAt.toISOString(),
    fromAi: row.fromAi,
    ...(row.basis ? { basis: row.basis } : {}),
    chain: row.chain,
    state: row.state,
    consequence: row.consequence,
    /* NULL becomes ABSENT, never `null`: the contract uses `.optional()`, and a
       `null` there is a 500 at parse time rather than an empty field. Same note
       as `touch.mapper.ts`. */
    ...(row.decidedAt ? { decidedAt: row.decidedAt.toISOString() } : {}),
    ...(row.decidedBy ? { decidedBy: row.decidedBy } : {}),
    ...(row.decidedReason ? { decidedReason: row.decidedReason } : {}),
  }
}
