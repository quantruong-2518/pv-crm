import { and, asc, count, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type {
  RoleId,
  ScanBatchState,
  ScanExtraction,
  ScanFileKind,
  ScanResult,
  ScanUploadMime,
} from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { attachment } from '@api/platform/storage/attachment.schema'
import { scanBatch, scanFile, type ScanBatchRowDb } from './lead-scan.schema'

/** SQL of the scan door. Decides nothing.
 *
 *  Every write takes the caller's handle for `LeadWriteRepository`'s reason;
 *  reads default to the pool but accept a handle, because on PGlite a pool
 *  read inside an open transaction waits on itself forever. */

const NEXT_CODE = sql`SELECT 'SCN-' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMM')
  || '-' || lpad(nextval('sales.scan_batch_code_seq')::text, 2, '0') AS code`

const TERMINAL = ['READ', 'EMPTY', 'FAILED'] as const
/** The quota window, on the database clock so every API machine agrees. */
const LAST_DAY = sql`now() - interval '24 hours'`

/** One file of a batch with the attachment columns every caller needs. */
export type ScanFileJoined = {
  id: string
  batchCode: string
  sha256: string
  state: (typeof scanFile.$inferSelect)['state']
  kind: ScanFileKind | null
  extraction: ScanExtraction | null
  note: string | null
  error: string | null
  readAt: Date | null
  attachmentId: string
  name: string
  mime: ScanUploadMime
  bytes: number
  storageKey: string
  thumbKey: string | null
  ownerCode: string | null
}

export type ScanCached = Pick<ScanFileJoined, 'kind' | 'extraction' | 'note'> & {
  sha256: string
  state: 'READ' | 'EMPTY'
}

export type ScanCreator = {
  id: string
  name: string
  roleId: RoleId
  ownOnly: boolean
  disabledAt: Date | null
}

const JOINED = {
  id: scanFile.id,
  batchCode: scanFile.batchCode,
  sha256: scanFile.sha256,
  state: scanFile.state,
  kind: scanFile.kind,
  extraction: scanFile.extraction,
  note: scanFile.note,
  error: scanFile.error,
  readAt: scanFile.readAt,
  attachmentId: attachment.id,
  name: attachment.name,
  /* Joined through `scan_file`, so always a lead file: the lead mime list. */
  mime: sql<ScanUploadMime>`${attachment.mime}`,
  bytes: attachment.bytes,
  storageKey: attachment.storageKey,
  thumbKey: attachment.thumbKey,
  ownerCode: attachment.ownerCode,
}

@Injectable()
export class LeadScanRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  get pool(): Db {
    return this.db
  }

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  async nextCode(): Promise<string> {
    const r = (await this.db.execute(NEXT_CODE)) as { rows: { code: string }[] }
    const code = r.rows[0]?.code
    if (!code) throw new Error('sales.scan_batch_code_seq returned nothing — migration 0063 run?')
    return code
  }

  async insertBatch(tx: Db, row: typeof scanBatch.$inferInsert): Promise<void> {
    await tx.insert(scanBatch).values(row)
  }

  async insertFiles(
    tx: Db,
    attachments: (typeof attachment.$inferInsert)[],
    files: (typeof scanFile.$inferInsert)[],
  ): Promise<void> {
    await tx.insert(attachment).values(attachments)
    await tx.insert(scanFile).values(files)
  }

  async batch(code: string, db: Db = this.db): Promise<ScanBatchRowDb | null> {
    const [row] = await db.select().from(scanBatch).where(eq(scanBatch.code, code)).limit(1)
    return row ?? null
  }

  /** The batch row, locked to the transaction's end: every change to a
   *  batch's file set (add, replace, start) serialises on it. */
  async lockBatch(tx: Db, code: string): Promise<ScanBatchRowDb | null> {
    const [row] = await tx.select().from(scanBatch).where(eq(scanBatch.code, code)).for('update')
    return row ?? null
  }

  /** Held to the transaction's end; serialises one uploader's creates. */
  async lockUploader(tx: Db, createdBy: string): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${createdBy}))`)
  }

  /** Batches this uploader opened in the last 24 hours. */
  async batchesLastDay(createdBy: string, db: Db = this.db): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(scanBatch)
      .where(and(eq(scanBatch.createdBy, createdBy), gt(scanBatch.createdAt, LAST_DAY)))
    return row?.n ?? 0
  }

  /** Model tokens every read of the last 24 hours cost, all uploaders. */
  async tokensLastDay(db: Db = this.db): Promise<number> {
    const [row] = await db
      .select({
        n: sql<number>`coalesce(sum(coalesce(${scanFile.tokensIn}, 0) + coalesce(${scanFile.tokensOut}, 0)), 0)`.mapWith(
          Number,
        ),
      })
      .from(scanFile)
      .where(gt(scanFile.readAt, LAST_DAY))
    return row?.n ?? 0
  }

  /** `created_at` then id: the door stamps body order into `created_at`. */
  async files(code: string, db: Db = this.db): Promise<ScanFileJoined[]> {
    return db
      .select(JOINED)
      .from(scanFile)
      .innerJoin(attachment, eq(attachment.id, scanFile.attachmentId))
      .where(eq(scanFile.batchCode, code))
      .orderBy(asc(scanFile.createdAt), asc(scanFile.id))
  }

  async file(id: string): Promise<ScanFileJoined | null> {
    const [row] = await this.db
      .select(JOINED)
      .from(scanFile)
      .innerJoin(attachment, eq(attachment.id, scanFile.attachmentId))
      .where(eq(scanFile.id, id))
      .limit(1)
    return row ?? null
  }

  /** Drops these files and their attachments; answers the object keys to delete. */
  async dropFiles(tx: Db, ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return []
    const gone = await tx
      .delete(scanFile)
      .where(inArray(scanFile.id, [...ids]))
      .returning({ attachmentId: scanFile.attachmentId })
    if (gone.length === 0) return []
    /* A file a lead already took keeps its bytes, whatever the caller thought. */
    const rows = await tx
      .delete(attachment)
      .where(
        and(
          isNull(attachment.ownerCode),
          inArray(
            attachment.id,
            gone.map((g) => g.attachmentId),
          ),
        ),
      )
      .returning({ key: attachment.storageKey, thumb: attachment.thumbKey })
    return rows.flatMap((r) => (r.thumb ? [r.key, r.thumb] : [r.key]))
  }

  /** The latest finished read of each of these bytes, from this uploader's
   *  own batches only: `sha256` is browser-declared and never verified, so
   *  a shared cache would let one user plant a read another user reuses. */
  async cachedReads(tx: Db, sha256s: readonly string[], createdBy: string): Promise<ScanCached[]> {
    if (sha256s.length === 0) return []
    return tx
      .selectDistinctOn([scanFile.sha256], {
        sha256: scanFile.sha256,
        state: sql<'READ' | 'EMPTY'>`${scanFile.state}`,
        kind: scanFile.kind,
        extraction: scanFile.extraction,
        note: scanFile.note,
      })
      .from(scanFile)
      .innerJoin(scanBatch, eq(scanBatch.code, scanFile.batchCode))
      .where(
        and(
          inArray(scanFile.sha256, [...sha256s]),
          inArray(scanFile.state, ['READ', 'EMPTY']),
          eq(scanBatch.createdBy, createdBy),
        ),
      )
      .orderBy(scanFile.sha256, sql`${scanFile.readAt} DESC NULLS LAST`)
  }

  async finishFile(
    db: Db,
    id: string,
    values: Partial<
      Pick<
        typeof scanFile.$inferInsert,
        'state' | 'kind' | 'extraction' | 'note' | 'error' | 'tokensIn' | 'tokensOut'
      >
    >,
  ): Promise<void> {
    await db
      .update(scanFile)
      .set({ ...values, readAt: sql`now()` })
      .where(eq(scanFile.id, id))
  }

  /** `read_at` on a QUEUED file means "handed to the queue": a later `start`
   *  must neither drop it nor enqueue it twice. */
  async markQueued(tx: Db, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return
    await tx
      .update(scanFile)
      .set({ readAt: sql`now()` })
      .where(inArray(scanFile.id, [...ids]))
  }

  /** QUEUED → READING. READING is claimable too: a job re-delivered after a
   *  crash mid-read must retry, not wait forever. Null = already terminal, or
   *  the batch was cancelled — a queued read after that costs nothing. */
  async claimFile(id: string): Promise<{ batchCode: string } | null> {
    const [row] = await this.db
      .update(scanFile)
      /* `read_at` doubles as "claimed at" until the read lands: the sweeper
         needs a clock for a READING file whose worker died. */
      .set({ state: 'READING', readAt: sql`now()` })
      .where(
        and(
          eq(scanFile.id, id),
          inArray(scanFile.state, ['QUEUED', 'READING']),
          sql`NOT EXISTS (SELECT 1 FROM ${scanBatch} WHERE ${scanBatch.code} = ${scanFile.batchCode}
                AND ${scanBatch.state} = 'FAILED')`,
        ),
      )
      .returning({ batchCode: scanFile.batchCode })
    return row ?? null
  }

  /** A guarded move: false when the batch was not in `from`. */
  async moveBatch(
    db: Db,
    code: string,
    from: readonly ScanBatchState[],
    to: ScanBatchState,
  ): Promise<boolean> {
    const rows = await db
      .update(scanBatch)
      /* `committed_at` marks the press until DONE restamps it — the sweeper's
         clock for a commit whose worker died. */
      .set(to === 'COMMITTING' ? { state: to, committedAt: sql`now()` } : { state: to })
      .where(and(eq(scanBatch.code, code), inArray(scanBatch.state, [...from])))
      .returning({ code: scanBatch.code })
    return rows.length > 0
  }

  /** `from` → FAILED; `result` is left as the committed groups saved it.
   *  False when the batch was not in `from`. */
  async failBatch(
    db: Db,
    code: string,
    from: readonly ScanBatchState[],
    error: string,
  ): Promise<boolean> {
    const rows = await db
      .update(scanBatch)
      .set({ state: 'FAILED', error })
      .where(and(eq(scanBatch.code, code), inArray(scanBatch.state, [...from])))
      .returning({ code: scanBatch.code })
    return rows.length > 0
  }

  /** READING → READY once no file of the batch is still open. */
  async readyIfDone(db: Db, code: string): Promise<void> {
    await db
      .update(scanBatch)
      .set({ state: 'READY' })
      .where(
        and(
          eq(scanBatch.code, code),
          eq(scanBatch.state, 'READING'),
          sql`NOT EXISTS (SELECT 1 FROM ${scanFile} WHERE ${scanFile.batchCode} = ${code}
                AND ${scanFile.state} NOT IN (${sql.join(
                  TERMINAL.map((s) => sql`${s}`),
                  sql`, `,
                )}))`,
        ),
      )
  }

  /** First writer wins: a card-sheet file feeds several groups, and
   *  `owner_code` has room for one lead. */
  async linkAttachments(tx: Db, fileIds: readonly string[], leadCode: string): Promise<void> {
    if (fileIds.length === 0) return
    await tx
      .update(attachment)
      .set({ ownerCode: leadCode })
      .where(
        and(
          isNull(attachment.ownerCode),
          inArray(
            attachment.id,
            tx
              .select({ id: scanFile.attachmentId })
              .from(scanFile)
              .where(inArray(scanFile.id, [...fileIds])),
          ),
        ),
      )
  }

  /** Only while COMMITTING: false = the sweeper failed the batch meanwhile. */
  async saveResult(tx: Db, code: string, result: ScanResult, done: boolean): Promise<boolean> {
    const rows = await tx
      .update(scanBatch)
      .set(done ? { result, state: 'DONE', committedAt: sql`now()` } : { result })
      .where(and(eq(scanBatch.code, code), eq(scanBatch.state, 'COMMITTING')))
      .returning({ code: scanBatch.code })
    return rows.length > 0
  }

  // ── sweeper ──────────────────────────────────────────────────────────────

  /** UPLOADING batches by `created_at`, COMMITTING ones by `committed_at`. */
  async expireBatches(
    tx: Db,
    state: 'UPLOADING' | 'COMMITTING',
    before: Date,
    error: string,
  ): Promise<string[]> {
    const at = state === 'UPLOADING' ? scanBatch.createdAt : scanBatch.committedAt
    const rows = await tx
      .update(scanBatch)
      .set({ state: 'FAILED', error })
      .where(and(eq(scanBatch.state, state), lt(at, before)))
      .returning({ code: scanBatch.code })
    return rows.map((r) => r.code)
  }

  /** READING files claimed before `before`; answers their batch codes. */
  async expireReads(tx: Db, before: Date, error: string): Promise<string[]> {
    const rows = await tx
      .update(scanFile)
      .set({ state: 'FAILED', error })
      .where(and(eq(scanFile.state, 'READING'), lt(scanFile.readAt, before)))
      .returning({ batchCode: scanFile.batchCode })
    return [...new Set(rows.map((r) => r.batchCode))]
  }

  /** QUEUED files past `before`: never started ones by `created_at` (the
   *  PUT never landed), queued ones by `read_at` (the job was lost).
   *  `inBatch` narrows to files of batches in those states. */
  async expireQueued(
    tx: Db,
    started: boolean,
    before: Date,
    error: string,
    inBatch?: readonly ScanBatchState[],
  ): Promise<string[]> {
    const rows = await tx
      .update(scanFile)
      .set({ state: 'FAILED', error })
      .where(
        and(
          eq(scanFile.state, 'QUEUED'),
          started
            ? lt(scanFile.readAt, before)
            : and(isNull(scanFile.readAt), lt(scanFile.createdAt, before)),
          inBatch
            ? inArray(
                scanFile.batchCode,
                tx
                  .select({ code: scanBatch.code })
                  .from(scanBatch)
                  .where(inArray(scanBatch.state, [...inBatch])),
              )
            : undefined,
        ),
      )
      .returning({ batchCode: scanFile.batchCode })
    return [...new Set(rows.map((r) => r.batchCode))]
  }

  /** Deletes unlinked attachments older than `before`, their scan_file rows
   *  and any batch left empty; answers the object keys to remove. Locked
   *  first, so a commit linking one of them waits or wins — never both. A
   *  COMMITTING batch's files are left to that commit. */
  async purgeUnlinked(tx: Db, before: Date): Promise<string[]> {
    const stale = await tx
      .select({ id: attachment.id })
      .from(attachment)
      .where(
        and(
          isNull(attachment.ownerCode),
          lt(attachment.createdAt, before),
          sql`NOT EXISTS (SELECT 1 FROM ${scanFile} JOIN ${scanBatch}
                ON ${scanBatch.code} = ${scanFile.batchCode}
                WHERE ${scanFile.attachmentId} = ${attachment.id}
                  AND ${scanBatch.state} = 'COMMITTING')`,
        ),
      )
      .for('update')
    if (stale.length === 0) return []
    const ids = stale.map((r) => r.id)
    const files = await tx
      .delete(scanFile)
      .where(inArray(scanFile.attachmentId, ids))
      .returning({ batchCode: scanFile.batchCode })
    const gone = await tx
      .delete(attachment)
      .where(inArray(attachment.id, ids))
      .returning({ key: attachment.storageKey, thumb: attachment.thumbKey })
    const batches = [...new Set(files.map((f) => f.batchCode))]
    if (batches.length > 0) {
      await tx
        .delete(scanBatch)
        .where(
          and(
            inArray(scanBatch.code, batches),
            sql`NOT EXISTS (SELECT 1 FROM ${scanFile} WHERE ${scanFile.batchCode} = ${scanBatch.code})`,
          ),
        )
    }
    return gone.flatMap((r) => (r.thumb ? [r.key, r.thumb] : [r.key]))
  }

  async creator(id: string): Promise<ScanCreator | null> {
    const [row] = await this.db
      .select({
        id: actor.id,
        name: actor.name,
        roleId: actor.roleId,
        ownOnly: actor.ownOnly,
        disabledAt: actor.disabledAt,
      })
      .from(actor)
      .where(eq(actor.id, id))
      .limit(1)
    return row ?? null
  }

  /** Files hanging on one lead, oldest first, with the batch they came in. */
  async attachmentsOf(leadCode: string) {
    return this.db
      .select({
        row: attachment,
        createdByName: actor.name,
        batchCode: scanFile.batchCode,
      })
      .from(attachment)
      .innerJoin(actor, eq(actor.id, attachment.createdBy))
      .leftJoin(scanFile, eq(scanFile.attachmentId, attachment.id))
      .where(and(eq(attachment.ownerKind, 'lead'), eq(attachment.ownerCode, leadCode)))
      .orderBy(asc(attachment.createdAt), asc(attachment.id))
  }
}
