import { eq, inArray } from 'drizzle-orm'
import type { AssistantSessionDetail } from '@pv/contracts'
import { AssistantToolGate } from '@api/platform/assistant/assistant-tools'
import { assistantMessage, assistantReport } from '@api/platform/assistant/assistant.schema'
import { AssistantRepository } from '@api/platform/assistant/assistant.repository'
import { AssistantService } from '@api/platform/assistant/assistant.service'
import { AssistantSessionRepository } from '@api/platform/assistant/assistant-session.repository'
import { AiRouteRepository } from '@api/platform/ai/ai-route.repository'
import { objectRef } from '@api/platform/db/platform.schema'
import { newSession, runTurn } from './bench'
import type { Check, Tally } from './report'
import { askCall } from './scope-door'
import {
  auditCount,
  contentLines,
  newLines,
  PAGE_LINE,
  REPORTS_LINE,
  SESSION_LINE,
  SUMMARY_LINE,
} from './scope-history-audit'
import { NAMED_SEATS, ROLE_SEATS, wideSeatId, type Seat } from './seed-data'
import { deferred } from './stub-tools'
import type { World } from './world'

/** A stored answer that read comm summaries (ADR 0147, 10/11/2026). Reading again is
 *  gated twice: by `comm.view-content`, and by the reach the comms door had when it
 *  served the text. A lead that moves to another seller shuts the answers that read it
 *  for the seller who stays on its deal, though that seller still holds the grant.
 *
 *  Serving them again is the text leaving a second time, so each reload writes the
 *  `view` line the comms door writes: one per subject code, none for a shut answer. */

const GROUP = 'scope-history'
const reader = NAMED_SEATS.reach
const reviewer = ROLE_SEATS.find((s) => s.id === wideSeatId('account-executive'))
const blind: Seat | undefined = reviewer && {
  ...reviewer,
  permissions: reviewer.permissions.filter((p) => p !== 'comm.view-content'),
}

export const serviceOf = (world: World): AssistantService =>
  new AssistantService(
    new AssistantSessionRepository(world.db),
    new AssistantRepository(world.db),
    new AssistantToolGate({ tools: () => world.tools }, world.gateAccess),
    /* Only `remove` stops a running turn; nothing here removes a chat. */
    {} as never,
    new AiRouteRepository(world.db),
    world.audits,
    world.gateAccess,
  )

export const answersOf = (detail: AssistantSessionDetail) =>
  detail.messages.filter((m) => m.role === 'assistant')

type ChainRow = NonNullable<ReturnType<World['seeded']['chains']['get']>>
type Chat = { sessionId: string; answerIds: string[] }

/** Plain, deal, lead, lead again, plain: two subject codes, one of them read twice. */
async function readChat(world: World, deal: string, head: string, c: Check): Promise<Chat> {
  const sessionId = await newSession(world.db, reader.id)
  const read = (kind: string, code: string) => ({ name: 'get_history', input: { kind, code } })
  /* Plain answers cite no ids, so only the reach re-check can shut them, not the book one. */
  const said = (text: string) => [{ deltas: [text] }]
  const turns = [
    said('Chào.'),
    [{ calls: [read('opportunity', deal)] }, { deltas: ['Đã đọc lịch sử cơ hội.'] }],
    [{ calls: [read('lead', head)] }, { deltas: ['Đã đọc lịch sử khách tiềm năng.'] }],
    [{ calls: [read('lead', head)] }, { deltas: ['Đã đọc lại lịch sử khách tiềm năng.'] }],
    said('Xong.'),
  ]
  const flags: boolean[][] = []
  for (const script of turns) {
    const trail = await runTurn(world, { who: reader, sessionId, script })
    c.eq(trail.turn?.endedBy, 'answer', 'the turn ends normally')
    flags.push(trail.toolRows.map((r) => r.revealsContent))
  }
  c.eq(flags, [[], [true], [true], [true], []], 'the calls that read a summary are flagged')
  const detail = await serviceOf(world).detail(reader, sessionId)
  return { sessionId, answerIds: answersOf(detail).map((m) => m.id) }
}

const running = async (world: World, sessionId: string): Promise<boolean> =>
  (
    await world.db.select().from(assistantMessage).where(eq(assistantMessage.sessionId, sessionId))
  ).some((m) => m.state === 'running')

/** Only the object mirror moves: the comms door reaches by it, the book recheck by the
 *  lead row, so nothing but the reach re-check can tell the reader lost the subject. */
async function moveMirror(world: World, code: string, ownerId: string | null): Promise<void> {
  await world.db.update(objectRef).set({ ownerId }).where(eq(objectRef.code, code))
}

async function reportLines(
  world: World,
  service: AssistantService,
  c: Check,
  who: Seat,
  want: { withheld: boolean; codes: string[] },
): Promise<void> {
  const { result, lines } = await newLines(world, [PAGE_LINE, REPORTS_LINE], () =>
    service.reports(who, { page: 1, size: 50 }),
  )
  c.eq(
    result.rows.map((r) => r.withheld),
    [want.withheld],
    'the reported answer',
  )
  c.eq(lines.filter((l) => !l.code).length, 1, 'one page line')
  c.ok(
    lines.filter((l) => !l.code).every((l) => l.note.startsWith(`${REPORTS_LINE} 1`)),
    'page',
  )
  const perCode = lines.filter((l) => l.code)
  c.eq(perCode.map((l) => l.code).sort(), want.codes, 'one line per subject code')
  c.ok(
    perCode.every((l) => l.action === 'view'),
    'a view line',
  )
  c.ok(
    perCode.every((l) => l.note.startsWith(`${PAGE_LINE} 1`)),
    'the note names the page',
  )
}

async function shutByReach(
  world: World,
  tally: Tally,
  service: AssistantService,
  chat: Chat,
  chain: ChainRow,
  codes: string[],
): Promise<void> {
  await tally.run(
    GROUP,
    'a lead moved away shuts the answers that read it, and those after',
    async (c) => {
      await moveMirror(world, chain.lead, 'rival')
      const at = (kind: string, code: string) => ({ name: 'get_history', input: { kind, code } })
      const lead = await askCall(world, reader, at('lead', chain.lead), chain)
      const deal = await askCall(world, reader, at('opportunity', chain.opportunity), chain)
      c.ok(lead.ok && deal.ok, 'the premise: the book still opens both, so it shuts nothing')
      c.ok(reader.permissions.includes('comm.view-content'), 'and the grant is still held')

      const before = await auditCount(world)
      const reach = await world.debriefs.reachable(reader, codes)
      c.eq([...reach], [chain.opportunity], 'the reach read answers the deal only')
      c.eq(await auditCount(world), before, 'the reach read writes no audit line')

      const { result, lines } = await contentLines(world, async () =>
        newLines(world, [SESSION_LINE], () => service.detail(reader, chat.sessionId)),
      )
      const answers = answersOf(result.result)
      c.eq(
        answers.map((m) => m.withheld),
        [false, false, true, true, true, true],
        'the answers from the first read of the lead on are withheld',
      )
      c.ok(!answers.some((m) => m.unchecked), 'withheld, not unchecked')
      c.eq(
        answers.map((m) => m.body === ''),
        [false, false, true, true, true, true],
        'a shut answer has no body',
      )
      c.eq(lines, [], 'no summary was read to decide it')
      c.eq(
        result.lines.map((l) => l.code),
        [chain.opportunity],
        'only the deal answer is served again, so only its line',
      )
      const gone = answers.slice(2).map((m) => m.id)
      const replay = await runTurn(world, {
        who: reader,
        sessionId: chat.sessionId,
        script: [{ deltas: ['Xong.'] }],
      })
      const sent = JSON.stringify(replay.witness.seen[0]?.request.messages ?? [])
      const bodies = replay.messages.filter((m) => gone.includes(m.id)).map((m) => m.body)
      c.ok(bodies.every((b) => b !== '') && bodies.length === gone.length, 'the shut bodies exist')
      c.eq(
        bodies.filter((b) => sent.includes(JSON.stringify(b).slice(1, -1))),
        [],
        'a shut answer is not replayed to the model',
      )
      c.ok(!sent.includes(SUMMARY_LINE), 'nothing of the audit lines either')
    },
  )
}

export async function reachRecheck(world: World, tally: Tally): Promise<void> {
  const chain = world.seeded.chains.get('hist-reach')
  if (!chain || !reviewer || !blind) throw new Error('no chain hist-reach or no executive seat')
  const service = serviceOf(world)
  const codes = [chain.lead, chain.opportunity].sort()
  const [was] = await world.db
    .select({ ownerId: objectRef.ownerId })
    .from(objectRef)
    .where(eq(objectRef.code, chain.lead))
  const mine = (id: string) => `${SESSION_LINE} ${id}`
  let chat: Chat = { sessionId: '', answerIds: [] }
  await tally.run(
    GROUP,
    'a chat that read comm summaries is built for the reload checks',
    async (c) => {
      chat = await readChat(world, chain.opportunity, chain.lead, c)
      c.eq(chat.answerIds.length, 5, 'five answers')
    },
  )

  await tally.run(
    GROUP,
    'a reload writes one view line per subject that read a summary',
    async (c) => {
      const { result, lines } = await newLines(world, [SESSION_LINE], () =>
        service.detail(reader, chat.sessionId),
      )
      c.eq(
        answersOf(result).map((m) => m.withheld || m.unchecked),
        Array<boolean>(5).fill(false),
        'every answer is served',
      )
      c.eq(
        lines.map((l) => l.code).sort(),
        codes,
        'one line per subject code, the lead read twice counted once',
      )
      c.ok(
        lines.every((l) => l.action === 'view'),
        'a view line',
      )
      c.ok(
        lines.every((l) => l.note.startsWith(mine(chat.sessionId))),
        'the note names the session',
      )
    },
  )

  await tally.run(GROUP, 'a chat polled while a turn runs writes no re-serve line', async (c) => {
    const gate = deferred()
    const held = runTurn(world, {
      who: reader,
      sessionId: chat.sessionId,
      script: [
        async () => {
          await gate.held
          return { deltas: ['Xong.'] }
        },
      ],
    })
    while (!(await running(world, chat.sessionId))) await new Promise((r) => setTimeout(r, 5))
    const polled = await newLines(world, [SESSION_LINE], () =>
      service.detail(reader, chat.sessionId),
    )
    gate.release()
    const done = await held
    c.eq(done.turn?.state, 'done', 'the held turn finishes')
    c.eq(polled.lines, [], 'no line while the turn runs')
    c.ok(answersOf(polled.result).length >= 5, 'the poll still lists the chat')
    chat.answerIds.push(done.turn?.id ?? '')
  })

  await tally.run(
    GROUP,
    'the report list writes its page line and a line per subject code',
    async (c) => {
      const last = chat.answerIds.at(-1) ?? ''
      await service.report(reader, last, { reason: 'missing' })
      await reportLines(world, service, c, reviewer, { withheld: false, codes })
    },
  )
  await tally.run(
    GROUP,
    'a reviewer without comm.view-content gets the page line only',
    async (c) => {
      await reportLines(world, service, c, blind, { withheld: true, codes: [] })
    },
  )

  await shutByReach(world, tally, service, chat, chain, codes)
  /* Also the control: the shut was the reach and nothing stuck. The run moves no business table. */
  await tally.run(GROUP, 'moved back, the same chat is served again', async (c) => {
    await moveMirror(world, chain.lead, was?.ownerId ?? null)
    await world.db.delete(assistantReport).where(inArray(assistantReport.messageId, chat.answerIds))
    const detail = await service.detail(reader, chat.sessionId)
    c.eq(
      answersOf(detail).map((m) => m.withheld || m.unchecked),
      Array<boolean>(answersOf(detail).length).fill(false),
      'every answer is served',
    )
  })
}
