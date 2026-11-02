import { Injectable, Logger } from '@nestjs/common'
import type { AssistantEvent, AssistantTurnBody } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import type { RouteNeed } from '../access/need.decorator'
import { AiUnavailableError } from '../ai/ai-errors'
import { AiGateway } from '../ai/ai-gateway'
import { notFound } from '../http/problem'
import { AssistantRunner, FAILED, UNAVAILABLE } from './assistant-loop'
import { AssistantSessionRepository } from './assistant-session.repository'
import type { AssistantSessionRowDb } from './assistant.schema'

/** Starting and stopping turns over HTTP (ADR 0133 D7, wave 1).
 *
 *  Stop is an AbortController per running turn, held in this process: there is
 *  one API machine today. With a second, a stop landing on the other machine finds
 *  nothing, and the turn ends at its own deadline.
 *
 *  A turn refused before it starts leaves no session and no row behind: the
 *  gateway admits it first (route, key, quotas), and a session opened for a turn
 *  the runner then refused is deleted. */

/** The turn door's need; availability asks E2 the same question. */
export const ASSISTANT_NEED: RouteNeed = { branch: 'Sales', permission: 'assistant.use' }

const TITLE_MAX = 80

/** The first question, cut on a word boundary. */
export function titleOf(question: string): string {
  const text = question.trim().replace(/\s+/g, ' ')
  if (text.length <= TITLE_MAX) return text
  const space = text.slice(0, TITLE_MAX + 1).lastIndexOf(' ')
  return text.slice(0, space > 0 ? space : TITLE_MAX)
}

type Running = { controller: AbortController; ownerId: string; sessionId: string }

@Injectable()
export class AssistantTurns {
  private readonly log = new Logger('Assistant')
  private readonly running = new Map<string, Running>()

  constructor(
    private readonly runner: AssistantRunner,
    private readonly gateway: AiGateway,
    private readonly sessions: AssistantSessionRepository,
  ) {}

  /** Before the stream opens, so another person's session id is a plain 404. */
  async sessionOf(who: Actor, body: AssistantTurnBody): Promise<AssistantSessionRowDb | null> {
    if (!body.sessionId) return null
    const session = await this.sessions.find(who.id, body.sessionId)
    if (!session) throw notFound('cuộc trò chuyện')
    return session
  }

  /** Never rejects: after the stream opens every refusal is an event. */
  async run(
    who: Actor,
    body: AssistantTurnBody,
    session: AssistantSessionRowDb | null,
    send: (event: AssistantEvent) => void,
  ): Promise<void> {
    const controller = new AbortController()
    let opened: string | null = null
    let turnId: string | null = null
    try {
      const refused = await this.gateway.check('assistant', who.id).then(
        () => null,
        (error: unknown) => {
          if (error instanceof AiUnavailableError) return UNAVAILABLE[error.reason]
          throw error
        },
      )
      if (refused) return send({ type: 'error', ...refused })
      const subject = body.subject ?? null
      const row = session ?? (await this.sessions.open(who.id, titleOf(body.question), subject))
      if (!session) opened = row.id
      const onBegun = (id: string): void => {
        turnId = id
        this.running.set(id, { controller, ownerId: who.id, sessionId: row.id })
        send({ type: 'session', sessionId: row.id, messageId: id, title: row.title })
      }
      const { question, screen = null } = body
      const ctx = { who, sessionId: row.id, question, screen, task: 'assistant' as const, onBegun }
      await this.runner.runTurn(ctx, send, controller.signal)
    } catch (error) {
      this.log.error(`turn did not open: ${error instanceof Error ? error.name : 'unknown'}`)
      send({ type: 'error', ...FAILED })
    } finally {
      if (turnId) this.running.delete(turnId)
      if (opened && !turnId) await this.sessions.remove(who.id, opened).catch(() => false)
    }
  }

  /** The owner's own running turn only; any other id reads as not running. */
  stop(who: Actor, turnId: string): boolean {
    const turn = this.running.get(turnId)
    if (!turn || turn.ownerId !== who.id) return false
    turn.controller.abort()
    return true
  }

  /** A deleted session's turn stops; its next write then finds no row. */
  stopSession(sessionId: string): void {
    for (const turn of this.running.values()) {
      if (turn.sessionId === sessionId) turn.controller.abort()
    }
  }
}
