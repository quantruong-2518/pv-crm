// @vitest-environment node
import 'reflect-metadata'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { createAccessControl, type Actor } from '@pv/engines'
import type { CommAiReportBody } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { AiVendorError, type AiAnswer, type AiClient, type AiPart } from '../ai/ai-client'
import { AiGateway } from '../ai/ai-gateway'
import { AiLedger } from '../ai/ai-ledger'
import { AiRouteRepository } from '../ai/ai-route.repository'
import { AiRouteService } from '../ai/ai-route.service'
import { AuditRepository } from '../audit/audit.repository'
import { RolePermissionRepository } from '../roles/role-permission.repository'
import { ActorRepository } from '../session/actor.repository'
import { CommAiJobRepository } from './comm-ai-job.repository'
import { CommAiJobRunner } from './comm-ai-job.runner'
import { CommAiJobService } from './comm-ai-job.service'
import { COMM_AI_JOB_STALE_MS, CommAiJobSweeper } from './comm-ai-job.sweeper'
import { CommAttachmentRepository } from './comm-attachment.repository'
import type { CommDebriefHook, CommReportContext } from './comm-debrief.hook'
import { CommReportService } from './comm-report.service'
import { DebriefRepository } from './debrief.repository'
import { DebriefService } from './debrief.service'
import { ThreadRepository } from './thread.repository'
import { ThreadService } from './thread.service'

vi.mock('@api/platform/db/db.module', () => ({ DB: 'DB' }))

/** The job on the real migrations in memory PGlite: real repositories, gateway,
 *  E2 and gate. The vendor is a fake `AiClient`; no recording leaves this file.
 *  The branch's hook and object storage are stubs. */
const FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle')
const OWNER = 'actor-owner'
const OTHER = 'actor-other'
const LEAD = 'LD-0001'
const ID = '0b9c7a4e-3f1d-4c2a-9e8b-5a6d7c8e9f01'
const THREAD = '0b9c7a4e-3f1d-4c2a-9e8b-5a6d7c8e9f02'
const MESSAGE = '0b9c7a4e-3f1d-4c2a-9e8b-5a6d7c8e9f03'
const IDENTITY = '0b9c7a4e-3f1d-4c2a-9e8b-5a6d7c8e9f04'
const ID_2 = '0b9c7a4e-3f1d-4c2a-9e8b-5a6d7c8e9f11'
const THREAD_2 = '0b9c7a4e-3f1d-4c2a-9e8b-5a6d7c8e9f12'
const MESSAGE_2 = '0b9c7a4e-3f1d-4c2a-9e8b-5a6d7c8e9f13'
const AUDIO = Buffer.from('fake audio bytes')

const context: CommReportContext = {
  subject: { kind: 'lead', label: 'Công ty An Phát', stateLabel: null },
  vocabulary: { criteria: [], stepKinds: [] } as unknown as CommReportContext['vocabulary'],
  step: null,
  openStep: null,
  meeting: null,
}
const answer: AiAnswer = {
  text: JSON.stringify({
    title: 'Trao đổi báo giá',
    summary: 'Khách đồng ý xem báo giá mới.',
    minutes: 'Biên bản: Trao đổi báo giá',
    answers: [],
    steps: [],
  }),
  complete: true,
  finish: 'STOP',
  tokensIn: 100,
  tokensOut: 50,
}
const PRESS = { part: 'minutes', recordingNotice: true } as const

let client: PGlite
let db: Db
let generate: ReturnType<typeof vi.fn<AiClient['generate']>>
let enqueue: ReturnType<typeof vi.fn<(jobId: string) => Promise<void>>>
let read: ReturnType<typeof vi.fn<(key: string) => Promise<Buffer>>>
let reports: CommReportService
let service: CommAiJobService
let runner: CommAiJobRunner
let sweeper: CommAiJobSweeper
let routeDoor: AiRouteService
let owner: Actor

const rowsOf = async <T>(sql: string, params: unknown[] = []) =>
  (await client.query<T>(sql, params)).rows
const jobRow = async (id: string) =>
  (
    await rowsOf<{
      state: string
      step: number
      step_ms: number[]
      result: { sources: object } | null
      error_kind: string | null
    }>(`SELECT state, step, step_ms, result, error_kind FROM comms.ai_job WHERE id = $1`, [id])
  )[0]
const auditNotes = async () =>
  (await rowsOf<{ action: string; note: string }>(`SELECT action, note FROM platform.audit`)).map(
    (a) => `${a.action}: ${a.note}`,
  )
const attach = (name: string, mime: string, bytes: number, debriefId = ID) =>
  client.query(
    `INSERT INTO platform.attachment
       (storage_key, name, mime, bytes, sha256, owner_kind, owner_code, created_by)
     VALUES ($1, $2, $3, $4, repeat('a', 64), 'comm', $5, $6)`,
    [`comm/${debriefId}/${name}`, name, mime, bytes, debriefId, OWNER],
  )
const texts = (parts: readonly AiPart[]) =>
  parts.flatMap((p) => ('text' in p ? [p.text] : [])).join('\n')

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client) as unknown as Db
  await migrate(drizzle(client), { migrationsFolder: FOLDER })
  await client.exec(`
    INSERT INTO platform.actor (id, name, email, role, role_ids, branches) VALUES
      ('${OWNER}', 'Người bấm', 'owner@pebblevina.com', 'sale', '{sale}', '{Sales}'),
      ('${OTHER}', 'Người khác', 'other@pebblevina.com', 'sale', '{sale}', '{Sales}');
    INSERT INTO platform.object (code, kind, branch, label, owner_id)
      VALUES ('${LEAD}', 'lead', 'Sales', 'Công ty An Phát', '${OWNER}');
    INSERT INTO comms.thread (id, channel, started_at, last_at)
      VALUES ('${THREAD}', 'phone', now(), now());
    INSERT INTO comms.link (thread_id, object_code, linked_by)
      VALUES ('${THREAD}', '${LEAD}', 'human');
    INSERT INTO comms.identity (id, channel, address, side, actor_id)
      VALUES ('${IDENTITY}', 'phone', '0900000000', 'member', '${OWNER}');
    INSERT INTO comms.message (id, thread_id, direction, at, from_identity_id, capture_source)
      VALUES ('${MESSAGE}', '${THREAD}', 'out', now(), '${IDENTITY}', 'manual');
    INSERT INTO comms.debrief (id, thread_id, message_id, owner_id, subject_code)
      VALUES ('${ID}', '${THREAD}', '${MESSAGE}', '${OWNER}', '${LEAD}');
    UPDATE platform.ai_route SET enabled = true WHERE task IN ('comm-report', 'comm-audio-report');`)
}, 120_000)

afterAll(async () => client?.close())

beforeEach(async () => {
  await client.exec(`DELETE FROM comms.ai_job; DELETE FROM platform.attachment;
    DELETE FROM platform.audit; DELETE FROM platform.ai_call;
    DELETE FROM platform.role_permission WHERE role_id = 'sale';
    INSERT INTO platform.role_permission (role_id, permission) VALUES
      ('sale', 'comm.view'), ('sale', 'comm.view-content'), ('sale', 'lead.view');
    UPDATE platform.ai_route SET daily_calls_per_user = 20 WHERE task = 'comm-audio-report';`)
  generate = vi.fn<AiClient['generate']>(async () => answer)
  enqueue = vi.fn(async () => undefined)
  read = vi.fn(async () => AUDIO)

  const vendor: AiClient = { keyed: true, generate, countTokens: vi.fn(), converse: vi.fn() }
  const routes = new AiRouteRepository(db)
  const gateway = new AiGateway(routes, new AiLedger(), { gemini: vendor, anthropic: vendor }, db)
  const access = createAccessControl()
  const audit = new AuditRepository(db)
  const debriefs = new DebriefRepository(db)
  const threads = new ThreadRepository(db)
  const attachments = new CommAttachmentRepository(db)
  const hook = {
    slot: async () => ({ confirmable: true }),
    reportContext: async () => context,
  } as unknown as CommDebriefHook
  reports = new CommReportService(
    new DebriefService(debriefs, threads, {} as never, audit, {} as never, access, hook),
    debriefs,
    threads,
    new ThreadService(threads, audit, debriefs, access),
    attachments,
    { read } as never,
    gateway,
    audit,
    access,
    hook,
  )
  const jobs = new CommAiJobRepository(db)
  service = new CommAiJobService(jobs, reports, attachments, gateway, routes, audit, { enqueue })
  const actors = new ActorRepository(db, new RolePermissionRepository(db))
  runner = new CommAiJobRunner(jobs, reports, actors, access)
  sweeper = new CommAiJobSweeper(jobs)
  routeDoor = new AiRouteService(routes, audit)
  owner = (await actors.byId(OWNER))!.actor
})

describe('the press', () => {
  it('refuses a record with no recording, and writes nothing', async () => {
    await attach('notes.txt', 'text/plain', 10)
    await expect(service.press(owner, ID, PRESS)).rejects.toMatchObject({
      status: 409,
      message: 'Liên hệ này chưa có ghi âm.',
    })
    expect(await rowsOf(`SELECT 1 FROM comms.ai_job`)).toHaveLength(0)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('refuses a second press while one runs, with no second audit line', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    await service.press(owner, ID, PRESS)
    await expect(service.press(owner, ID, PRESS)).rejects.toSatisfy((error) => {
      expect(JSON.stringify(error)).toContain('ai_job_one_active_uq')
      return true
    })
    expect(await rowsOf(`SELECT 1 FROM comms.ai_job`)).toHaveLength(1)
    expect(await auditNotes()).toHaveLength(1)
  })

  it('gives the slot back when the queue refuses', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    enqueue.mockRejectedValueOnce(new Error('queue down'))
    await expect(service.press(owner, ID, PRESS)).rejects.toMatchObject({ status: 429 })
    expect(await rowsOf(`SELECT state FROM comms.ai_job`)).toEqual([{ state: 'FAILED' }])
    await expect(service.press(owner, ID, PRESS)).resolves.toMatchObject({ state: 'QUEUED' })
  })

  it('counts jobs not yet run against the daily limit', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    await client.query(
      `UPDATE platform.ai_route SET daily_calls_per_user = 1 WHERE task = 'comm-audio-report'`,
    )
    await client.exec(`
      INSERT INTO comms.thread (id, channel, started_at, last_at)
        VALUES ('${THREAD_2}', 'phone', now(), now());
      INSERT INTO comms.link (thread_id, object_code, linked_by)
        VALUES ('${THREAD_2}', '${LEAD}', 'human');
      INSERT INTO comms.message (id, thread_id, direction, at, from_identity_id, capture_source)
        VALUES ('${MESSAGE_2}', '${THREAD_2}', 'out', now(), '${IDENTITY}', 'manual');
      INSERT INTO comms.debrief (id, thread_id, message_id, owner_id, subject_code)
        VALUES ('${ID_2}', '${THREAD_2}', '${MESSAGE_2}', '${OWNER}', '${LEAD}');`)
    await attach('call.mp3', 'audio/mpeg', 1000, ID_2)
    await service.press(owner, ID, PRESS)
    await expect(service.press(owner, ID_2, PRESS)).rejects.toMatchObject({ status: 429 })
    expect(await rowsOf(`SELECT 1 FROM comms.ai_job`)).toHaveLength(1)
    await client.exec(`DELETE FROM comms.thread WHERE id = '${THREAD_2}'`)
  })
})

describe('the runner', () => {
  it('runs press to DONE on the largest recording and hands the form the report', async () => {
    await attach('short.mp3', 'audio/mpeg', 1000)
    await attach('meeting.m4a', 'audio/mp4', 5000)
    await attach('quote.txt', 'text/plain', 5)
    read.mockImplementation(async (key) => (key.endsWith('.txt') ? Buffer.from('giá 200') : AUDIO))

    const job = await service.press(owner, ID, { ...PRESS, note: 'Khách hỏi giá' })
    expect(enqueue).toHaveBeenCalledWith(job.id)
    await runner.run(job.id, { final: false })

    const row = await jobRow(job.id)
    expect(row).toMatchObject({ state: 'DONE', step: 3, error_kind: null })
    expect(row?.step_ms).toHaveLength(3)
    expect(row?.result?.sources).toEqual({
      note: true,
      turns: 0,
      files: ['quote.txt', 'meeting.m4a'],
      unread: ['short.mp3'],
    })

    expect(generate).toHaveBeenCalledTimes(1)
    const [model, request] = generate.mock.calls[0]!
    expect(model).toBe('gemini-3.8-flash')
    expect(request.prompt).toBe('comm-audio-report@1')
    const heard = request.parts.findIndex((p) => 'recording' in p)
    expect(request.parts[heard]).toEqual({ recording: { mime: 'audio/mp4', bytes: AUDIO } })
    /* Inside the data block: the closing marker comes after the recording. */
    expect(request.parts.at(-1)).toMatchObject({ text: expect.stringMatching(/^DATA-/) })
    expect(heard).toBeLessThan(request.parts.length - 1)
    expect(texts(request.parts)).toContain('Khách hỏi giá')

    const [notice, read1] = await auditNotes()
    expect(notice).toBe(
      `edit: comms.debrief ${ID} · AI report job ${job.id} · recording notice confirmed`,
    )
    expect(read1).toBe(
      `ai-read: comms.debrief ${ID} · AI report · note 1 · 0 turn(s) · 1 file(s) · 1 unread · 0 past summary(ies) · 1 recording`,
    )

    const { job: detail } = await service.current(owner, ID)
    expect(detail).toMatchObject({ state: 'DONE', note: 'Khách hỏi giá', subjectCode: LEAD })
    expect(detail?.report?.summary).toBe('Khách đồng ý xem báo giá mới.')
    expect((await auditNotes()).at(-1)).toBe(
      `view: comms.debrief ${ID} · read AI report of job ${job.id}`,
    )
    const [tray] = await service.list(owner)
    expect(tray).toMatchObject({ id: job.id, state: 'DONE' })
    expect(tray).not.toHaveProperty('note')
    expect(tray).not.toHaveProperty('report')
  })

  it('takes a recording alone as a source', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    const job = await service.press(owner, ID, PRESS)
    await runner.run(job.id, { final: false })
    expect(await jobRow(job.id)).toMatchObject({ state: 'DONE' })
  })

  it('lets a presser who lost the right write nothing and send nothing', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    const job = await service.press(owner, ID, PRESS)
    await client.query(
      `DELETE FROM platform.role_permission WHERE role_id = 'sale' AND permission = 'comm.view-content'`,
    )
    await runner.run(job.id, { final: false })
    expect(await jobRow(job.id)).toMatchObject({ state: 'FAILED', step: 0, result: null })
    expect(read).not.toHaveBeenCalled()
    expect(generate).not.toHaveBeenCalled()
  })

  it('never redelivers once the model call has started', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    const job = await service.press(owner, ID, PRESS)
    generate.mockRejectedValueOnce(new AiVendorError('transient', 'gemini: 503: busy'))
    await expect(runner.run(job.id, { final: false })).resolves.toBeUndefined()
    expect(await jobRow(job.id)).toMatchObject({ state: 'FAILED', step: 1, error_kind: 'busy' })
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('redelivers a failure before the model call, and only then', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    const job = await service.press(owner, ID, PRESS)
    read.mockRejectedValueOnce(new Error('bucket blip'))
    await expect(runner.run(job.id, { final: false })).rejects.toThrow('transient failure')
    expect(await jobRow(job.id)).toMatchObject({ state: 'RUNNING', step: 0 })
    await runner.run(job.id, { final: true })
    expect(await jobRow(job.id)).toMatchObject({ state: 'DONE' })
  })

  it('does not listen again when a delivery died past the first step', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    const job = await service.press(owner, ID, PRESS)
    await client.query(
      `UPDATE comms.ai_job SET state = 'RUNNING', step = 1, step_ms = '[5]' WHERE id = $1`,
      [job.id],
    )
    await runner.run(job.id, { final: true })
    expect(await jobRow(job.id)).toMatchObject({ state: 'FAILED', step: 1, error_kind: 'busy' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('stops before the model when the job left RUNNING during the read', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    const job = await service.press(owner, ID, PRESS)
    read.mockImplementationOnce(async () => {
      await client.query(
        `UPDATE comms.ai_job SET state = 'FAILED', error_kind = 'failed', error = 'quá lâu',
           finished_at = now() WHERE id = $1`,
        [job.id],
      )
      return AUDIO
    })
    await expect(runner.run(job.id, { final: false })).resolves.toBeUndefined()
    expect(generate).not.toHaveBeenCalled()
    expect(await jobRow(job.id)).toMatchObject({ state: 'FAILED', step: 0, error_kind: 'failed' })
  })

  it.each([
    ['cut at MAX_TOKENS', { complete: false, finish: 'MAX_TOKENS' }],
    ['a bad-JSON answer', { text: 'not json' }],
  ])('pays for one attempt on %s', async (_, wrong) => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    const job = await service.press(owner, ID, PRESS)
    generate.mockResolvedValue({ ...answer, ...wrong })
    await runner.run(job.id, { final: false })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(await jobRow(job.id)).toMatchObject({ state: 'FAILED', step: 1, error_kind: 'failed' })
    expect(await rowsOf(`SELECT 1 FROM platform.ai_call`)).toHaveLength(1)
  })

  it('writes what a dying stream had counted to the ledger', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    const job = await service.press(owner, ID, PRESS)
    const spent = { tokensIn: 900, tokensCached: 0, tokensCacheWrite: 0, tokensOut: 40 }
    generate.mockRejectedValueOnce(new AiVendorError('transient', 'gemini: dropped', spent))
    await runner.run(job.id, { final: false })
    expect(await rowsOf(`SELECT tokens_in, tokens_out, outcome FROM platform.ai_call`)).toEqual([
      { tokens_in: 900, tokens_out: 40, outcome: 'error' },
    ])
  })

  it('counts a report nothing survives as a busy failure', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    const job = await service.press(owner, ID, PRESS)
    const blank = JSON.stringify({ title: null, summary: ' ', minutes: '', answers: [], steps: [] })
    generate.mockResolvedValueOnce({ ...answer, text: blank })
    await runner.run(job.id, { final: false })
    expect(await jobRow(job.id)).toMatchObject({ state: 'FAILED', error_kind: 'busy' })
  })
})

describe('the tray', () => {
  const stranger = () => ({ ...owner, id: OTHER }) as Actor

  it('keeps a job its presser’s alone', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    const job = await service.press(owner, ID, PRESS)
    await runner.run(job.id, { final: false })
    expect(await service.list(stranger())).toEqual([])
    await service.dismissFinished(stranger())
    expect(await service.list(owner)).toHaveLength(1)
  })

  it('dismisses only finished jobs, and hides them from the form', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    const job = await service.press(owner, ID, PRESS)
    await service.dismissFinished(owner)
    expect(await service.list(owner)).toHaveLength(1)
    await runner.run(job.id, { final: false })
    await service.dismissFinished(owner)
    expect(await service.list(owner)).toEqual([])
    expect((await service.current(owner, ID)).job).toBeNull()
  })

  it('leaves no read line while the form has no report to read', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    await service.press(owner, ID, { ...PRESS, note: 'Khách hỏi giá' })
    expect((await service.current(owner, ID)).job).toMatchObject({ state: 'QUEUED' })
    expect((await auditNotes()).some((line) => line.startsWith('view:'))).toBe(false)
  })

  it('fails what is stuck and deletes what is a day old', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    const job = await service.press(owner, ID, PRESS)
    await client.query(`UPDATE comms.ai_job SET created_at = $1`, [
      new Date(Date.now() - COMM_AI_JOB_STALE_MS - 1000),
    ])
    await sweeper.sweep(Date.now())
    expect(await jobRow(job.id)).toMatchObject({ state: 'FAILED', error_kind: 'failed' })

    expect(await sweeper.sweep(Date.now() + 1000)).toBeNull()
    await client.query(`UPDATE comms.ai_job SET finished_at = now() - interval '25 hours'`)
    await sweeper.sweep(Date.now() + 10 * 60_000)
    expect(await jobRow(job.id)).toBeUndefined()
  })
})

describe('the route door', () => {
  const route = {
    primaryModel: 'gemini-3.8-flash',
    fallbackModel: null,
    maxTokensIn: null,
    maxTokensOut: 32768,
    timeoutMs: 540_000,
    dailyCallsPerUser: 20,
    dailyTokenBudget: 0,
    enabled: true,
  }

  it.each([
    ['fallbackModel', { fallbackModel: 'gemini-3.5-flash' }],
    ['fallbackModel', { fallbackModel: 'claude-sonnet-5-5' }],
    ['maxTokensIn', { maxTokensIn: 100_000 }],
  ])('refuses %s on the recording route', async (field, wrong) => {
    await expect(
      routeDoor.set(owner, 'comm-audio-report', { ...route, ...wrong }),
    ).rejects.toMatchObject({ status: 400, fields: { [field]: expect.any(Array) } })
  })

  it('saves the recording route without them, and leaves other tasks their fallback', async () => {
    await expect(routeDoor.set(owner, 'comm-audio-report', route)).resolves.toMatchObject({
      enabled: true,
    })
    const other = { ...route, timeoutMs: 60_000, fallbackModel: 'claude-sonnet-5-5' }
    await expect(routeDoor.set(owner, 'lead-enrich', other)).resolves.toMatchObject({
      fallbackModel: 'claude-sonnet-5-5',
    })
  })
})

describe('the synchronous door', () => {
  it('keeps its route, its prompt, its audit line, and leaves a recording unread', async () => {
    await attach('call.mp3', 'audio/mpeg', 1000)
    const body: CommAiReportBody = { note: 'Ghi chú' }
    const report = await reports.report(owner, ID, body)
    expect(report.sources).toEqual({ note: true, turns: 0, files: [], unread: ['call.mp3'] })
    const [, request] = generate.mock.calls[0]!
    expect(request.prompt).toBe('comm-report@1')
    expect(request.parts.some((p) => 'recording' in p)).toBe(false)
    expect(await auditNotes()).toEqual([
      `ai-read: comms.debrief ${ID} · AI report · note 1 · 0 turn(s) · 0 file(s) · 1 unread · 0 past summary(ies)`,
    ])
    expect(read).not.toHaveBeenCalled()
  })
})
