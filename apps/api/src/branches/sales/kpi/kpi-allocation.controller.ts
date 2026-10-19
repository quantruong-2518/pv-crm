import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  KpiAcknowledgeBody,
  KpiAllocationDecideBody,
  KpiAllocationDraftBody,
  KpiAllocationSubmitBody,
  KpiCounterBody,
  KpiCounterParams,
  KpiCounterResolveBody,
  KpiPeriodParams,
  KpiRoleParams,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiAllocationCounterService } from './kpi-allocation-counter.service'
import { KpiAllocationService } from './kpi-allocation.service'

/** `/sales/kpi/:period/allocations|counters…` — a role target split per person.
 *
 *  Permissions follow `KpiController` (0082 §5): drafting, sending, deciding
 *  and settling a counter are a manager's `kpi.set-target`; a holder's
 *  confirm and counter ride `kpi.view`, as acknowledging a target does; the
 *  counter queue names everyone, so it is `kpi.view-all`, like `:period/people`.
 *
 *  Holding the line or having sent the package are facts about the caller,
 *  checked in the service. Writes that answer with refreshed state are 200. */
@Controller('sales/kpi')
export class KpiAllocationController {
  constructor(
    private readonly packages: KpiAllocationService,
    private readonly counters: KpiAllocationCounterService,
  ) {}

  /** One door: E2 widens it to every line for `kpi.view-all` (see the service). */
  @Get(':period/allocations')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  read(@CurrentActor() who: Actor, @Param(zod(KpiPeriodParams)) params: KpiPeriodParams) {
    return this.packages.read(who, params.period)
  }

  @Put(':period/allocations/draft')
  @Need({ branch: 'Sales', permission: 'kpi.set-target' })
  draft(
    @CurrentActor() who: Actor,
    @Param(zod(KpiPeriodParams)) params: KpiPeriodParams,
    @Body(zod(KpiAllocationDraftBody)) body: KpiAllocationDraftBody,
  ) {
    return this.packages.draft(who, params.period, body)
  }

  @Post(':period/allocations/submit')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'kpi.set-target' })
  submit(
    @CurrentActor() who: Actor,
    @Param(zod(KpiPeriodParams)) params: KpiPeriodParams,
    @Body(zod(KpiAllocationSubmitBody)) body: KpiAllocationSubmitBody,
  ) {
    return this.packages.submit(who, params.period, body.role, body.ackDays)
  }

  @Post(':period/allocations/:role/decide')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'kpi.set-target' })
  decide(
    @CurrentActor() who: Actor,
    @Param(zod(KpiRoleParams)) params: KpiRoleParams,
    @Body(zod(KpiAllocationDecideBody)) body: KpiAllocationDecideBody,
  ) {
    return this.packages.decide(who, params.period, params.role, body)
  }

  @Post(':period/allocations/:role/acknowledge')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  acknowledge(
    @CurrentActor() who: Actor,
    @Param(zod(KpiRoleParams)) params: KpiRoleParams,
    @Body(zod(KpiAcknowledgeBody)) body: KpiAcknowledgeBody,
  ) {
    return this.counters.acknowledge(who, params.period, params.role, body)
  }

  /** 201: it files a counter. */
  @Post(':period/allocations/:role/counters')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  counter(
    @CurrentActor() who: Actor,
    @Param(zod(KpiRoleParams)) params: KpiRoleParams,
    @Body(zod(KpiCounterBody)) body: KpiCounterBody,
  ) {
    return this.counters.counter(who, params.period, params.role, body)
  }

  @Get(':period/counters')
  @Need({ branch: 'Sales', permission: 'kpi.view-all' })
  list(@Param(zod(KpiPeriodParams)) params: KpiPeriodParams) {
    return this.counters.list(params.period)
  }

  @Post(':period/counters/:counterId/resolve')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'kpi.set-target' })
  resolve(
    @CurrentActor() who: Actor,
    @Param(zod(KpiCounterParams)) params: KpiCounterParams,
    @Body(zod(KpiCounterResolveBody)) body: KpiCounterResolveBody,
  ) {
    return this.counters.resolve(who, params.period, params.counterId, body)
  }
}
