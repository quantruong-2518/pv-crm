import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { AiCostReport, AiPrice, AiPriceList, type AiCostLine, type AiPriceSet } from '@pv/contracts'
import { AuditRepository } from '../audit/audit.repository'
import type { AiPriceRowDb } from './ai-cost.schema'
import { AiCostRepository, type AiCostGroupRow, type AiPriceJoined } from './ai-cost.repository'

/** The name a system job's line shows; the contract wants a string, not null. */
const SYSTEM_NAME = 'Hệ thống'

const EMPTY: AiCostLine = {
  calls: 0,
  errorCalls: 0,
  tokensIn: 0,
  tokensOut: 0,
  costUsd: null,
  unpricedCalls: 0,
}

/** `/ai/costs` and `/ai/prices` (ADR 0102). Cost is priced in SQL on read;
 *  this splits the grouping rows into the report and keeps the price write
 *  and its audit line in one transaction, as `SettingService` does. */
@Injectable()
export class AiCostService {
  constructor(
    private readonly repo: AiCostRepository,
    private readonly audit: AuditRepository,
  ) {}

  async report(month: string): Promise<AiCostReport> {
    const rows = await this.repo.report(month)
    const of = (dim: AiCostGroupRow['dim']) => rows.filter((r) => r.dim === dim)
    return AiCostReport.parse({
      month,
      currency: 'USD',
      totals: of('total').map(lineOf)[0] ?? EMPTY,
      byDay: of('day').map((r) => ({ ...lineOf(r), day: r.day })),
      byTask: of('task').map((r) => ({ ...lineOf(r), task: r.task })),
      byModel: of('model').map((r) => ({ ...lineOf(r), model: r.model })),
      byActor: of('actor').map((r) => ({
        ...lineOf(r),
        actorId: r.actorId,
        name: r.actorId === null ? SYSTEM_NAME : r.name,
      })),
    })
  }

  async prices(): Promise<AiPriceList> {
    const [rows, unpricedModels] = await Promise.all([
      this.repo.prices(),
      this.repo.unpricedModels(),
    ])
    return AiPriceList.parse({ rows: rows.map(priceOf), unpricedModels })
  }

  /** Upsert on (model, effectiveFrom); the setter is the caller, never the body. */
  async setPrice(who: Actor, body: AiPriceSet): Promise<AiPrice> {
    const row = await this.repo.run(async (tx) => {
      const before = await this.repo.lock(tx, body)
      await this.repo.upsert(tx, body, who.id)
      await this.audit.write(
        { actorId: who.id, action: 'edit', note: changeNote(body, before) },
        tx,
      )
      const [after] = await this.repo.prices(tx, body)
      return after
    })
    if (!row) throw new Error('platform.ai_price: upsert left no row')
    return AiPrice.parse(priceOf(row))
  }
}

function lineOf(r: AiCostGroupRow): AiCostLine {
  return {
    calls: r.calls,
    errorCalls: r.errorCalls,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    costUsd: r.costUsd,
    unpricedCalls: r.unpricedCalls,
  }
}

function priceOf(r: AiPriceJoined): AiPrice {
  return {
    ...r,
    inputUsdPerMTok: Number(r.inputUsdPerMTok),
    outputUsdPerMTok: Number(r.outputUsdPerMTok),
    setAt: r.setAt.toISOString(),
  }
}

/** Before and after, since a corrected price re-costs every call it reaches. */
function changeNote(body: AiPriceSet, before: AiPriceRowDb | null): string {
  const from = before
    ? `${Number(before.inputUsdPerMTok)}/${Number(before.outputUsdPerMTok)}`
    : '(no row)'
  const to = `${body.inputUsdPerMTok}/${body.outputUsdPerMTok}`
  return `platform.ai_price ${body.model} from ${body.effectiveFrom} · ${from} → ${to} USD per 1M tokens in/out`
}
