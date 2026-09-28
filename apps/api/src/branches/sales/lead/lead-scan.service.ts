import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { normaliseEmail, planLeadScan, taxRoot, type Actor, type ScanPlan } from '@pv/engines'
import {
  LeadAttachmentsResponse,
  LeadScanAddFilesResponse,
  LeadScanCreateResponse,
  LeadScanResponse,
  SCAN_DAILY_BATCHES_PER_USER,
  SCAN_MAX_FILES,
  type LeadScanAddFilesBody,
  type LeadScanCreateBody,
  type LeadScanStartBody,
  type ObjectCode,
  type ScanBatchState,
  type ScanFileDeclared,
  type ScanUploadMime,
  type ScanUploadSlot,
} from '@pv/contracts'
import { ENV, type Env } from '@api/platform/config/env'
import { conflict, invalid, notFound, rateLimited } from '@api/platform/http/problem'
import { StorageObjectMissingError, StorageService } from '@api/platform/storage/storage.service'
import {
  SCAN_READER,
  ScanOutputError,
  ScanReaderDisabledError,
  type ScanReader,
} from '@api/platform/ai/scan-reader'
import { SCAN_ENQUEUE, type ScanAttempt, type ScanEnqueue } from '@api/platform/queue/scan-jobs'
import type { Db } from '@api/platform/db/db.module'
import type { ScanBatchRowDb } from './lead-scan.schema'
import { LeadScanRepository, type ScanFileJoined } from './lead-scan.repository'
import {
  isEmpty,
  noteOf,
  toAttachment,
  toPreview,
  toReadFiles,
  toScanFile,
} from './lead-scan.mapper'
import { LeadRepository } from './lead.repository'
import { LeadService } from './lead.service'
import { LeadWriteRepository } from './lead-write.repository'
import { LeadWriteService } from './lead-write.service'

/** The scan door's HTTP half plus the per-file read job.
 *
 *  A batch belongs to its uploader alone: every door answers 404 to anyone
 *  else, so a code guessed off a colleague's screen reveals nothing. Queue
 *  and storage calls run AFTER the transaction commits — on PGlite a second
 *  connection inside an open transaction waits on itself — so a crash in
 *  between leaves a QUEUED file, never a job for a row that does not exist. */

export const FILE_FAILED = 'Không đọc được tệp này'
const CANCELLED = 'Bạn đã huỷ lô này.'
const PREVIEWED = ['READY', 'COMMITTING', 'DONE'] as const
/** Before the commit press, a batch's file set may still change or be dropped. */
const OPEN: readonly ScanBatchState[] = ['UPLOADING', 'READING', 'READY']
const closed = (code: string) => conflict(`Lô ${code} đã đóng — không thêm, đọc hay huỷ được nữa.`)
const EXT: Record<ScanUploadMime, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'application/pdf': 'pdf',
}

@Injectable()
export class LeadScanService {
  private readonly log = new Logger('LeadScan')

  constructor(
    private readonly repo: LeadScanRepository,
    private readonly leads: LeadRepository,
    private readonly profiles: LeadService,
    private readonly write: LeadWriteService,
    private readonly writeRepo: LeadWriteRepository,
    private readonly storage: StorageService,
    @Inject(SCAN_READER) private readonly reader: ScanReader,
    @Inject(SCAN_ENQUEUE) private readonly queue: ScanEnqueue,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** `POST /sales/leads/scan`. */
  async create(who: Actor, body: LeadScanCreateBody): Promise<LeadScanCreateResponse> {
    await this.admit()
    const motion = body.campaignCode ? 'EVENT' : 'OUTBOUND'
    await this.write.scanCampaign(motion, body.campaignCode)
    const code = await this.repo.nextCode()
    const { slots, attachments, files } = await this.declare(who, code, body.files, new Map())
    await this.repo.run(async (tx) => {
      /* Counted under a per-uploader lock, in the insert's own transaction:
         two parallel creates cannot both see nine. */
      await this.repo.lockUploader(tx, who.id)
      if ((await this.repo.batchesLastDay(who.id, tx)) >= SCAN_DAILY_BATCHES_PER_USER) {
        throw rateLimited(
          `Bạn đã nạp đủ ${SCAN_DAILY_BATCHES_PER_USER} lô trong 24 giờ qua — thử lại sau.`,
        )
      }
      await this.repo.insertBatch(tx, {
        code,
        motion,
        campaignCode: body.campaignCode ?? null,
        createdBy: who.id,
      })
      await this.repo.insertFiles(tx, attachments, files)
    })
    return LeadScanCreateResponse.parse({ code, files: slots })
  }

  /** `POST /sales/leads/scan/:code/files` — more files, or the successor of
   *  one FAILED file. The FAILED row stays until `start` retires it, so a
   *  failed PUT or a `duplicateOf` answer loses nothing. Not a new batch, so
   *  only the AI budget applies. */
  async addFiles(
    who: Actor,
    code: string,
    body: LeadScanAddFilesBody,
  ): Promise<LeadScanAddFilesResponse> {
    await this.mine(who, code)
    await this.admit()
    const slots = await this.repo.run(async (tx) => {
      const batch = await this.repo.lockBatch(tx, code)
      if (!batch || !OPEN.includes(batch.state)) throw closed(code)
      const current = await this.repo.files(code, tx)
      const replaced = body.replaces ? current.find((f) => f.id === body.replaces) : undefined
      if (body.replaces && !replaced) {
        throw invalid({ replaces: ['Tệp cần thay không thuộc lô này.'] })
      }
      if (replaced && replaced.state !== 'FAILED') {
        throw conflict('Chỉ thay được tệp đọc lỗi.', { replaces: ['Tệp này không lỗi.'] })
      }
      const taken = new Map(current.map((f) => [f.sha256, f.id]))
      const added = await this.declare(who, code, body.files, taken)
      /* The replaced row is on its way out, so it does not hold a place. */
      if (current.length - (replaced ? 1 : 0) + added.files.length > SCAN_MAX_FILES) {
        throw invalid({ files: [`Một lô tối đa ${SCAN_MAX_FILES} tệp`] })
      }
      if (added.files.length > 0) await this.repo.insertFiles(tx, added.attachments, added.files)
      return added.slots
    })
    return LeadScanAddFilesResponse.parse({ code, files: slots })
  }

  /** `POST /sales/leads/scan/:code/start` — a known read is copied, not paid
   *  twice. Only the FIRST call (UPLOADING) drops never-started files it does
   *  not list; later calls touch only what they name, so two replaces in
   *  flight never undo each other. A repeat answers 409, as it always has. */
  async start(who: Actor, code: string, body: LeadScanStartBody): Promise<{ code: string }> {
    await this.mine(who, code)
    const { dropped, toRead } = await this.repo.run(async (tx) => {
      const batch = await this.repo.lockBatch(tx, code)
      if (!batch || !OPEN.includes(batch.state)) throw closed(code)
      const files = await this.repo.files(code, tx)
      const ours = (id: string) => files.some((f) => f.id === id)
      if (!body.files.every(ours)) throw invalid({ files: ['Có tệp không thuộc lô này.'] })
      const retire = files.filter((f) => body.retire?.includes(f.id))
      if (retire.length < new Set(body.retire).size) {
        throw invalid({ retire: ['Có tệp cần bỏ không thuộc lô này.'] })
      }
      if (retire.some((f) => f.state !== 'FAILED')) {
        throw conflict('Chỉ bỏ được tệp đọc lỗi.', { retire: ['Tệp này không lỗi.'] })
      }
      const keep = new Set(body.files)
      const pending = files.filter((f) => f.state === 'QUEUED' && f.readAt === null)
      const listed = pending.filter((f) => keep.has(f.id))
      if (listed.length < keep.size) throw conflict(`Lô ${code} đã bắt đầu đọc rồi.`)
      const unlisted = batch.state === 'UPLOADING' ? pending.filter((f) => !keep.has(f.id)) : []
      const dropped = await this.repo.dropFiles(
        tx,
        [...unlisted, ...retire].map((f) => f.id),
      )
      const cached = await this.repo.cachedReads(
        tx,
        listed.map((f) => f.sha256),
        who.id,
      )
      const hit = new Map(cached.map((c) => [c.sha256, c]))
      const toRead = listed.filter((f) => !hit.has(f.sha256)).map((f) => f.id)
      if (toRead.length > 0) await this.spendable(tx)
      for (const f of listed) {
        const c = hit.get(f.sha256)
        if (!c) continue
        await this.repo.finishFile(tx, f.id, {
          state: c.state,
          kind: c.kind,
          extraction: c.extraction,
          note: c.note,
          tokensIn: 0,
          tokensOut: 0,
        })
      }
      await this.repo.markQueued(tx, toRead)
      await this.repo.moveBatch(tx, code, OPEN, 'READING')
      await this.repo.readyIfDone(tx, code)
      return { dropped, toRead }
    })

    if (toRead.length > 0) await this.queue.enqueueRead(toRead)
    await this.removeObjects(dropped)
    return { code }
  }

  /** `POST /sales/leads/scan/:code/cancel` — files stay for the 30-day sweep;
   *  queued reads find the batch FAILED and skip (`claimFile`). */
  async cancel(who: Actor, code: string): Promise<{ code: string }> {
    await this.mine(who, code)
    await this.repo.run(async (tx) => {
      if (!(await this.repo.failBatch(tx, code, OPEN, CANCELLED))) throw closed(code)
      await this.writeRepo.writeBatchNote(tx, {
        actorId: who.id,
        note: JSON.stringify({ kind: 'lead-scan-cancel', batch: code }),
      })
    })
    return { code }
  }

  /** `GET /sales/leads/scan/:code`. */
  async status(who: Actor, code: string): Promise<LeadScanResponse> {
    const batch = await this.mine(who, code)
    const files = await this.repo.files(code)
    const count = (states: readonly string[]) =>
      files.filter((f) => states.includes(f.state)).length
    const previewed = (PREVIEWED as readonly string[]).includes(batch.state)
    return LeadScanResponse.parse({
      code,
      state: batch.state,
      error: batch.state === 'FAILED' ? batch.error : null,
      campaignCode: batch.campaignCode,
      /* Signing is local and cheap; the preview needs a link per source file. */
      files: previewed
        ? await Promise.all(
            files.map(async (f) => ({
              ...toScanFile(f),
              url: await this.storage.presignGet(f.storageKey),
            })),
          )
        : files.map(toScanFile),
      counts: {
        read: count(['READ', 'EMPTY']),
        reading: count(['READING']),
        queued: count(['QUEUED']),
        failed: count(['FAILED']),
      },
      ...(previewed ? { preview: toPreview(await this.planOf(who, files), files) } : {}),
      ...(batch.state === 'DONE' && batch.result ? { result: batch.result } : {}),
    })
  }

  /** `POST /sales/leads/scan/:code/commit` — only from READY; the worker writes. */
  async commit(who: Actor, code: string): Promise<{ code: string }> {
    await this.mine(who, code)
    await this.repo.run(async (tx) => {
      const batch = await this.repo.lockBatch(tx, code)
      if (batch?.state !== 'READY') {
        throw conflict(`Lô ${code} chưa sẵn sàng để tạo lead, hoặc đã tạo rồi.`)
      }
      /* A file added after READY is not in the preview the person approved. */
      if ((await this.repo.files(code, tx)).some((f) => f.state === 'QUEUED')) {
        throw conflict(`Lô ${code} còn tệp chưa đọc — đọc xong mọi tệp rồi mới tạo lead.`)
      }
      await this.repo.moveBatch(tx, code, ['READY'], 'COMMITTING')
    })
    await this.queue.enqueueCommit(code)
    return { code }
  }

  /** `GET /sales/leads/:code/attachments` — the lead's own fence, then the rows. */
  async attachments(who: Actor, code: ObjectCode): Promise<LeadAttachmentsResponse> {
    await this.profiles.guard(who, code)
    const rows = await this.repo.attachmentsOf(code)
    const out = []
    for (const a of rows) {
      const url = await this.storage.presignGet(a.row.storageKey)
      const thumbUrl = a.row.thumbKey ? await this.storage.presignGet(a.row.thumbKey) : null
      out.push(toAttachment(a, url, thumbUrl))
    }
    return LeadAttachmentsResponse.parse({ rows: out })
  }

  /** The plan over the files as they stand, matched against the book as the
   *  uploader sees it. Recomputed every time: the book moves between polls. */
  async planOf(
    who: Pick<Actor, 'id' | 'ownOnly'>,
    files: readonly ScanFileJoined[],
    db?: Db,
  ): Promise<ScanPlan> {
    const read = toReadFiles(files)
    const emails = read.flatMap((f) => [
      ...f.people.map((p) => p.email),
      ...f.companies.flatMap((c) => c.emails),
    ])
    const taxes = read.flatMap((f) => f.companies.map((c) => c.taxCode))
    const book = await this.leads.scanBook(
      who,
      unique(emails.map((e) => e && normaliseEmail(e))),
      unique(taxes.map((t) => t && taxRoot(t))),
      db,
    )
    return planLeadScan(read, book)
  }

  /** Job: read one file. A re-delivered job on a finished file is a no-op.
   *  A transient failure throws with the file still READING, for pg-boss to
   *  retry; a final error, or any error on the last delivery, is written
   *  FAILED and returns. Thrown text lands in `pgboss.job.output`, so it names
   *  the error class, never the content. */
  async readFile(fileId: string, attempt: ScanAttempt): Promise<void> {
    const claimed = await this.repo.claimFile(fileId)
    const file = claimed && (await this.repo.file(fileId))
    if (!claimed || !file) return
    let values: Parameters<LeadScanRepository['finishFile']>[2]
    try {
      const bytes = await this.storage.read(file.storageKey)
      const { extraction, tokensIn, tokensOut } = await this.reader.read({ bytes, mime: file.mime })
      values = {
        state: isEmpty(extraction) ? 'EMPTY' : 'READ',
        kind: extraction.kind,
        extraction,
        note: noteOf(extraction),
        error: null,
        tokensIn,
        tokensOut,
      }
    } catch (error) {
      const kind = error instanceof Error ? error.name : 'unknown'
      this.log.warn(`scan file ${fileId}: read failed (${kind}) — ${String(error)}`)
      if (!attempt.final && !isFinal(error)) {
        throw new Error(`scan file ${fileId}: transient read failure (${kind})`)
      }
      /* An unusable answer was still billed; the budget must see it. */
      const spent = error instanceof ScanOutputError ? error : null
      values = {
        state: 'FAILED',
        error: FILE_FAILED,
        tokensIn: spent?.tokensIn ?? null,
        tokensOut: spent?.tokensOut ?? null,
      }
    }
    await this.repo.run(async (tx) => {
      await this.repo.finishFile(tx, fileId, values)
      await this.repo.readyIfDone(tx, claimed.batchCode)
    })
  }

  /** Server setting, then the company's AI spend. The per-uploader quota is
   *  counted inside `create`'s insert transaction instead. */
  private async admit(): Promise<void> {
    /* 409 like `PV_MAS_ENABLED`: the answer is a server setting, not a grant. */
    if (!this.reader.enabled) {
      throw conflict('Nạp lead từ ảnh chưa được cấu hình trên máy chủ này — báo quản trị viên.')
    }
    await this.spendable(this.repo.pool)
  }

  /** Refuses new model work once the rolling 24 h budget is spent; reads
   *  already queued still run, so a batch is never cut mid-read. */
  private async spendable(db: Db): Promise<void> {
    const budget = this.env.SCAN_DAILY_TOKEN_BUDGET
    if (budget > 0 && (await this.repo.tokensLastDay(db)) >= budget) {
      throw rateLimited('Hệ thống đã dùng hết hạn mức đọc AI trong 24 giờ qua — thử lại sau.')
    }
  }

  /** Rows and upload slots for declared files. `taken` maps sha256 → file id
   *  already in the batch; a repeat gets `duplicateOf` and no row. */
  private async declare(
    who: Actor,
    code: string,
    declared: readonly ScanFileDeclared[],
    taken: Map<string, string>,
  ) {
    const slots: ScanUploadSlot[] = []
    const attachments: Parameters<LeadScanRepository['insertFiles']>[1] = []
    const files: Parameters<LeadScanRepository['insertFiles']>[2] = []
    const t0 = Date.now()
    for (const [i, f] of declared.entries()) {
      const seen = taken.get(f.sha256)
      if (seen) {
        slots.push({ duplicateOf: seen })
        continue
      }
      const id = randomUUID()
      const attachmentId = randomUUID()
      taken.set(f.sha256, id)
      const ext = EXT[f.mime]
      const storageKey = `scan/${code}/${attachmentId}.${ext}`
      /* A PUT binds its exact length, so a thumb without a size gets no slot. */
      const thumbKey = f.hasThumb && f.thumbBytes ? `scan/${code}/${attachmentId}-thumb.jpg` : null
      /* Body order stamped into `created_at`: one INSERT shares one `now()`. */
      const createdAt = new Date(t0 + i)
      attachments.push({
        id: attachmentId,
        storageKey,
        thumbKey,
        name: f.name,
        mime: f.mime,
        bytes: f.bytes,
        sha256: f.sha256,
        width: f.width ?? null,
        height: f.height ?? null,
        pages: f.pages ?? null,
        ownerKind: 'lead' as const,
        createdBy: who.id,
        createdAt,
      })
      files.push({ id, batchCode: code, attachmentId, sha256: f.sha256, createdAt })
      slots.push({
        id,
        putUrl: await this.storage.presignPut(storageKey, f.mime, f.bytes),
        thumbPutUrl:
          thumbKey && f.thumbBytes
            ? await this.storage.presignPut(thumbKey, 'image/jpeg', f.thumbBytes)
            : null,
      })
    }
    return { slots, attachments, files }
  }

  /** 404 for a missing batch and for someone else's alike. */
  private async mine(who: Actor, code: string): Promise<ScanBatchRowDb> {
    const batch = await this.repo.batch(code)
    if (!batch || batch.createdBy !== who.id) throw notFound('lô nạp ảnh', code)
    return batch
  }

  private async removeObjects(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      await this.storage.remove(key).catch((error: unknown) => {
        this.log.warn(`scan: could not remove ${key} — ${String(error)}`)
      })
    }
  }
}

/** No key, an unusable answer (vendor 4xx arrive wrapped as one), or no
 *  bytes to read: another attempt would fail the same way. */
function isFinal(error: unknown): boolean {
  return (
    error instanceof ScanReaderDisabledError ||
    error instanceof ScanOutputError ||
    error instanceof StorageObjectMissingError
  )
}

const unique = (values: readonly (string | null | undefined)[]): string[] => [
  ...new Set(values.filter((v): v is string => !!v)),
]
