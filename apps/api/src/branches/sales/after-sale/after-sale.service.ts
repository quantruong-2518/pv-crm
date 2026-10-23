import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import { AfterSaleBookResponse, type AfterSaleBookQuery } from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { SettingService } from '@api/platform/setting/setting.service'
import { recareCyclesOf } from '../config/recare-cycles'
import { toContract as toNextStep } from '../next-step/next-step.mapper'
import { AfterSaleRepository, type AfterSaleRead } from './after-sale.repository'

const iso = (at: Date | string): string => new Date(at).toISOString()

/** The bought-customer book (ADR 0121 §2). The scope axis is cut in SQL
 *  (`scopeOf`); `hidden` is what it cut. The cycles are read per request:
 *  an approved retune moves every row's care day at once. */
@Injectable()
export class AfterSaleService {
  constructor(
    private readonly repo: AfterSaleRepository,
    private readonly settings: SettingService,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async book(who: Actor, q: AfterSaleBookQuery): Promise<AfterSaleBookResponse> {
    const page = await this.repo.book(who, q, await recareCyclesOf(this.settings))
    /* Mirrors the deal door's `opens()`: the grant, then the lead reach — a
       reader not limited to their own work reaches every lead. */
    const creates = this.access.allows(who, 'opportunity.create')
    return AfterSaleBookResponse.parse({
      rows: page.rows.map((r) => ({
        ...toRow(r),
        canOpenDeal: creates && (!who.ownOnly || r.standsOn),
      })),
      total: page.total,
      hidden: page.hidden,
    })
  }
}

function toRow(r: AfterSaleRead) {
  return {
    code: r.code,
    leadCode: r.leadCode,
    customer: r.customer,
    temperature:
      r.temperature && r.temperatureAt && r.temperatureBy
        ? { value: r.temperature, at: iso(r.temperatureAt), by: r.temperatureBy }
        : null,
    nextStep: r.step ? toNextStep(r.step, r.today) : null,
    carers: r.carers,
    lastContactAt: r.lastContactAt ? iso(r.lastContactAt) : null,
    nextCareOn: r.nextCareOn,
    careDue: r.careDue,
    collected: Number(r.collectedVnd),
    completedAt: iso(r.completedAt),
  }
}
