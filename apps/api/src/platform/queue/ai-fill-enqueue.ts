import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common'
import type { PgBoss } from 'pg-boss'
import { ENV, type Env } from '../config/env'
import type { DbHandle } from '../db/create-db'
import { DB_HANDLE } from '../db/db.module'
import { AI_FILL_ENQUEUE, AI_FILL_QUEUE, type AiFillEnqueue, type AiFillJob } from './ai-fill-jobs'
import { createBoss } from './boss.provider'

/** Puts an AI-fill job on its queue from the HTTP process, started late.
 *
 *  Lazy for the reason `LazyScanEnqueue` is: the Sales module imports this and
 *  the worker imports Sales, so an eager sender would build a second pg-boss
 *  beside the worker's own. The worker never enqueues a fill, so there this
 *  instance is never built. Its own instance rather than a shared one with the
 *  scan sender: one more `max: 2` pool on the HTTP machine only once a fill
 *  is actually pressed, and no cross-module provider to keep in step. */
@Injectable()
export class LazyAiFillEnqueue implements AiFillEnqueue, OnApplicationShutdown {
  private boss: Promise<PgBoss> | null = null

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB_HANDLE) private readonly handle: DbHandle,
  ) {}

  async enqueue(jobId: string): Promise<void> {
    const job: AiFillJob = { jobId }
    await (await this.started()).send(AI_FILL_QUEUE, job, { singletonKey: jobId })
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
  providers: [{ provide: AI_FILL_ENQUEUE, useClass: LazyAiFillEnqueue }],
  exports: [AI_FILL_ENQUEUE],
})
export class AiFillQueueModule {}
