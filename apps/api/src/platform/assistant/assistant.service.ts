import { Inject, Injectable } from '@nestjs/common'
import {
  ASSISTANT_SESSION_PAGE,
  type AssistantAvailability,
  type AssistantMessage,
  type AssistantReportBody,
  type AssistantReportQuery,
  type AssistantReportResponse,
  type AssistantSession,
  type AssistantSessionDetail,
  type AssistantSessionList,
  type AssistantSessionListQuery,
  type AssistantSessionPatchBody,
} from '@pv/contracts'
import type { AccessControl, Actor } from '@pv/engines'
import { AiRouteRepository } from '../ai/ai-route.repository'
import { AuditRepository } from '../audit/audit.repository'
import { ACCESS } from '../engines/tokens'
import { invalid, notFound } from '../http/problem'
import { recheck, recheckChats, type Recheck } from './assistant-refs'
import { footerOf } from './assistant-turn-read'
import { AssistantSessionRepository, type SessionCursor } from './assistant-session.repository'
import { AssistantToolGate } from './assistant-tools'
import { ASSISTANT_NEED, AssistantTurns } from './assistant-turns'
import { AssistantRepository, type StoredCall } from './assistant.repository'
import type { AssistantMessageRowDb, AssistantSessionRowDb } from './assistant.schema'

/** The session, availability and report doors. Sessions are the owner's alone:
 *  another person's id answers 404, as if it did not exist. What leaves is
 *  re-checked against what the reader may read now (`assistant-refs.ts`): the
 *  owner's messages, and the answers `assistant.review` reads. */

const NO_SESSION = () => notFound('cuộc trò chuyện')

/** A poll while a turn runs reuses the check made when the poll began; a turn is
 *  over by this, so an entry this old is dropped. */
const RUNNING_CHECK_MS = 120_000

const sessionOf = (row: AssistantSessionRowDb): AssistantSession => ({
  id: row.id,
  title: row.title,
  subject:
    row.subjectKind && row.subjectCode ? { kind: row.subjectKind, code: row.subjectCode } : null,
  pinned: row.pinnedAt !== null,
  lastOpenedAt: row.lastOpenedAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
})

const CURSOR = /^([01])~(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)~([0-9a-f-]{36})$/

const cursorText = (row: AssistantSessionRowDb): string =>
  `${row.pinnedAt === null ? 1 : 0}~${row.lastOpenedAt.toISOString()}~${row.id}`

function cursorOf(before: string | undefined): SessionCursor | null {
  if (before === undefined) return null
  const [, unpinned, at, id] = CURSOR.exec(before) ?? []
  if (!at || !id) throw invalid({ before: ['Trang không hợp lệ.'] })
  return { unpinned: unpinned === '1', at: new Date(at), id }
}

const codesIn = (calls: ReadonlyMap<string, readonly StoredCall[]>, id: string): string[] =>
  (calls.get(id) ?? []).flatMap((c) => c.codes)

@Injectable()
export class AssistantService {
  private readonly whileRunning = new Map<string, { at: number; check: Recheck }>()

  constructor(
    private readonly sessions: AssistantSessionRepository,
    private readonly turnsRepo: AssistantRepository,
    private readonly gate: AssistantToolGate,
    private readonly turns: AssistantTurns,
    private readonly routes: AiRouteRepository,
    private readonly audit: AuditRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  /** The turn door's own need, so the button never shows to someone it would refuse. */
  async availability(who: Actor): Promise<AssistantAvailability> {
    if (!this.access.check(who, ASSISTANT_NEED).ok) return { enabled: false }
    const route = await this.routes.get('assistant')
    return { enabled: route?.enabled === true }
  }

  async list(who: Actor, q: AssistantSessionListQuery): Promise<AssistantSessionList> {
    const rows = await this.sessions.list(who.id, cursorOf(q.before), ASSISTANT_SESSION_PAGE + 1)
    const page = rows.slice(0, ASSISTANT_SESSION_PAGE)
    const last = page.at(-1)
    const more = rows.length > ASSISTANT_SESSION_PAGE && last
    return { sessions: page.map(sessionOf), nextBefore: more ? cursorText(last) : null }
  }

  /** The footer is rebuilt as the turn wrote it: distinct records per kind, and the
   *  next steps its tool counts from the stored call. While a turn runs the screen
   *  polls: such a read neither touches `last_opened_at` nor re-checks again. */
  async detail(who: Actor, id: string): Promise<AssistantSessionDetail> {
    const found = await this.sessions.find(who.id, id)
    if (!found) throw NO_SESSION()
    const rows = await this.sessions.messages(id)
    const running = rows.find((r) => r.state === 'running')
    const session = running ? found : ((await this.sessions.touch(who.id, id)) ?? found)
    const answers = rows.filter((r) => r.role === 'assistant')
    const calls = await this.turnsRepo.callsOf(answers.map((r) => r.id))
    const chat = answers.map((r) => ({ id: r.id, codes: codesIn(calls, r.id) }))
    const check = await this.checkOnce(who, running?.id ?? null, () =>
      recheck(this.gate, who, chat),
    )
    const messageOf = (row: AssistantMessageRowDb): AssistantMessage => {
      const shut = check.shut.get(row.id)
      const read = shut ? [] : [...(check.refs.get(row.id) ?? [])]
      const steps = (calls.get(row.id) ?? []).reduce((n, c) => n + this.gate.stepsOf(c), 0)
      const reads = { refs: new Map(read.map((r) => [r.code, r])), steps }
      return {
        id: row.id,
        seq: row.seq,
        role: row.role,
        body: shut ? '' : row.body,
        refs: read,
        withheld: shut === 'withheld',
        unchecked: shut === 'unchecked',
        state: row.state,
        endedBy: row.endedBy ?? null,
        footer:
          row.role === 'assistant' && !shut
            ? footerOf(reads, row.finishedAt ?? row.createdAt)
            : null,
        createdAt: row.createdAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
      }
    }
    return { session: sessionOf(session), messages: rows.map(messageOf) }
  }

  /** Keyed by the reader's grant too, so a permission changed mid-turn is not reused. */
  private async checkOnce(
    who: Actor,
    runningId: string | null,
    fresh: () => Promise<Recheck>,
  ): Promise<Recheck> {
    if (!runningId) return fresh()
    const now = Date.now()
    for (const [key, entry] of this.whileRunning) {
      if (now - entry.at > RUNNING_CHECK_MS) this.whileRunning.delete(key)
    }
    const key = [who.id, runningId, who.permissions.join(','), who.branches.join(',')].join('|')
    const held = this.whileRunning.get(key)
    if (held) return held.check
    const check = await fresh()
    this.whileRunning.set(key, { at: now, check })
    return check
  }

  async patch(who: Actor, id: string, body: AssistantSessionPatchBody): Promise<AssistantSession> {
    const row = await this.sessions.patch(who.id, id, body)
    if (!row) throw NO_SESSION()
    return sessionOf(row)
  }

  async remove(who: Actor, id: string): Promise<void> {
    if (!(await this.sessions.find(who.id, id))) throw NO_SESSION()
    this.turns.stopSession(id)
    await this.sessions.remove(who.id, id)
  }

  async report(who: Actor, messageId: string, body: AssistantReportBody): Promise<void> {
    if (!(await this.sessions.report(who.id, messageId, body))) throw notFound('câu trả lời')
  }

  /** Other people's chat text, so each answer is re-checked as the reader, its whole
   *  chat up to it, and a shut one leaves with no question, answer or note. One
   *  audit line per page, before the rows leave, as `ThreadService.trailContentRead`.
   *  `hidden` is 0: a shut row is still listed, marked. */
  async reports(who: Actor, q: AssistantReportQuery): Promise<AssistantReportResponse> {
    const { rows, total } = await this.sessions.reports(q.page, q.size)
    const chats = await Promise.all(rows.map((r) => this.turnsRepo.answersOf(r.sessionId, r.seq)))
    const calls = await this.turnsRepo.callsOf([...new Set(chats.flat())])
    const chatCodes = chats.map((ids) => ids.map((id) => ({ id, codes: codesIn(calls, id) })))
    const check = await recheckChats(this.gate, who, chatCodes)
    const shown = rows.map(({ messageId, sessionId: _s, seq: _q, ...row }) => {
      const shut = check.shut.get(messageId)
      const text = shut ? { question: '', answer: '', note: null } : {}
      return {
        ...row,
        ...text,
        at: row.at.toISOString(),
        withheld: shut === 'withheld',
        unchecked: shut === 'unchecked',
      }
    })
    const read = shown.filter((r) => !r.withheld && !r.unchecked).length
    if (rows.length > 0) {
      const note = `assistant.reports · page ${q.page} · ${read} answer(s)`
      await this.audit.write({ actorId: who.id, action: 'view', note })
    }
    return { rows: shown, total, hidden: 0 }
  }
}
