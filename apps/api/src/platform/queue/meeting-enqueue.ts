import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common'
import type { PgBoss } from 'pg-boss'
import { ENV, type Env } from '../config/env'
import type { DbHandle } from '../db/create-db'
import { DB_HANDLE } from '../db/db.module'
import { createBoss } from './boss.provider'
import {
  MEETING_END_ENQUEUE,
  MEETING_END_QUEUE,
  type MeetingEndEnqueue,
  type MeetingEndJob,
} from './meeting-jobs'

/** The HTTP process's way to schedule a meeting's end — started lazily, for
 *  the same reason as `LazyScanEnqueue`: the worker imports Sales, so an eager
 *  sender would build a second pg-boss beside the worker's own. */
@Injectable()
export class LazyMeetingEndEnqueue implements MeetingEndEnqueue, OnApplicationShutdown {
  private boss: Promise<PgBoss> | null = null

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB_HANDLE) private readonly handle: DbHandle,
  ) {}

  async schedule(job: MeetingEndJob): Promise<void> {
    const boss = await this.started()
    await boss.send(MEETING_END_QUEUE, job, {
      startAfter: new Date(job.endsAt),
      singletonKey: `${job.meetingId}:${job.endsAt}`,
    })
  }

  private started(): Promise<PgBoss> {
    /* A failed start is forgotten so the next call retries it. */
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

/** Imported by the branch that schedules; ENV and DB_HANDLE are global. */
@Module({
  providers: [{ provide: MEETING_END_ENQUEUE, useClass: LazyMeetingEndEnqueue }],
  exports: [MEETING_END_ENQUEUE],
})
export class MeetingEndQueueModule {}
