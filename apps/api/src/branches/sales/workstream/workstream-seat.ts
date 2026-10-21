import type {
  WorkstreamHolder,
  WorkstreamInCharge,
  WorkstreamRowStep,
  WorkstreamStand,
} from '@pv/contracts'
import { toContract as toNextStep } from '../next-step/next-step.mapper'
import type { NextStepRead } from '../next-step/next-step.repository'
import { holderOf, type OwnerRow, type RefOwner } from '../opportunity/opportunity.mapper'
import type { RunContract, WorkstreamRead } from './workstream.repository'

/** Who answers for a book row, and what they do next — both read off the
 *  stand AS THIS READER SEES IT (`standOf`), never off the bare row: a folded
 *  card must not print a deal's holder or step under a lead pill.
 *
 *  Seats follow ADR 0110 §4: the lead's PIC, the deal's primary seller, or the
 *  closer of each live contract. Never the lead's PIC standing in for another
 *  seat — an empty seat is `null`, not a borrowed name. */

export function inChargeOf(
  stand: WorkstreamStand,
  read: WorkstreamRead,
  owners: ReadonlyMap<string, OwnerRow[]>,
  acceptors: ReadonlyMap<string, RefOwner>,
  contracts: readonly RunContract[],
): WorkstreamInCharge | null {
  const seat = (kind: WorkstreamInCharge['seat'], people: WorkstreamHolder[]) =>
    people.length === 0 ? null : { seat: kind, people }

  /* A run at the signature rung names its closers even when this reader's
     card folded to the lead: never the lead's PIC for a contract (ADR 0110 §4). */
  if (stand.kind === 'LD' && read.row.standKind !== 'HĐ') {
    const { ownerId } = read.lead
    return seat('lead', ownerId && read.saleName ? [{ id: ownerId, name: read.saleName }] : [])
  }
  if (stand.kind === 'OP') {
    const holder = holderOf(owners.get(stand.code) ?? [], acceptors.get(stand.code) ?? null)
    return seat('deal', holder ? [holder] : [])
  }

  const closers = new Map<string, WorkstreamHolder>()
  for (const c of contracts) {
    if (!c.terminated && c.ownerId && c.ownerName) {
      closers.set(c.ownerId, { id: c.ownerId, name: c.ownerName })
    }
  }
  return seat('contract', [...closers.values()])
}

/** The object whose next step the row prints: the stand's lead or deal. A
 *  contract has no next step. */
export const stepSubjectOf = (stand: WorkstreamStand): string | null =>
  stand.kind === 'HĐ' ? null : stand.code

/** Slimmed to the row's shape; graded by the next-step mapper, the one place
 *  `dueLevel` is decided. */
export function rowStepOf(
  stand: WorkstreamStand,
  steps: ReadonlyMap<string, NextStepRead>,
  today: string,
): WorkstreamRowStep | null {
  const subject = stepSubjectOf(stand)
  const found = subject === null ? undefined : steps.get(subject)
  if (!found) return null
  const { text, due, dueLevel } = toNextStep(found, today)
  return { text, due, dueLevel }
}
