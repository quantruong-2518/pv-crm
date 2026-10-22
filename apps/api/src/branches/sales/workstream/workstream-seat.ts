import type {
  WorkstreamHolder,
  WorkstreamInCharge,
  WorkstreamRowStep,
  WorkstreamStand,
} from '@pv/contracts'
import { toContract as toNextStep } from '../next-step/next-step.mapper'
import type { NextStepRead } from '../next-step/next-step.repository'
import type { OwnerRow, RefOwner } from '../opportunity/opportunity.mapper'
import type { RunContract, WorkstreamPageRow } from './workstream.repository'

/** Who answers for a book row, and what they do next — both read off the
 *  stand AS THIS READER SEES IT (`standOf`), never off the bare row: a folded
 *  card must not print a deal's holder or step under a lead pill.
 *
 *  Seats follow ADR 0110 §4: the lead's PIC, the deal's holder, or the closer
 *  of each live contract. Never the lead's PIC standing in for another seat —
 *  an empty seat is `null`, not a borrowed name. WHO sits is the page's
 *  `inChargeIds` (the `owner` filter's own SQL); this file only labels the seat,
 *  on that SQL's three branches, and names the ids from rows already loaded. */

export function inChargeOf(
  stand: WorkstreamStand,
  read: WorkstreamPageRow,
  owners: ReadonlyMap<string, OwnerRow[]>,
  acceptors: ReadonlyMap<string, RefOwner>,
  contracts: readonly RunContract[],
): WorkstreamInCharge | null {
  /* A run at the signature rung names its closers even when this reader's
     card folded to the lead: never the lead's PIC for a contract (ADR 0110 §4). */
  const seat: WorkstreamInCharge['seat'] =
    stand.kind === 'OP'
      ? 'deal'
      : stand.kind === 'LD' && read.row.standKind !== 'HĐ'
        ? 'lead'
        : 'contract'
  const acceptor = acceptors.get(stand.code)
  const named: WorkstreamHolder[] = [
    ...(read.lead.ownerId && read.saleName ? [{ id: read.lead.ownerId, name: read.saleName }] : []),
    ...(owners.get(stand.code) ?? []),
    ...(acceptor ? [acceptor] : []),
    ...contracts.flatMap((c) =>
      c.ownerId && c.ownerName ? [{ id: c.ownerId, name: c.ownerName }] : [],
    ),
  ]
  const names = new Map(named.map((p) => [p.id, p.name]))
  const people = read.inChargeIds.flatMap((id) => {
    const name = names.get(id)
    return name === undefined ? [] : [{ id, name }]
  })
  return people.length === 0 ? null : { seat, people }
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
