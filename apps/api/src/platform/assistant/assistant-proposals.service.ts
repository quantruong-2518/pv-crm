import { Inject, Injectable } from '@nestjs/common'
import type { AssistantProposal, AssistantProposalStep } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { AiRouteRepository } from '../ai/ai-route.repository'
import { AuditRepository } from '../audit/audit.repository'
import type { Db } from '../db/db.module'
import { conflict, denied, notFound, type PvError } from '../http/problem'
import { AssistantProposalRepository, type PressedCard } from './assistant-proposal.repository'
import { cardOf, stateOf } from './assistant-proposal'
import { ASSISTANT_TOOLS, AssistantToolGate, type AssistantToolSource } from './assistant-tools'

/** The two presses on a card (ADR 0162 §3). Every read through the pool (the card,
 *  the route, E2, the label) happens before the writer opens its transaction:
 *  PGlite has one connection and a pool read inside the tx waits forever.
 *
 *  Each press answers the card as it now stands; a card that cannot be pressed
 *  answers 409 with its state in words, and the screen reads the chat again. */

const NOT_PENDING: Record<Exclude<AssistantProposal['state'], 'pending'>, string> = {
  applied: 'Đề xuất này đã được áp dụng.',
  dismissed: 'Bạn đã bỏ đề xuất này.',
  stale: 'Đề xuất này đã cũ, việc tiếp theo đã đổi.',
  expired: 'Đề xuất này đã hết hạn.',
}

const OFF = 'Trợ lý đang tắt.'

const refusal = (row: Pick<PressedCard, 'state' | 'expired'>): PvError => {
  const state = stateOf(row)
  return conflict(state === 'pending' ? NOT_PENDING.applied : NOT_PENDING[state])
}

@Injectable()
export class AssistantProposals {
  constructor(
    private readonly cards: AssistantProposalRepository,
    private readonly gate: AssistantToolGate,
    private readonly routes: AiRouteRepository,
    private readonly audit: AuditRepository,
    @Inject(ASSISTANT_TOOLS) private readonly source: AssistantToolSource,
  ) {}

  async apply(who: Actor, id: string): Promise<AssistantProposal> {
    const card = await this.pressable(who, id)
    const reason = this.gate.opens(who, card.tool, card.subjectKind)
    if (reason) throw denied(reason)
    const writer = this.source.proposals?.()
    if (!writer) throw conflict(NOT_PENDING.stale)
    const label = await this.labelOf(who, card.subjectCode)
    const claim = async (tx: Db): Promise<boolean> => {
      if (!(await this.cards.claim(tx, id))) return false
      await this.audit.write(this.line(who, card, 'applied'), tx)
      return true
    }
    const done = await writer.apply(
      who,
      {
        id,
        kind: card.subjectKind,
        code: card.subjectCode,
        action: card.action,
        before: card.before as AssistantProposalStep | null,
        after: card.after as AssistantProposalStep | null,
        body: card.body as Record<string, unknown>,
      },
      claim,
    )
    if (done.ok) return this.answer(who, id, label)
    if (done.why === 'stale') {
      await this.cards.settle(id, 'stale')
      throw conflict(done.title)
    }
    /* Pressed twice at once, or it ran out between the read and the claim. */
    throw refusal((await this.cards.find(id)) ?? card)
  }

  async dismiss(who: Actor, id: string): Promise<AssistantProposal> {
    const card = await this.pressable(who, id)
    if (!(await this.cards.settle(id, 'dismissed'))) {
      throw refusal((await this.cards.find(id)) ?? card)
    }
    await this.audit.write(this.line(who, card, 'dismissed'))
    return this.answer(who, id, await this.labelOf(who, card.subjectCode))
  }

  /** Steps 1–2 of the press, and the route: another person's card is not there. */
  private async pressable(who: Actor, id: string): Promise<PressedCard> {
    const card = await this.cards.find(id)
    if (!card || card.actorId !== who.id) throw notFound('đề xuất')
    if (!(await this.routes.get('assistant'))?.enabled) throw conflict(OFF)
    if (stateOf(card) !== 'pending') throw refusal(card)
    return card
  }

  /** The record chip, read through the doors as the presser now; the code when it cannot be. */
  private async labelOf(who: Actor, code: string): Promise<string> {
    return (await this.gate.recheck(who, [code])).get(code)?.label ?? code
  }

  private line(who: Actor, card: PressedCard, what: 'applied' | 'dismissed') {
    return {
      actorId: who.id,
      action: 'edit' as const,
      code: card.subjectCode,
      note: `assistant.proposal.${what} · card ${card.id} · ${card.subjectKind} ${card.subjectCode}`,
    }
  }

  private async answer(who: Actor, id: string, label: string): Promise<AssistantProposal> {
    const card = await this.cards.find(id)
    if (!card) throw notFound('đề xuất')
    return cardOf(card, label, this.gate.opens(who, card.tool, card.subjectKind) === null)
  }
}
