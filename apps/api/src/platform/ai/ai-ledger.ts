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
}

/** The one writer of `platform.ai_call` (ADR 0102). Counts only — the record
 *  has no field for prompt or answer text, so no caller can pass one.
 *
 *  Takes the caller's `tx`, like `AuditRepository.write`: the call is recorded
 *  in the same transaction as the row that holds its result. */
@Injectable()
export class AiLedger {
  async record(tx: Db, call: AiCallRecord): Promise<void> {
    await tx.insert(aiCall).values(call)
  }
}
