import { z } from 'zod'
import { Moment, ObjectCode, textInput } from './primitives'

/** The One approval inbox (E3) — the wire shape for `platform.approval` and
 *  `platform.approval_link`.
 *
 *  Nine pipelines share ONE approval layer; today only Sales plugs into it,
 *  through `apps/api/src/branches/sales/config/config.approval.ts`. The shapes
 *  below follow `ApprovalState`/`ApprovalRequest` in
 *  `packages/engines/src/e3-approvals.ts`: the engine holds the RULE, this file
 *  only describes what crosses the wire.
 *
 *  Two names differ from the engine on purpose, and they are the only two:
 *  the engine's `type` is `kind` here, because `kind` is the word this codebase
 *  uses for a closed set (`ObjectKind`, `TouchKind`, `EdgeKind`) while `type`
 *  is a TypeScript word; and the engine's `ref: ObjectRef` is `link` here,
 *  because the row that ties a request to an object is its own table with its
 *  own snapshot. Anything else that drifts is a bug, not a translation. */

/** The engine's three states, re-declared rather than imported — the same call
 *  `problem.ts` makes for `DenyReason`: `@pv/contracts` must not pull in the
 *  engine for the sake of a three-member union. */
export const ApprovalState = z.enum(['waiting', 'approved', 'rejected'])

/** What is being asked for. One kind today — a change to the sales department's
 *  configuration — first in the order settled by
 *  `docs/decisions/0031-waiting-on-comes-from-e3-approval-links.md`.
 *  The list grows as other pipelines plug into E3, and each new kind is
 *  a migration somebody reads: the value is copied into a CHECK constraint, so
 *  it is never quietly widened here. */
export const ApprovalKind = z.enum(['config-change'])

/** One link in the approval chain — mirrors `ChainLink` in the engine.
 *
 *  `person` is a NAME copied when the chain was built, not a join done on read.
 *  Same reason `touch.by` copies one: a decision trail that silently adopts
 *  today's names is a trail that cannot be audited. */
export const ApprovalChainLink = z.object({
  role: z.string().min(1),
  person: z.string().min(1),
  state: ApprovalState,
  /** ISO. Past it, the inbox paints a warning. */
  due: Moment.optional(),
})

/** `approval_link` — an object this request touches.
 *
 *  A LIST on the view below, and it may be empty: a change to the department's
 *  vocabulary touches no object at all, a discount touches one deal, a batch
 *  action could touch several. A single optional field would have made the
 *  first case invent an object to point at.
 *
 *  `objectLabel` is a SNAPSHOT rather than a lookup through the object graph:
 *  an object can be renamed or moved to another branch after the request was
 *  raised, and the person approving has to read the name it carried THEN. */
export const ApprovalLink = z.object({
  objectCode: ObjectCode,
  objectLabel: z.string().min(1),
})

/** A request as the inbox reads it.
 *
 *  `consequence` is the sentence the approver reads instead of a raw payload —
 *  the same job `ConfigChange` does in `config.approval.ts`, and the branch
 *  writes it when the request is raised, not when a screen renders it. A person
 *  approving needs to see what happens if they say yes. */
export const ApprovalRequestView = z.object({
  id: z.string().min(1),
  kind: ApprovalKind,
  links: z.array(ApprovalLink),
  raisedBy: z.string().min(1),
  raisedAt: Moment,
  /** Proposed by the AI assistant or opened by a person — the engine's `fromAi`. */
  fromAi: z.boolean(),
  /** The grounds line an AI block must carry. The engine enforces its presence
   *  in `proposeFromAi` (rule 9); this only carries it across the wire. */
  basis: z.string().optional(),
  chain: z.array(ApprovalChainLink),
  state: ApprovalState,
  /** What happens if this is approved. Vietnamese — it is a LABEL, not a key. */
  consequence: z.string().min(1),
  decidedAt: Moment.optional(),
  decidedBy: z.string().optional(),
  /** Present exactly on a refusal — the table refuses any other combination. */
  decidedReason: z.string().optional(),
})

/** The id on the wire. A uuid, checked at the door rather than in the query:
 *  a path segment that is not one reaches Postgres as a malformed uuid and
 *  comes back as a 500 about a cast, where the honest answer is a 400. */
export const ApprovalId = z.string().uuid()

/** Not paged, for the reason `TouchTimelineResponse` is not: this is a queue of
 *  what one person must decide, bounded by how much work is actually waiting on
 *  them. A queue that hides its own tail is a queue nobody trusts. */
export const PendingApprovalsResponse = z.object({ rows: z.array(ApprovalRequestView) })

/** The decision. A reason is REQUIRED on the refusing branch and impossible on
 *  the approving one: "why was this turned down" is the question asked a month
 *  later, while "why was this allowed" is already answered by `consequence`.
 *  A discriminated union rather than an optional field — a refusal with no
 *  reason must not compile. */
export const ApprovalDecisionBody = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approved') }),
  z.object({ decision: z.literal('rejected'), reason: textInput(500) }),
])

export type ApprovalState = z.infer<typeof ApprovalState>
export type ApprovalKind = z.infer<typeof ApprovalKind>
export type ApprovalChainLink = z.infer<typeof ApprovalChainLink>
export type ApprovalLink = z.infer<typeof ApprovalLink>
export type ApprovalRequestView = z.infer<typeof ApprovalRequestView>
export type PendingApprovalsResponse = z.infer<typeof PendingApprovalsResponse>
export type ApprovalDecisionBody = z.infer<typeof ApprovalDecisionBody>
export type ApprovalId = z.infer<typeof ApprovalId>
