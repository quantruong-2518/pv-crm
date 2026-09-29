import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { ENV, type Env } from '@api/platform/config/env'
import { StorageService } from '@api/platform/storage/storage.service'
import { COMMIT_FAILED } from './lead-scan.commit'
import { LeadScanRepository } from './lead-scan.repository'
import { FILE_FAILED } from './lead-scan.service'

/** Retention and dead-worker cleanup for the scan door. Self-timed like
 *  `SessionSweeper`, so it also runs in the worker; every statement is
 *  conditional and `remove` treats absent as success, so two passes overlap
 *  harmlessly. Rows are deleted BEFORE their objects: a failed removal
 *  leaves orphan bytes, never a row pointing at nothing. */

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
export class LeadScanSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('sales.scan')
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly repo: LeadScanRepository,
    private readonly storage: StorageService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS)
    this.timer.unref()
    void this.sweep()
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Never rejects. Public so a script can run one pass on demand. */
  async sweep(now = Date.now()): Promise<void> {
    try {
      await this.repo.run(async (tx) => {
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
        for (const code of new Set(reads)) await this.repo.readyIfDone(tx, code)
        const commits = await this.repo.expireBatches(
          tx,
          'COMMITTING',
          new Date(now - WORK_STALE_MS),
          COMMIT_FAILED,
        )
        const touched = uploads.length + reads.length + commits.length
        if (touched > 0) this.log.log(`scan: expired ${touched} stuck batch(es)`)
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
    } catch (error: unknown) {
      this.log.error(`scan sweep failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
