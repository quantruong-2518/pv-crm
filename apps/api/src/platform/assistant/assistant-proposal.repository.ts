import { Inject, Injectable } from '@nestjs/common'
import { and, eq, gt, sql } from 'drizzle-orm'
import { DB, type Db } from '../db/db.module'
import type { ProposalView } from './assistant-proposal'
import { PROPOSAL_VIEW } from './assistant.repository'
import { assistantProposal, assistantToolCall } from './assistant.schema'

/** SQL of the press (ADR 0162). Every state change is one guarded UPDATE on
 *  `state = 'pending'`, so two presses race on the row and one of them wins;
 *  `decided_at` moves with it for `assistant_proposal_decided_pair`. */

export type PressedCard = ProposalView & {
  actorId: string
  tool: string
  body: unknown
}

const open = (id: string) =>
  and(
    eq(assistantProposal.id, id),
    eq(assistantProposal.state, 'pending'),
    gt(assistantProposal.expiresAt, sql`now()`),
  )

@Injectable()
export class AssistantProposalRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async find(id: string): Promise<PressedCard | null> {
    const [row] = await this.db
      .select({ ...PROPOSAL_VIEW, body: assistantProposal.body })
      .from(assistantProposal)
      .innerJoin(assistantToolCall, eq(assistantToolCall.id, assistantProposal.toolCallId))
      .where(eq(assistantProposal.id, id))
    return row ?? null
  }

  /** Inside the writer's transaction: false = pressed, dismissed or past its time already. */
  async claim(tx: Db, id: string): Promise<boolean> {
    const rows = await tx
      .update(assistantProposal)
      .set({ state: 'applied', decidedAt: sql`now()` })
      .where(open(id))
      .returning({ id: assistantProposal.id })
    return rows.length === 1
  }

  /** A stale mark is written whatever the clock says: the step moved, and that is the truer word. */
  async settle(id: string, state: 'dismissed' | 'stale'): Promise<boolean> {
    const rows = await this.db
      .update(assistantProposal)
      .set({ state, decidedAt: sql`now()` })
      .where(
        state === 'stale'
          ? and(eq(assistantProposal.id, id), eq(assistantProposal.state, 'pending'))
          : open(id),
      )
      .returning({ id: assistantProposal.id })
    return rows.length === 1
  }
}
