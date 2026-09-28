import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common'
import type { PgBoss } from 'pg-boss'
import { ENV, type Env } from '../config/env'
import type { DbHandle } from '../db/create-db'
import { DB_HANDLE } from '../db/db.module'
import { createBoss } from './boss.provider'
import {
  SCAN_COMMIT_QUEUE,
  SCAN_ENQUEUE,
  SCAN_READ_QUEUE,
  type ScanCommitJob,
  type ScanEnqueue,
  type ScanReadJob,
} from './scan-jobs'

/** THE ONE PLACE THE HTTP PROCESS PUTS A JOB ON A QUEUE — and it starts late.
 *
 *  Mail never needed this: a branch writes a ledger row and `MailRelay` in the
 *  worker turns it into a job. A scan is a person watching a progress bar, so
 *  the read has to be queued the instant `start` commits, not a relay tick
 *  later. That is the day `QueueModule.forSender()` was kept for.
 *
 *  Not `forSender()` itself: the Sales module imports this, and the worker
 *  imports Sales, so an eager sender would put a SECOND pg-boss beside the
 *  worker's own. The instance is started on the first enqueue instead — the
 *  worker never enqueues a scan, so there it is never built. */
@Injectable()
export class LazyScanEnqueue implements ScanEnqueue, OnApplicationShutdown {
  private boss: Promise<PgBoss> | null = null

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB_HANDLE) private readonly handle: DbHandle,
  ) {}

  async enqueueRead(fileIds: string[]): Promise<void> {
    const unique = [...new Set(fileIds)]
    if (unique.length === 0) return
    const jobs = unique.map((fileId) => ({
      data: { fileId } satisfies ScanReadJob,
      singletonKey: fileId,
    }))
    await (await this.started()).insert(SCAN_READ_QUEUE, jobs)
  }

  async enqueueCommit(code: string): Promise<void> {
    const job: ScanCommitJob = { code }
    await (await this.started()).send(SCAN_COMMIT_QUEUE, job, { singletonKey: code })
  }

  private started(): Promise<PgBoss> {
    /* A failed start is forgotten, so the next click tries again instead of
       replaying one rejected promise for the life of the process. */
    this.boss ??= createBoss('sender', this.env, this.handle).catch((error: unknown) => {
      this.boss = null
      throw error
    })
    return this.boss
  }

  async onApplicationShutdown(): Promise<void> {
    const boss = await this.boss?.catch(() => null)
    await boss?.stop({ graceful: false, close: true })
  }
}

/** Imported by the branch that enqueues; ENV and DB_HANDLE are global. */
@Module({
  providers: [{ provide: SCAN_ENQUEUE, useClass: LazyScanEnqueue }],
  exports: [SCAN_ENQUEUE],
})
export class ScanQueueModule {}
