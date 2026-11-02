import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common'
import type { PgBoss } from 'pg-boss'
import { ENV, type Env } from '../config/env'
import type { DbHandle } from '../db/create-db'
import { DB_HANDLE } from '../db/db.module'
import { createBoss } from './boss.provider'
import {
  COMM_AI_ENQUEUE,
  COMM_AI_QUEUE,
  type CommAiEnqueue,
  type CommAiJobPayload,
} from './comm-ai-jobs'

/** Puts a comm report job on its queue from the HTTP process, started late, for
 *  `LazyAiFillEnqueue`'s reason: the comms module imports this and the worker
 *  imports comms, so an eager sender would build a second pg-boss beside the
 *  worker's own. The worker never enqueues a report, so there this is never built. */
@Injectable()
export class LazyCommAiEnqueue implements CommAiEnqueue, OnApplicationShutdown {
  private boss: Promise<PgBoss> | null = null

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB_HANDLE) private readonly handle: DbHandle,
  ) {}

  async enqueue(jobId: string): Promise<void> {
    const job: CommAiJobPayload = { jobId }
    await (await this.started()).send(COMM_AI_QUEUE, job, { singletonKey: jobId })
  }

  private started(): Promise<PgBoss> {
    /* A failed start is forgotten, so the next press tries again instead of
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

/** Imported by the module that enqueues; ENV and DB_HANDLE are global. */
@Module({
  providers: [{ provide: COMM_AI_ENQUEUE, useClass: LazyCommAiEnqueue }],
  exports: [COMM_AI_ENQUEUE],
})
export class CommAiQueueModule {}
