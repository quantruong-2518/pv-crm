import { DEAL } from './params'
import { LOCAL } from './expand-time'
import type { DealEnd, Knobs, OppStage } from './story.types'

/** How old a journey must be before its outcome can have happened. One function
 *  serves both layers: the bulk degrades its outcome when it is too young, a
 *  scenario narrows its born window instead. */

export type DealK = NonNullable<Knobs['deal']>
export type ContractK = NonNullable<Knobs['contract']>

/** Installment lists the bulk sampled as placeholders: the expander derives the
 *  real ends from the due dates. Keyed by array identity, which spreads keep. */
export const derivedEnds = new WeakSet<object>()

export const STAGES: OppStage[] = ['new', 'assigned', 'engaged', 'quotation']
export const rankOf = (s: OppStage): number => STAGES.indexOf(s)

export const topStage = (e: DealEnd): OppStage =>
  e.kind === 'open' ? e.stage : e.kind === 'lost' ? e.atStage : 'quotation'

/** Accepted by the head: everything except a deal still at, or lost at, 'new'. */
export const isAccepted = (e: DealEnd): boolean => e.kind === 'won' || rankOf(topStage(e)) > 0

/** Engaged is a real stage only with an activity to trigger it (or when it is the end). */
export const usesEngaged = (d: DealK): boolean => {
  const top = rankOf(topStage(d.end))
  return top === 2 || (top === 3 && d.activities.length > 0)
}

const STAGE_RANGE: Record<OppStage, [number, number]> = {
  new: DEAL.acceptLagDays as [number, number],
  assigned: DEAL.assignedToEngagedDays as [number, number],
  engaged: DEAL.engagedToQuotationDays as [number, number],
  quotation: DEAL.quotationToSignDays as [number, number],
}

/** The steps of a deal chain from the lead's last care to its last event:
 *  [lead->deal, new->assigned, ->engaged, ->quotation, final]. Absent steps are omitted. */
export function dealSteps(d: DealK): { name: string; range: [number, number] }[] {
  const top = rankOf(topStage(d.end))
  const steps: { name: string; range: [number, number] }[] = [
    { name: 'open', range: LOCAL.leadToDealDays },
  ]
  if (isAccepted(d.end)) steps.push({ name: 'accept', range: STAGE_RANGE.new })
  if (usesEngaged(d)) steps.push({ name: 'engaged', range: STAGE_RANGE.assigned })
  if (top === 3) steps.push({ name: 'quotation', range: STAGE_RANGE.engaged })
  if (d.end.kind === 'won') steps.push({ name: 'end', range: STAGE_RANGE.quotation })
  if (d.end.kind === 'lost') steps.push({ name: 'end', range: STAGE_RANGE[topStage(d.end)] })
  return steps
}

const stepLo = (d: DealK): number => dealSteps(d).reduce((n, s) => n + s.range[0], 0)

export function minAgeDays(k: Knobs): number {
  const d = k.deal
  let need: number
  if (d) {
    need = stepLo(d) + LOCAL.snapMarginDays
    if (d.hold) need += 'open' in d.hold && d.hold.open === 'overdue' ? 4 : 2
  } else {
    const l = k.lead
    need =
      l.state === 'new'
        ? l.fromPool
          ? 7
          : 0
        : l.state === 'assigned'
          ? 1
          : l.state === 'working'
            ? 2
            : 4
    if (k.motion === 'RECYCLE' && (l.state === 'assigned' || l.state === 'working')) {
      need += LOCAL.reclaimDays
    }
    if (k.duplicateMerged || k.disabled) need += 2
  }
  const lh = k.leadHold
  if (lh) need = Math.max(need, 'open' in lh && lh.open === 'overdue' ? 4 : 3)
  if (k.meetings.held > 0 || k.meetings.cancelled > 0) need += 1
  if (k.contract?.termination && k.contract.termination !== 'none') {
    need += LOCAL.terminationTailDays
  }
  if (k.contract?.growth) need += LOCAL.growthTailDays
  return need
}

/** Days that must stay free after the sign for the contract's own events. */
export function tailDays(k: Knobs): number {
  let tail = 0
  if (k.contract?.termination && k.contract.termination !== 'none') {
    tail += LOCAL.terminationTailDays
  }
  if (k.contract?.growth) tail += LOCAL.growthTailDays
  return tail
}
