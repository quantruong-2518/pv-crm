// @vitest-environment node
import 'reflect-metadata'
import type { AccessControl } from '@pv/engines'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiUnavailableError } from '@api/platform/ai/ai-errors'
import type { ActorRepository } from '@api/platform/session/actor.repository'
import type { AuditRepository } from '@api/platform/audit/audit.repository'
import type { LeadAiFillRepository } from './lead-ai-fill.repository'
import { LeadAiFillRunner } from './lead-ai-fill.runner'
import { LeadAiFillService } from './lead-ai-fill.service'
import type { LeadAiJobRepository } from './lead-ai-job.repository'
import type { LeadEnricher } from './lead-enrich'
import { LeadScanService } from './lead-scan.service'
import type { LeadRepository } from './lead.repository'

/** `ai-read` lines for the two queued AI jobs. Stubs around the real runner and
 *  service: the order of the write and the vendor call is the whole assertion. */

const USER = 'u-sale'
const LEAD = 'LD-0001'
const JOB = '6f3c1f0a-0000-4000-8000-000000000001'
const BATCH = 'SCN-2611-01'
const FILE = '6f3c1f0a-0000-4000-8000-000000000002'
const SECRET_NAME = 'cards-of-the-director.jpg'

let calls: string[]
let audit: { write: ReturnType<typeof vi.fn> }

beforeEach(() => {
  calls = []
  audit = {
    write: vi.fn(async () => {
      calls.push('audit')
    }),
  }
})

const emptyRow = {
  company: 'Công ty ACME',
  contactName: 'Nguyễn An',
  accountCode: null,
  website: null,
  taxCode: null,
  legalName: null,
  address: null,
  province: null,
  categoryId: null,
  mainProduct: null,
  sizeBand: null,
  contactTitle: null,
  phone: null,
}

describe('lead.ai-fill delivery', () => {
  const build = (over: { held?: boolean; allowed?: boolean } = {}) => {
    const { held = true, allowed = true } = over
    const jobs = {
      claim: vi.fn(async () => ({ id: JOB, leadCode: LEAD, actorId: USER })),
      step: vi.fn(async () => {}),
      fail: vi.fn(async () => {}),
      done: vi.fn(async () => true),
      actorDisabled: vi.fn(async () => false),
    }
    const enricher = {
      suggest: vi.fn(async () => {
        calls.push('vendor')
        return {}
      }),
    }
    const runner = new LeadAiFillRunner(
      jobs as unknown as LeadAiJobRepository,
      {
        byCode: vi.fn(async () => ({ row: emptyRow, holds: held, industries: [] })),
      } as unknown as LeadRepository,
      {
        industryLists: vi.fn(async () => ({ categories: [], industries: [] })),
        run: vi.fn(async (work: (tx: unknown) => Promise<void>) => work({})),
      } as unknown as LeadAiFillRepository,
      {
        clash: vi.fn(async () => []),
        apply: vi.fn(async () => []),
      } as unknown as LeadAiFillService,
      enricher as unknown as LeadEnricher,
      {
        byId: vi.fn(async () => ({ actor: { id: USER } })),
      } as unknown as ActorRepository,
      audit as unknown as AuditRepository,
      { check: () => ({ ok: allowed }) } as unknown as AccessControl,
    )
    return { runner, jobs, enricher }
  }

  it('writes one line in the presser name, before the call', async () => {
    const { runner } = build()
    await runner.run(JOB, { final: false })

    expect(calls).toEqual(['audit', 'vendor'])
    expect(audit.write).toHaveBeenCalledTimes(1)
    const [entry] = audit.write.mock.calls[0]!
    expect(entry).toMatchObject({ actorId: USER, action: 'ai-read', code: LEAD })
    expect(entry.note).toMatch(new RegExp(`^lead\\.ai-fill ${JOB} · \\d+ field\\(s\\) wanted$`))
    expect(entry.note).not.toContain(emptyRow.company)
  })

  it('writes no line and calls nothing when the job is refused at run time', async () => {
    for (const refused of [{ held: false }, { allowed: false }]) {
      const { runner, jobs, enricher } = build(refused)
      await runner.run(JOB, { final: false })
      expect(audit.write).not.toHaveBeenCalled()
      expect(enricher.suggest).not.toHaveBeenCalled()
      expect(jobs.fail).toHaveBeenCalledTimes(1)
    }
  })

  it('calls no vendor when the audit write fails, and retries', async () => {
    audit.write.mockRejectedValue(new Error('the disk is full'))
    const { runner, enricher } = build()
    await expect(runner.run(JOB, { final: false })).rejects.toThrow('transient failure')
    expect(enricher.suggest).not.toHaveBeenCalled()
  })

  it('writes a second line on a retry that reaches the vendor again', async () => {
    const { runner, enricher } = build()
    enricher.suggest.mockRejectedValueOnce(new Error('vendor dropped'))
    await expect(runner.run(JOB, { final: false })).rejects.toThrow('transient failure')
    await runner.run(JOB, { final: false })
    expect(audit.write).toHaveBeenCalledTimes(2)
  })

  it('writes no line on a press the door refuses', async () => {
    const enqueue = vi.fn()
    const press = (found: unknown) =>
      new LeadAiFillService(
        { byCode: vi.fn(async () => found) } as never,
        {} as never,
        {} as never,
        {} as never,
        audit as unknown as AuditRepository,
        {} as never,
        {} as never,
        {} as never,
        { enqueue } as never,
      ).press({ id: USER } as never, LEAD as never)

    await expect(press(null)).rejects.toMatchObject({ status: 404 })
    await expect(press({ row: emptyRow, holds: false, industries: [] })).rejects.toBeDefined()
    expect(enqueue).not.toHaveBeenCalled()
    expect(audit.write).not.toHaveBeenCalled()
  })
})

describe('scan.read delivery', () => {
  const build = (claimed: { batchCode: string } | null = { batchCode: BATCH }) => {
    const repo = {
      claimFile: vi.fn(async () => claimed),
      file: vi.fn(async () => ({
        id: FILE,
        name: SECRET_NAME,
        storageKey: 'scan/key.jpg',
        mime: 'image/jpeg',
      })),
      batch: vi.fn(async () => ({ code: BATCH, createdBy: USER, state: 'READING' })),
      run: vi.fn(async (work: (tx: unknown) => Promise<void>) => work({})),
      finishFile: vi.fn(async () => {}),
      readyIfDone: vi.fn(async () => null),
    }
    const reader = {
      read: vi.fn(async () => {
        calls.push('vendor')
        return {
          extraction: { kind: 'CARD', people: [], companies: [], unsure: [] },
          model: 'm',
          tokensIn: 1,
          tokensOut: 1,
        }
      }),
    }
    const storage = { read: vi.fn(async () => Buffer.from('four')) }
    const ai = { check: vi.fn(async () => {}) }
    const scan = new LeadScanService(
      repo as never,
      {} as never,
      {} as never,
      { scanCampaign: vi.fn(async () => {}) } as never,
      {} as never,
      storage as never,
      reader as never,
      {} as never,
      {} as never,
      ai as never,
      audit as unknown as AuditRepository,
    )
    return { scan, repo, reader, storage, ai }
  }

  it('writes one line in the uploader name, before the call, with no file name', async () => {
    const { scan, repo } = build()
    await scan.readFile(FILE, { final: false })

    expect(calls).toEqual(['audit', 'vendor'])
    expect(audit.write).toHaveBeenCalledTimes(1)
    const [entry] = audit.write.mock.calls[0]!
    expect(entry).toEqual({
      actorId: USER,
      action: 'ai-read',
      code: BATCH,
      note: `lead.scan ${FILE} · 4 byte(s)`,
    })
    expect(repo.finishFile).toHaveBeenCalledTimes(1)
  })

  it('writes no line for a file it did not claim, or whose bytes are gone', async () => {
    const skipped = build(null)
    await skipped.scan.readFile(FILE, { final: false })
    expect(skipped.reader.read).not.toHaveBeenCalled()

    const gone = build()
    gone.storage.read.mockRejectedValue(new Error('no such object'))
    await expect(gone.scan.readFile(FILE, { final: false })).rejects.toThrow('transient')
    expect(gone.reader.read).not.toHaveBeenCalled()

    expect(audit.write).not.toHaveBeenCalled()
  })

  it('calls no vendor when the audit write fails, retrying until the last delivery', async () => {
    audit.write.mockRejectedValue(new Error('the disk is full'))
    const { scan, reader, repo } = build()
    await expect(scan.readFile(FILE, { final: false })).rejects.toThrow('transient')
    expect(repo.finishFile).not.toHaveBeenCalled()

    await scan.readFile(FILE, { final: true })
    expect(reader.read).not.toHaveBeenCalled()
    expect(repo.finishFile).toHaveBeenCalledWith(
      {},
      FILE,
      expect.objectContaining({ state: 'FAILED' }),
    )
  })

  it('writes a second line on a redelivery that reaches the vendor again', async () => {
    const { scan, reader } = build()
    reader.read.mockRejectedValueOnce(new Error('vendor dropped'))
    await expect(scan.readFile(FILE, { final: false })).rejects.toThrow('transient')
    await scan.readFile(FILE, { final: false })
    expect(audit.write).toHaveBeenCalledTimes(2)
  })

  it('writes no line on a press the route refuses', async () => {
    const { scan, ai } = build()
    ai.check.mockRejectedValue(new AiUnavailableError('lead-scan', 'disabled'))
    const body = { files: [] }
    await expect(scan.create({ id: USER } as never, body as never)).rejects.toMatchObject({
      status: 409,
    })
    expect(audit.write).not.toHaveBeenCalled()
  })
})
