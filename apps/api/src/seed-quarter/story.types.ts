import type { CareActivityKind, LeadMotion, LeadSourceKind, LeadTier } from '@pv/contracts'

/** The demo quarter in two layers (docs: `.claude/HANDOFF-quarter-seed.md`).
 *  `Knobs` decide WHAT happens to one customer journey — sampled from
 *  `params.ts` for the bulk, fixed by hand in `scenarios.ts`. `expand()` turns
 *  knobs into a dated `Story`; emitters turn a story into rows. Keeping the
 *  outcome apart from the dates is what lets 40 hand-written scenarios and 800
 *  sampled leads share one generator and one set of emitters. */

export type Day = string // 'YYYY-MM-DD', Vietnam calendar day
export type ActorId = string
export type OppStage = 'new' | 'assigned' | 'engaged' | 'quotation'

/** Where a lead ends up on the run day. */
export type LeadEnd =
  | { state: 'new'; fromPool?: 'replied' } // unowned; 'replied' = came back from nurturing
  | { state: 'assigned' | 'working' }
  | { state: 'nurturing'; reasonKey: string; recontact?: boolean }
  | { state: 'converted' }

export type DealEnd =
  | { kind: 'open'; stage: OppStage }
  | { kind: 'lost'; atStage: OppStage; reasonKey: string }
  | { kind: 'won' }

export type SignApproval = 'none' | 'approved' | 'waiting' | 'rejected-then-approved'

export type InstallmentEnd =
  | 'paid'
  | 'paid-late'
  | 'upcoming'
  | 'due-soon'
  | 'overdue' // 1–14 days late, no reason written
  | 'overdue-waiting'
  | 'overdue-approved'
  | 'overdue-rejected'
  | 'long-overdue' // ≥ 15 days late

export type Termination =
  'none' | 'plain' | 'customer-pays' | 'company-pays' | 'company-pays-settled'

export type HoldKnob =
  | { open: 'upcoming' | 'due-soon' | 'due' | 'overdue' }
  | { ended: 'resumed' | 'to-waiting' | 'touch' | 'stopped' | 'converted' }

/** Everything decided about one journey before any date is drawn. */
export type Knobs = {
  /** Scenario key ('S01'…) or null for the bulk layer. */
  scenario: string | null
  company: number // index into the company list
  motion: LeadMotion
  sourceKind: LeadSourceKind
  campaign: string | null // campaign key from params.ts
  partner: number | null // index into partners, only for PARTNER motion
  /** Born-on window; the expander draws the day inside it. */
  born: { from: Day; to: Day }
  marketer: ActorId | null // who sourced it (null = inbound pool)
  worker: ActorId | null // BD who works it once claimed
  lead: LeadEnd
  disabled: boolean
  tierReached: LeadTier | null
  leadHold: HoldKnob | null
  leadNextStep: boolean
  duplicateMerged: boolean // a second sighting merged into this lead
  deal: null | {
    end: DealEnd
    sale: ActorId // primary SALE owner
    bd: ActorId | null
    presales: ActorId | null
    activities: CareActivityKind[]
    quoteRounds: number // 0–3; ≥1 required for 'quotation' stage and 'won'
    hold: HoldKnob | null
    nextStep: boolean
    primaryChanged: boolean // SALE owner handed over once
    signApproval: SignApproval // only meaningful for won, or open+quotation ('waiting')
    currency: 'VND' | 'USD'
  }
  contract: null | {
    installments: InstallmentEnd[]
    termination: Termination
    collector: ActorId // account executive
    temperature: ('hot' | 'warm' | 'cold')[] // readings in order, may be empty
    growth: boolean // customer buys again: a second journey born by growth
    documentsMissing: boolean
  }
  /** Meetings decided by outcome; the expander dates them inside the journey. */
  meetings: { held: number; cancelled: number; upcoming: number; today: boolean }
}

/** One dated happening; emitters switch on `kind`. Times are absolute instants. */
export type Beat =
  | { kind: 'lead-born'; at: Date; by: ActorId | null }
  | { kind: 'lead-claimed'; at: Date; by: ActorId }
  | { kind: 'lead-handed'; at: Date; by: ActorId; from: ActorId | null; to: ActorId }
  | { kind: 'lead-released'; at: Date; by: ActorId }
  | { kind: 'first-touch'; at: Date; by: ActorId; channel: 'call' | 'mail' | 'message' }
  | { kind: 'care'; at: Date; by: ActorId; channel: 'call' | 'mail' | 'message'; reached: boolean }
  | { kind: 'tier'; at: Date; by: ActorId; tier: LeadTier }
  | { kind: 'parked'; at: Date; by: ActorId | null; reasonKey: string; recontactOn: Day | null }
  | { kind: 'pool-reply'; at: Date }
  | { kind: 'reclaimed'; at: Date; by: ActorId }
  | { kind: 'merged'; at: Date; by: ActorId }
  | { kind: 'disabled'; at: Date; by: ActorId }
  | { kind: 'hold-set'; at: Date; by: ActorId; on: 'lead' | 'deal'; until: Day }
  | { kind: 'hold-ended'; at: Date; by: ActorId | null; on: 'lead' | 'deal'; end: string }
  | { kind: 'next-step-open'; at: Date; by: ActorId; on: 'lead' | 'deal'; due: Day; doer: ActorId }
  | { kind: 'next-step-done'; at: Date; by: ActorId; on: 'lead' | 'deal' }
  | {
      kind: 'meeting'
      at: Date
      host: ActorId
      on: 'lead' | 'deal'
      state: 'held' | 'cancelled' | 'scheduled'
      minutes: 30 | 45 | 60 | 90 | 120
      mode: 'online' | 'onsite' | 'office'
    }
  | { kind: 'deal-opened'; at: Date; by: ActorId }
  | { kind: 'deal-accepted'; at: Date; by: ActorId }
  | { kind: 'stage'; at: Date; by: ActorId; from: OppStage; to: OppStage }
  | { kind: 'activity'; at: Date; by: ActorId; activity: CareActivityKind }
  | {
      kind: 'quote'
      at: Date
      by: ActorId
      negotiation: number
      round: number
      amount: number
      outcome: 'pending' | 'won' | 'not-closed'
      closedAt: Date | null
      reasonKey: string | null
    }
  | { kind: 'owner-changed'; at: Date; by: ActorId; from: ActorId; to: ActorId }
  | { kind: 'deal-lost'; at: Date; by: ActorId; atStage: OppStage; reasonKey: string }
  | { kind: 'sign-requested'; at: Date; by: ActorId }
  | { kind: 'sign-decided'; at: Date; by: ActorId; approved: boolean; reason: string | null }
  | { kind: 'signed'; at: Date; by: ActorId; value: number }
  | {
      kind: 'installment'
      no: number
      due: Day
      share: number
      paidAt: Date | null
      paidBy: ActorId | null
      reason: null | {
        state: 'waiting' | 'approved' | 'rejected'
        at: Date
        by: ActorId
        decidedAt: Date | null
        decidedBy: ActorId | null
      }
    }
  | { kind: 'terminated'; at: Date; by: ActorId; knob: Exclude<Termination, 'none'> }
  | { kind: 'temperature'; at: Date; by: ActorId; temperature: 'hot' | 'warm' | 'cold' }

/** One customer journey (one `sales.workstream`), fully dated. Beats are
 *  sorted by time and never later than the run's `now`, except `meeting`
 *  (scheduled), `next-step-open` dues, `hold-set` untils and `installment` dues. */
export type Story = {
  key: string // 'J0001'; stable across runs with the same seed
  knobs: Knobs
  bornAt: Date
  contact: number // index into the company's contacts
  amount: number // deal value in its currency (0 when no deal)
  beats: Beat[]
  /** A follow-on journey born by growth (re-buy), already expanded. */
  growth: Story | null
}
