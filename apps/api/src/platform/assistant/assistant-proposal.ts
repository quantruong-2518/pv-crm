import { randomUUID } from 'node:crypto'
import type {
  AssistantProposal,
  AssistantProposalAction,
  AssistantProposalStep,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import type { Db } from '../db/db.module'
import type { AssistantProposalRowDb, AssistantProposalValues } from './assistant.schema'
import { notRun, type ToolVerdict } from './assistant-tools'

/** Cards the assistant proposes and the asker presses (ADR 0162). A tool hands a
 *  `ProposalDraft` beside its read, never to a model; the loop stores it as a card,
 *  and the press replays the stored door body through the branch's `ProposalWriter`.
 *
 *  Platform names no branch: the writer comes through `AssistantToolSource`, the
 *  binding the tools already use, so the composition root needs no second token. */

export type ProposalKind = AssistantProposal['kind']

export type ProposalDraft = {
  kind: ProposalKind
  code: string
  action: AssistantProposalAction
  before: AssistantProposalStep | null
  after: AssistantProposalStep | null
  /** The step door's own body, replayed as stored on the press. */
  body: Record<string, unknown>
  reason: string
}

export type StoredProposal = Omit<ProposalDraft, 'reason'> & { id: string }

/** `gone`: the claim found the card no longer pending. `stale`: the step moved under
 *  it, and `title` is the door's sentence; any other refusal is thrown, card pending. */
export type ProposalApplied =
  { ok: true } | { ok: false; why: 'gone' } | { ok: false; why: 'stale'; title: string }

/** The branch's half of the press. `claim` flips the card inside the writer's own
 *  transaction, first, so the card and the record move together or not at all. */
export interface ProposalWriter {
  apply(
    who: Actor,
    card: StoredProposal,
    claim: (tx: Db) => Promise<boolean>,
  ): Promise<ProposalApplied>
}

/** ADR 0162 §2: long enough to read the answer, short enough that the step is still the one shown. */
export const CARD_TTL_MS = 30 * 60_000
export const CARDS_PER_TURN = 3

/** One card per record and three per turn, in call order. A call past either cap
 *  reaches the model as a refusal it can read, and no card is made. */
export function limitCards(given: Set<string>, verdicts: readonly ToolVerdict[]): ToolVerdict[] {
  return verdicts.map((verdict) => {
    const card = verdict.outcome === 'ok' ? verdict.proposal : null
    if (!card) return verdict
    const key = `${card.kind} ${card.code}`
    if (given.has(key)) return notRun('refused', { error: 'one-card-per-record' })
    if (given.size >= CARDS_PER_TURN) return notRun('refused', { error: 'card-limit' })
    given.add(key)
    return verdict
  })
}

type CardRow = AssistantProposalValues & { id: string; expiresAt: Date }

/** The cards of a round's `ok` calls, each naming its call row; inserted after them. */
export function cardRows(
  calls: readonly (Pick<ToolVerdict, 'outcome' | 'proposal'> & { id: string })[],
  turn: { id: string; actorId: string; now: number },
): CardRow[] {
  return calls.flatMap(({ id, outcome, proposal: p }) =>
    outcome === 'ok' && p
      ? [
          {
            id: randomUUID(),
            messageId: turn.id,
            toolCallId: id,
            actorId: turn.actorId,
            subjectKind: p.kind,
            subjectCode: p.code,
            action: p.action,
            before: p.before,
            after: p.after,
            body: p.body,
            reason: p.reason,
            expiresAt: new Date(turn.now + CARD_TTL_MS),
          },
        ]
      : [],
  )
}

/** A card the turn just stored, for the stream: pending, and the asker's own. */
export const freshCard = (row: CardRow, label: string): AssistantProposal =>
  cardOf(
    {
      ...row,
      before: row.before ?? null,
      after: row.after ?? null,
      state: 'pending',
      expired: false,
    },
    label,
    true,
  )

/** A stored card with `expired` read off the database clock, the one the claim uses. */
export type ProposalView = Pick<
  AssistantProposalRowDb,
  | 'id'
  | 'subjectKind'
  | 'subjectCode'
  | 'action'
  | 'before'
  | 'after'
  | 'reason'
  | 'state'
  | 'expiresAt'
> & { expired: boolean }

export const stateOf = (
  row: Pick<ProposalView, 'state' | 'expired'>,
): AssistantProposal['state'] => (row.state === 'pending' && row.expired ? 'expired' : row.state)

export function cardOf(row: ProposalView, label: string, canPress: boolean): AssistantProposal {
  const state = stateOf(row)
  return {
    id: row.id,
    kind: row.subjectKind,
    code: row.subjectCode,
    label: label || row.subjectCode,
    action: row.action,
    before: row.before as AssistantProposalStep | null,
    after: row.after as AssistantProposalStep | null,
    reason: row.reason,
    state,
    expiresAt: row.expiresAt.toISOString(),
    canPress: canPress && state === 'pending',
  }
}
