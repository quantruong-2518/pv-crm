import { Injectable } from '@nestjs/common'
import type { AiCallOutcome, AiTask } from '@pv/contracts'
import type { Db } from '../db/db.module'
import { aiCall } from './ai-cost.schema'

export type AiCallRecord = {
  task: AiTask
  model: string
  tokensIn: number
  tokensOut: number
  outcome: AiCallOutcome
  /** `null` for a system job. */
  actorId: string | null
  subjectCode: string | null
  /** 1 = first try, 2+ = a retry or the fallback; capped at 3 by the gateway. */
  attempt: number
  latencyMs: number
  /** `id@version` of the registered prompt; `null` for a call with none. */
  promptVersion: string | null
}

/** The one writer of `platform.ai_call` (ADR 0102). Counts only — the record
 *  has no field for prompt or answer text, so no caller can pass one.
 *
 *  Called by `AiGateway` alone, once per attempt, in its own write right after
 *  the vendor answers: the money is spent whether or not the feature's result
 *  transaction later commits (amends ADR 0102's "same transaction"). */
@Injectable()
export class AiLedger {
  async record(tx: Db, call: AiCallRecord): Promise<void> {
    await tx.insert(aiCall).values(call)
  }
}
