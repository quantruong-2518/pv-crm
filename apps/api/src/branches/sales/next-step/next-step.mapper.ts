import { stepLevelOf, type DueLevel as EngineDueLevel } from '@pv/engines'
import type { DueLevel, NextStep } from '@pv/contracts'
import type { NextStepRead } from './next-step.repository'

/** `DueLevel` is written twice — contracts may not import engines. This side
 *  imports both, so it fails `tsc` the day either list gains or loses a value. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T
export type DueLevelsAgree = Assert<Same<DueLevel, EngineDueLevel>>

/** Row → contract. `today` is passed in, never read here: grading is the one
 *  clock-dependent step, and the caller owns the clock. */
export function toContract(row: NextStepRead, today: string): NextStep {
  return {
    text: row.text,
    due: row.due,
    doer: { id: row.doerId, name: row.doerName },
    dueLevel: stepLevelOf(row.due, today),
    kind: row.kindId && row.kindName ? { id: row.kindId, name: row.kindName } : null,
  }
}

/** The timeline sentence of a finished step. It quotes the text because the
 *  row it came from is replaced or deleted in the same write. */
export const doneNote = (text: string): string => `Xong việc tiếp theo: “${text}”`
