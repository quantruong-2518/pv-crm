import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common'
import {
  FxRateListQuery,
  FxRatePutBody,
  FxRatePutParams,
  type FxRatePutResponse,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { Need } from '../access/need.decorator'
import { zod } from '../http/zod.pipe'
import { CurrentActor } from '../session/current-actor.decorator'
import { FxRateService } from './fx-rate.service'

/** Rate sheet doors (ADR 0149). No branch: a rate serves every branch. The
 *  admin list and the correction ride `setting.manage`; `today` asks only
 *  for a session because every screen needs it for provisional previews, and a
 *  rate is not a secret. `today` is declared before the `:currency`
 *  route so the router never reads "today" as a currency. */
@Controller('platform/fx-rates')
export class FxRateController {
  constructor(private readonly rates: FxRateService) {}

  @Get()
  @Need({ permission: 'setting.manage' })
  list(@Query(zod(FxRateListQuery)) q: FxRateListQuery) {
    return this.rates.list(q)
  }

  @Get('today')
  @Need({})
  today() {
    return this.rates.today()
  }

  @Put(':currency/:day')
  @Need({ permission: 'setting.manage' })
  put(
    @CurrentActor() who: Actor,
    @Param(zod(FxRatePutParams)) params: FxRatePutParams,
    @Body(zod(FxRatePutBody)) body: FxRatePutBody,
  ): Promise<FxRatePutResponse> {
    return this.rates.put(who, params, body)
  }
}
