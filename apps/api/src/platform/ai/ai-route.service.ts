import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { AiRoute, AiRouteList, aiTimeoutMaxMs, type AiRouteSet, type AiTask } from '@pv/contracts'
import { AuditRepository } from '../audit/audit.repository'
import { invalid } from '../http/problem'
import { AiRouteRepository } from './ai-route.repository'
import type { AiRouteRowDb } from './ai-route.schema'

/** `/ai/routes` — which model runs each AI task, and its limits. The write and
 *  its audit line share one transaction, as `AiCostService.setPrice` does; the
 *  gateway reads the row per call, so a saved route applies to the next call. */
@Injectable()
export class AiRouteService {
  constructor(
    private readonly repo: AiRouteRepository,
    private readonly audit: AuditRepository,
  ) {}

  async list(): Promise<AiRouteList> {
    return AiRouteList.parse({ routes: (await this.repo.list()).map(routeOf) })
  }

  /** The editor is the caller, never the body. */
  async set(who: Actor, task: AiTask, body: AiRouteSet): Promise<AiRoute> {
    /* The body does not name its task, so the contract can only hold the widest cap. */
    const maxSeconds = aiTimeoutMaxMs(task) / 1000
    if (body.timeoutMs > maxSeconds * 1000) {
      const message = `Thời gian chờ của việc này tối đa ${maxSeconds} giây.`
      throw invalid({ timeoutMs: [message] }, message)
    }
    if (task === 'comm-audio-report') refuseOnRecordingRoute(body)
    const row = await this.repo.run(async (tx) => {
      const before = await this.repo.lock(tx, task)
      const after = await this.repo.upsert(tx, task, body, who.id)
      await this.audit.write(
        { actorId: who.id, action: 'edit', note: changeNote(task, before, after) },
        tx,
      )
      return after
    })
    return AiRoute.parse(routeOf(row))
  }
}

/** A second model would bill the recording again and Claude cannot hear it, and
 *  no vendor can count a recording before it is uploaded (ADR 0135). */
function refuseOnRecordingRoute(body: AiRouteSet): void {
  if (body.fallbackModel !== null) {
    const message = 'Việc nghe ghi âm không dùng mô hình dự phòng.'
    throw invalid({ fallbackModel: [message] }, message)
  }
  if (body.maxTokensIn !== null) {
    const message = 'Việc nghe ghi âm không đặt giới hạn token đầu vào.'
    throw invalid({ maxTokensIn: [message] }, message)
  }
}

function routeOf(r: AiRouteRowDb): AiRoute {
  return { ...r, updatedAt: r.updatedAt.toISOString() }
}

const FIELDS = [
  'primaryModel',
  'fallbackModel',
  'maxTokensIn',
  'maxTokensOut',
  'timeoutMs',
  'dailyCallsPerUser',
  'dailyTokenBudget',
  'enabled',
] as const satisfies readonly (keyof AiRouteSet)[]

/** Changed fields only, before → after: a route edit moves spend and vendors. */
function changeNote(task: AiTask, before: AiRouteRowDb | null, after: AiRouteRowDb): string {
  if (!before) return `platform.ai_route ${task} created`
  const changed = FIELDS.filter((f) => before[f] !== after[f]).map(
    (f) => `${f} ${String(before[f])} → ${String(after[f])}`,
  )
  return `platform.ai_route ${task} · ${changed.join(' · ') || 'no change'}`
}
