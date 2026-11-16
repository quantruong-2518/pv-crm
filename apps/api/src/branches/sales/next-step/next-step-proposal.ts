import { Injectable } from '@nestjs/common'
import { NextStepDoneBody, NextStepSetBody, type AssistantProposalStep } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import type {
  ProposalApplied,
  ProposalWriter,
  StoredProposal,
} from '@api/platform/assistant/assistant-proposal'
import type { Db } from '@api/platform/db/db.module'
import { byOf, TouchService } from '../touch/touch.service'
import { OpportunityStepService } from './next-step-opportunity.service'
import { NextStepRepository } from './next-step.repository'
import { assertNextDiffers, StepMoved } from './next-step.rules'
import { NextStepService, type StepWrite } from './next-step.service'

/** The press of an assistant card on a step (ADR 0162): the card's stored door body
 *  through the doors' own `write`, as the presser, in ONE transaction that first
 *  claims the card. `expect` is the card's `before`, so a step that moved since the
 *  card was made is refused under the lock, as a doubled "done" is.
 *
 *  The 'assistant-applied' touch is a mark on the timeline, not work done: the
 *  activity readers leave that kind out (ADR 0162 §5). */

class Gone extends Error {}

const dayOf = (due: string): string => `${due.slice(8, 10)}/${due.slice(5, 7)}`
const stepWords = (s: AssistantProposalStep): string => `“${s.text}”, hạn ${dayOf(s.due)}`

/** One readable line on the timeline: who pressed, and what the card wrote. */
function noteOf(who: Actor, op: StepWrite): string {
  const done = op.closing ? `xong việc “${op.closing.text}”` : null
  const next = op.next ? `đặt việc tiếp theo ${stepWords(op.next)}` : null
  return `Trợ lý đề xuất, ${who.name} bấm: ${[done, next].filter(Boolean).join('; ')}`
}

/** The stored body, read back through the door's own schema: what the press replays. */
function opOf(card: StoredProposal): StepWrite {
  const expect = card.before
  if (card.action === 'next-step-set') return { next: NextStepSetBody.parse(card.body), expect }
  const body = NextStepDoneBody.parse(card.body)
  assertNextDiffers(body.closing, body.next)
  return { ...body, expect }
}

@Injectable()
export class StepProposalWriter implements ProposalWriter {
  constructor(
    private readonly repo: NextStepRepository,
    private readonly leads: NextStepService,
    private readonly deals: OpportunityStepService,
    private readonly touch: TouchService,
  ) {}

  /** Only `StepMoved` marks the card stale: the step moved under it. Any other door
   *  refusal (out of scope after a handover, a lead out of the funnel, no live doer)
   *  rolls the claim back and is rethrown, so the card stays pending. */
  async apply(
    who: Actor,
    card: StoredProposal,
    claim: (tx: Db) => Promise<boolean>,
  ): Promise<ProposalApplied> {
    const op = opOf(card)
    /* Asked BEFORE the transaction: `ActorRepository` reads on the pool, and inside the
       tx that waits on PGlite's single connection forever. No doer = the holder. */
    const leadReach = await this.leads.reaches(op.next?.doerId)
    const dealReach = await this.deals.reaches(op.next?.doerId)
    try {
      await this.repo.run(async (tx) => {
        if (!(await claim(tx))) throw new Gone()
        if (card.kind === 'lead') await this.leads.write(tx, who, card.code, op, leadReach)
        else await this.deals.write(tx, who, card.code, op, dealReach)
        await this.touch.record(tx, [
          {
            subjectCode: card.code,
            subjectKind: card.kind,
            kind: 'assistant-applied',
            ...byOf(who),
            note: noteOf(who, op),
          },
        ])
      })
      return { ok: true }
    } catch (error) {
      if (error instanceof Gone) return { ok: false, why: 'gone' }
      if (error instanceof StepMoved) return { ok: false, why: 'stale', title: error.message }
      throw error
    }
  }
}
