import type {
  DebriefAnswerInput,
  DebriefStepInput,
  DebriefStepTarget,
  NextStepKind,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import type { Db } from '@api/platform/db/db.module'

/** THE SEAM BETWEEN CLOSING A COMM AND THE BRANCH THAT OWNS ITS VOCABULARY.
 *
 *  A close-out writes the object's next step and is checked against config
 *  lists — both `sales` tables `platform/` may not import. So the dependency
 *  runs backward as `MESSAGE_LOGGED_HOOK` does (ADR 0049, ADR 0074): comms asks
 *  through this token, the Sales branch answers, `app.module.ts` names both.
 *
 *  `prepare` runs BEFORE the transaction because the branch reads actors on
 *  the pool and PGlite holds one connection; `apply` runs inside it so the
 *  debrief and the next step commit or roll back together. */
export interface CommDebriefHook {
  /** Linked objects this caller may set a next step on. Empty means the
   *  close-out carries no step (closed objects, contracts, accounts). */
  targets(who: Actor, linkedCodes: readonly string[]): Promise<DebriefStepTarget[]>
  /** Refuses with a problem response on an unknown or inactive criterion,
   *  answer or step kind, an unanswered required criterion, or a target the
   *  caller cannot reach. */
  prepare(who: Actor, input: CommDebriefInput): Promise<PreparedDebrief>
  apply(tx: Db, who: Actor, prepared: PreparedDebrief): Promise<void>
}

export type CommDebriefInput = {
  linkedCodes: readonly string[]
  answers: readonly DebriefAnswerInput[]
  step: DebriefStepInput | undefined
}

/** Names travel back so comms stores copies: renaming a config row later must
 *  not rewrite what somebody chose at the time. */
export type PreparedDebrief = {
  answers: Array<DebriefAnswerInput & { criterionName: string; answerName: string }>
  step: (DebriefStepInput & { kind: NextStepKind; doerId: string }) | null
}

/** Optional like `MESSAGE_LOGGED_HOOK`: with no branch bound, close-out refuses
 *  rather than closing without the checks the branch owns. */
export const COMM_DEBRIEF_HOOK = Symbol('pv.comms.comm-debrief')
