import { Controller, Get, Param, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  SalesExitsParams,
  SalesMoneyEntriesQuery,
  SalesMoneyParams,
  SalesPerformanceParams,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { PerformanceMoneyService } from './performance-money.service'
import { PerformanceService } from './performance.service'

/** `/sales/performance/:period` — the overview's period figures in one read.
 *
 *  Its own root for the leaderboard's reason: the figures join all three books,
 *  so hanging the route off one would make the other two reach across for it.
 *  It asks for the performance permission, not the three books' own, which
 *  would shut out whoever reads how the desk is doing without holding a book.
 *
 *  NOT `scoped`: whole-book figures like the three scorecards they sit beside,
 *  none of which applies an `ownOnly` cut. */
@Controller('sales/performance')
export class PerformanceController {
  constructor(
    private readonly performance: PerformanceService,
    private readonly money: PerformanceMoneyService,
  ) {}

  @Get(':period')
  @Need({ branch: 'Sales', permission: 'performance.view' })
  read(@Param(zod(SalesPerformanceParams)) params: SalesPerformanceParams) {
    return this.performance.read(params.period)
  }

  /** A second door, not a field of the first: the chart loads after the tiles
   *  and its two grouped counts have no part in the tiles' single statement. */
  @Get(':period/exits')
  @Need({ branch: 'Sales', permission: 'performance.view' })
  exits(@Param(zod(SalesExitsParams)) params: SalesExitsParams) {
    return this.performance.exits(params.period)
  }

  /** Money asks the contract permission, not `performance.view`: amounts are
   *  the contract book's. Not `scoped` either — an `ownOnly` reader is refused
   *  whole (`PerformanceMoneyService`), never served a slice. */
  @Get(':period/money')
  @Need({ branch: 'Sales', permission: 'contract.view' })
  moneyRead(@CurrentActor() who: Actor, @Param(zod(SalesMoneyParams)) params: SalesMoneyParams) {
    return this.money.read(who, params.period)
  }

  @Get(':period/money/entries')
  @Need({ branch: 'Sales', permission: 'contract.view' })
  moneyEntries(
    @CurrentActor() who: Actor,
    @Param(zod(SalesMoneyParams)) params: SalesMoneyParams,
    @Query(zod(SalesMoneyEntriesQuery)) q: SalesMoneyEntriesQuery,
  ) {
    return this.money.entries(who, params.period, q)
  }
}
