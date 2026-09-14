import { daysUntil } from './contract-due'
import type { ChainLink, Decidable } from './e3-approvals'
import type { Branch, ObjectKind, ObjectRef } from './types'

/** Where one object sits on its pipeline, and who is being waited on.
 *
 *  Pure and synchronous, and everything it reads arrives already loaded — the
 *  moment `now`, the ladder, the per-phase `limitDays` that lives in
 *  `config_entry`, the approvals raised against the object. Nothing is fetched
 *  here: the lead book, the lead profile, the home screen and the performance
 *  screen must print the SAME position for the same object on the same day, and
 *  four screens each deriving it from whatever they happen to have loaded is
 *  precisely the drift this function exists to end.
 *
 *  See `docs/tam-nhin-pipeline.md` §6 and `docs/tam-nhin-pipeline-toan-he.md`
 *  §2 and §7. */

/** The pipelines that own an object kind today.
 *
 *  Seven of the eleven pipelines listed in `tam-nhin-pipeline-toan-he.md` §3;
 *  the other four (campaigns, installment collection, the approval inbox,
 *  intake) hold no `ObjectKind`, so a name for them here would hold nothing.
 *
 *  No branch prefix on the names, deliberately: the branch is already a field
 *  of the result, and there it means the branch that OWNS the object, which is
 *  not always the branch that runs the pipeline — a sales order is owned by
 *  Supply while the production ladder it walks belongs to Factory. Two
 *  different truths under one word would guarantee a wrong read. */
export type PipelineId =
  'lead' | 'opportunity' | 'quote' | 'contract' | 'purchasing' | 'production' | 'maintenance'

/** Which pipeline each kind belongs to — EXHAUSTIVE, and `null` is spelled out
 *  rather than left to a lookup miss.
 *
 *  Rule 1 of §2 says an object this function cannot place does not exist in the
 *  system, and that only bites while the gap is VISIBLE. An absent key reads
 *  exactly like a deliberate "this one is not a pipeline object", so a kind
 *  added next quarter would slip in unplaced and nobody would find out until a
 *  screen went blank. With the table exhaustive, adding a kind stops the build
 *  until somebody decides which ladder it walks.
 *
 *  Accounts and contacts are books, not pipelines (§1): a company and a person
 *  have no ordered stages and never leave for a reason. That is a decision, and
 *  writing it here is how it stays one. */
export const PIPELINE_OF_KIND: Record<ObjectKind, PipelineId | null> = {
  AC: null,
  CT: null,
  LD: 'lead',
  OP: 'opportunity',
  BG: 'quote',
  HĐ: 'contract',
  SO: 'production',
  WO: 'production',
  PR: 'purchasing',
  PO: 'purchasing',
  L: 'purchasing',
  CNC: 'maintenance',
  BT: 'maintenance',
}

export type PhaseSpec = {
  key: string
  /** Loaded from `config_entry`, never a constant in this file: a deadline is a
   *  decision somebody makes and changes, and §2 rule 2 puts it in config for
   *  exactly that reason. `null` means no clock is configured for this phase
   *  yet, and then `overdueBy` is `null` too — an invented number would read on
   *  screen as a real deadline that a real person is judged against. */
  limitDays: number | null
}

/** A person being waited on, plus the day they were due. */
export type WaitingOn = { person: string; role: string; due: string | null }

export type PipelinePosition = {
  /** The branch that owns the object (`ObjectRef.branch`). */
  branch: Branch
  /** A key of ONE pipeline's ladder, carried together with the pipeline it
   *  belongs to. §7 warns that a phase drawn from a Sales-only `P0…P7` scale
   *  either gets rewritten when Supply and Factory arrive or serves Sales
   *  forever; scoping the key to its pipeline is that warning answered in the
   *  type, and it keeps the shape at the six fields already agreed. A bare key
   *  could not be read anyway by a screen that lists several pipelines at once,
   *  since two ladders may well both call a phase `cho-ky`. */
  phase: { pipeline: PipelineId; key: string }
  /** The object's own state machine value, read straight off it, not
   *  reinterpreted: every pipeline keeps its own and this function has no
   *  business translating between them. */
  state: string | null
  holder: string | null
  /** The first approval link still waiting on this object. `null` means nobody
   *  is being waited on, and then the answer to "who has it" is `holder`. */
  waitingOn: WaitingOn | null
  /** `daysHere − limitDays`, so a negative number is days still in hand. One
   *  subtraction serves both readings; splitting it would make a screen call
   *  twice to print "2 days left" and "1 day late" in the same column. `null`
   *  when the phase has no `limitDays` configured. */
  overdueBy: number | null
}

export type PositionInput = {
  ref: ObjectRef
  /** The pipeline's ladder, IN ORDER, as loaded from `config_entry`. */
  phases: readonly PhaseSpec[]
  /** The phase keys whose evidence exists — a signed contract, a sent quote, an
   *  open deal. Order is irrelevant: the furthest one along `phases` wins, which
   *  is the §6 ladder ("P6 if a contract exists, else P5 if a quote exists, …")
   *  said once for every pipeline instead of once per pipeline. Which evidence
   *  counts is the caller's knowledge, and it has to be: only the caller knows
   *  what it loaded. */
  reached: readonly string[]
  /** When the object entered the phase it is in now (`stage_since`). */
  since: string
  /** Approval requests already loaded for this object. */
  approvals: readonly Decidable[]
}

/** `null` when the kind has no pipeline — see `PIPELINE_OF_KIND`.
 *
 *  `now` is a parameter rather than a `Date.now()` call for `contract-due`'s
 *  reason: a frozen scenario must give the same answer on two runs, and the
 *  server sweeps by its own date, not by a browser's. A caller holding a `Clock`
 *  passes `clock()`. */
export function pipelinePosition(input: PositionInput, now: string): PipelinePosition | null {
  const pipeline = PIPELINE_OF_KIND[input.ref.kind]
  if (!pipeline) return null

  const phase = currentPhase(input.phases, input.reached)
  /* An empty ladder is a configuration gap, and the honest answer to a gap is
     the one given to an unplaceable kind: this object is not on a pipeline. A
     made-up phase would hide the very thing rule 1 exists to show. */
  if (!phase) return null

  const link = firstWaitingLink(input.approvals)

  /* `daysUntil(a, b)` is a − b in whole calendar days, so reading `now` as the
     far side gives the days spent here. Reused rather than written again: the
     rule that both sides truncate to a date before subtracting — without which
     one afternoon yields two different answers — already has a home. */
  const daysHere = daysUntil(now, input.since)

  return {
    branch: input.ref.branch,
    phase: { pipeline, key: phase.key },
    state: input.ref.state ?? null,
    holder: input.ref.owner ?? null,
    waitingOn: link ? { person: link.person, role: link.role, due: link.due ?? null } : null,
    overdueBy: phase.limitDays === null ? null : daysHere - phase.limitDays,
  }
}

/** The furthest phase reached. An object with no milestone yet sits at the
 *  entrance rather than nowhere — it is on the pipeline by virtue of its kind,
 *  and the first phase is where it came in. */
function currentPhase(phases: readonly PhaseSpec[], reached: readonly string[]): PhaseSpec | null {
  let at: PhaseSpec | null = phases[0] ?? null
  for (const phase of phases) if (reached.includes(phase.key)) at = phase
  return at
}

/** The first link still waiting, in the first request still waiting. Whose turn
 *  it is is E3's rule (`decideOn`), read here rather than restated — a second
 *  copy would one day disagree with the door that actually decides. */
function firstWaitingLink(approvals: readonly Decidable[]): ChainLink | null {
  for (const approval of approvals) {
    if (approval.state !== 'waiting') continue
    const link = approval.chain.find((l) => l.state === 'waiting')
    if (link) return link
  }
  return null
}
