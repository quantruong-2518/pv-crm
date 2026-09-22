import {
  LEAD_STATE_LABEL,
  OPPORTUNITY_STATE_LABEL,
  type WorkstreamLeadLane,
  type WorkstreamStep,
  type WorkstreamStepState,
} from '@pv/contracts'
import { dm } from '@/lib/date'
import { EXIT_REASON_LABEL } from '@/data/leads'
import {
  CLOSE_REASON_LABEL,
  currentStepOf,
  lastReachedOf,
  type WorkstreamDealLaneView,
  type WorkstreamLane,
} from '@/data/workstreams'

/** What one node of the journey tree says about its lane — read off the wire
 *  and nothing else.
 *
 *  Split out of `workstream-detail-parts.tsx` because that file may export
 *  components only (`react-refresh/only-export-components`), and kept free of
 *  JSX so it stays a `.ts` model file. */

export type NodeTone = 'success' | 'danger' | 'warning' | 'quiet'

/** The label in a node's top-right corner: how the lane ended, or that it has
 *  not. A closed deal carries the day it closed; an open one has none. */
export type NodeStamp = { tone: NodeTone; label: string; at: string | null }

/** A PARKED deal is `quiet`, never `danger`, and never wears the word "Thua":
 *  the care list is where a deal waits, not where it died (ADR 0064 §6) — the
 *  same reading `STATE_TONE.care` gives it in the deal book. */
export function dealStamp(deal: WorkstreamDealLaneView): NodeStamp {
  const at = deal.outcomeAt === null ? null : dm(deal.outcomeAt)
  if (deal.outcome === 'won') return { tone: 'success', label: CLOSE_REASON_LABEL.WON, at }
  if (deal.outcome === 'care') return { tone: 'quiet', label: OPPORTUNITY_STATE_LABEL.care, at }
  if (deal.outcome === 'lost') return { tone: 'danger', label: CLOSE_REASON_LABEL.LOST, at }
  return { tone: 'quiet', label: 'Đang mở', at: null }
}

/** A lead that left the backbone stamps the state it left in. */
export function leadStamp(lead: WorkstreamLeadLane): NodeStamp {
  if (lead.exit) {
    return {
      tone: lead.exit.state === 'disqualified' ? 'danger' : 'quiet',
      label: LEAD_STATE_LABEL[lead.exit.state],
      at: dm(lead.exit.at),
    }
  }
  if (lead.outcome === 'converted') {
    return {
      tone: 'success',
      label: LEAD_STATE_LABEL.converted,
      at: lead.outcomeAt === null ? null : dm(lead.outcomeAt),
    }
  }
  return { tone: 'quiet', label: 'Đang mở', at: null }
}

/** `archived` has no reason: the system retires a lead on a timer, it does not
 *  choose one, so nothing prints rather than an empty field. */
export function exitReasonOf(lead: WorkstreamLeadLane): string | null {
  const reason = lead.exit?.reason
  if (reason === undefined || reason === null) return null
  return EXIT_REASON_LABEL[reason] ?? reason
}

/** The one line under a node's ladder: which rung the lane is on, and what
 *  that rung has cost so far. */
export type LaneSummary = {
  step: WorkstreamStep
  dropped: boolean
  /** `null` when the rung was entered today or carries no count: a zero day
   *  count says nothing and used to print on every node of the screen. */
  days: number | null
}

export function laneSummary(lane: WorkstreamLane): LaneSummary | null {
  const dropped = lane.steps.find((s) => s.state === 'dropped')
  const step = dropped ?? currentStepOf(lane) ?? lastReachedOf(lane)
  if (!step) return null
  const days = step.days === null || step.days === 0 ? null : step.days
  /* A closed lane stopped on its own last rung repeats the stamp word for word.
     A DROP still prints: the stamp names the outcome, this line the rung. */
  if (!lane.open && !dropped && days === null) return null
  return { step, dropped: step.state === 'dropped', days }
}

/** The day a lane began: the first rung it actually entered. A deal lane has no
 *  "opened at" on the wire, so this is read rather than invented. */
export function laneStartedAt(lane: WorkstreamLane): string | null {
  return lane.steps.find((s) => s.at !== null)?.at ?? null
}

/** One word per state, read by the legend, the nodes and the side panel. */
export const STEP_STATE_LABEL: Record<WorkstreamStepState, string> = {
  done: 'Xong',
  current: 'Đang ở',
  dropped: 'Rớt',
  parked: 'Dừng',
  upcoming: 'Chưa tới',
}

/** What an unreached rung is called. On a lane still running it lies ahead; on
 *  a closed one nothing will ever walk it, and "not reached yet" would promise
 *  a future that ended. Neither word is drawn — this is what the rung button
 *  tells a screen reader. */
export function unreachedWord(open: boolean): string {
  return open ? STEP_STATE_LABEL.upcoming : 'Không đi tới'
}

/** The rung the tier badge rides on: the one the lane STANDS on, since the grade
 *  was decoupled from the state (ADR 0063) — a lead may carry a tier from any
 *  rung, so pinning the badge to `working` hid it on every other one. `null`
 *  when no rung was ever entered, and then nothing is drawn. */
export function tierRungOf(lane: WorkstreamLane): string | null {
  const dropped = lane.steps.find((s) => s.state === 'dropped')
  return (dropped ?? currentStepOf(lane) ?? lastReachedOf(lane))?.key ?? null
}

/** Law 13 rescue for a `Badge` on this screen's grounds. `Badge`'s own `draft`
 *  ink reads 3.8:1 on a node and 3.6:1 on a tinted one — both under 4.5, where
 *  `text-foreground` is 9.9:1. Same mechanism as `CLOSE_BADGE` in
 *  `components/workstream-bits.tsx`.
 *
 *  NOT `--on-tint-*-strong`: that token is the same hex as its base in both
 *  themes (globals.css:72-75 and 491-494), so it moves nothing. */
export const BADGE_INK = 'text-foreground'

/** An action INSIDE a node, where `ghost`'s own ground reads as a second card
 *  stacked on the first. Only the ground goes: the 48px hit box stays, because
 *  law 13 measures the target, not the paint. */
export const QUIET_ACTION = 'hover:bg-surface-ink/9 justify-start bg-transparent shadow-none'
