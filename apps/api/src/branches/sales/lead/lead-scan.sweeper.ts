import { Injectable, Logger } from '@nestjs/common'
import { LEAD_SCAN_FAILED, LEAD_SCAN_READY } from '@pv/engines'
import { StorageService } from '@api/platform/storage/storage.service'
import { LeadIntakeRepository } from './lead-intake.repository'
import { COMMIT_FAILED } from './lead-scan.commit'
import { LeadScanRepository } from './lead-scan.repository'
import { FILE_FAILED, LeadScanService } from './lead-scan.service'

/** Retention and dead-worker cleanup for the scan door, plus the landing
 *  intake's stale rate counters (one pass). Rides the worker's existing tick
 *  (`worker.ts`), no clock of its own (ADR 0082 §2); only the worker calls it.
 *  Every statement is conditional and `remove` treats absent as success, so a
 *  second worker's pass is harmless. Rows are deleted BEFORE their objects: a
 *  failed removal leaves orphan bytes, never a row pointing at nothing. */

/** A browser that has not finished its PUTs in a day never will. */
const UPLOAD_STALE_MS = 24 * 60 * 60_000
/** A read is one model call and a commit a few dozen short transactions;
 *  fifteen minutes is far past both, so the worker holding it has died. */
const WORK_STALE_MS = 15 * 60_000
/** Files no lead took: long enough to come back and commit, short enough
 *  that customer card photos do not sit in the bucket forever. */
const UNLINKED_KEEP_MS = 30 * 24 * 60 * 60_000

/** Every fifteen minutes, not daily: at a daily pace the 15-minute rule
 *  would leave a batch stuck for up to a day. Each pass is a few indexed
 *  statements that usually touch nothing. */
const SWEEP_EVERY_MS = WORK_STALE_MS

const UPLOAD_EXPIRED = 'Lô này chưa tải lên xong trong một ngày nên đã bị huỷ.'
const FILE_UPLOAD_EXPIRED = 'Tệp này chưa tải lên xong trong một ngày.'
const ADDED_UPLOAD_EXPIRED = `Tệp này chưa tải lên xong trong ${WORK_STALE_MS / 60_000} phút.`

@Injectable()
export class LeadScanSweeper {
  private readonly log = new Logger('sales.scan')
  private notBefore = 0
  private running = false

  constructor(
    private readonly repo: LeadScanRepository,
    private readonly storage: StorageService,
    private readonly scans: LeadScanService,
    private readonly intake: LeadIntakeRepository,
  ) {}

  /** Called on every worker tick. `null` = this tick was not a pass. The clock
   *  moves BEFORE the pass so a failing database is asked again one interval later;
   *  a failed pass leaves its rows for the next one. */
  async sweep(now = Date.now()): Promise<number | null> {
    if (this.running || now < this.notBefore) return null
    this.notBefore = now + SWEEP_EVERY_MS
    this.running = true
    try {
      const expired = await this.repo.run(async (tx) => {
        const uploads = await this.repo.expireBatches(
          tx,
          'UPLOADING',
          new Date(now - UPLOAD_STALE_MS),
          UPLOAD_EXPIRED,
        )
        const stale = new Date(now - WORK_STALE_MS)
        const reads = [
          ...(await this.repo.expireReads(tx, stale, FILE_FAILED)),
          /* Handed to the queue and not claimed within a read's span: the job was lost. */
          ...(await this.repo.expireQueued(tx, true, stale, FILE_FAILED)),
          /* Added by `:code/files` to a batch already reading or read: it holds
             that batch from READY or commit, so it gets a read's span, not a day. */
          ...(await this.repo.expireQueued(tx, false, stale, ADDED_UPLOAD_EXPIRED, [
            'READING',
            'READY',
          ])),
          /* Any other never-started file (an UPLOADING batch's): the day its PUTs get. */
          ...(await this.repo.expireQueued(
            tx,
            false,
            new Date(now - UPLOAD_STALE_MS),
            FILE_UPLOAD_EXPIRED,
          )),
        ]
        for (const code of new Set(reads)) {
          const uploader = await this.repo.readyIfDone(tx, code)
          if (uploader) await this.scans.tell(tx, LEAD_SCAN_READY, code, uploader)
        }
        const commits = await this.repo.expireBatches(
          tx,
          'COMMITTING',
          new Date(now - WORK_STALE_MS),
          COMMIT_FAILED,
        )
        for (const b of [...uploads, ...commits]) {
          await this.scans.tell(tx, LEAD_SCAN_FAILED, b.code, b.createdBy)
        }
        const touched = uploads.length + reads.length + commits.length
        if (touched > 0) this.log.log(`scan: expired ${touched} stuck batch(es)`)
        return touched
      })
      /* Its own transaction: a purge that fails must not undo the expiries. */
      const keys = await this.repo.run((tx) =>
        this.repo.purgeUnlinked(tx, new Date(now - UNLINKED_KEEP_MS)),
      )
      for (const key of keys) {
        await this.storage.remove(key).catch((error: unknown) => {
          this.log.warn(`scan: orphan object ${key} — ${String(error)}`)
        })
      }
      if (keys.length > 0) this.log.log(`scan: removed ${keys.length} unlinked object(s)`)
      await this.intake.purgeStale()
      return expired + keys.length
    } finally {
      this.running = false
    }
  }
}
