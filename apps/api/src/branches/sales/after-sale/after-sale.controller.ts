import { Controller, Get, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { AfterSaleBookQuery } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { AfterSaleService } from './after-sale.service'

/** `/sales/after-sale` — the bought-customer book (ADR 0121 §2). Read-only: a row
 *  leaves by itself when the run leaves `growth`. `contract.view` because the
 *  book is the contracts' afterlife; `scoped` for the ownOnly cut in SQL. */
@Controller('sales/after-sale')
export class AfterSaleController {
  constructor(private readonly book: AfterSaleService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'contract.view', scoped: true })
  list(@CurrentActor() who: Actor, @Query(zod(AfterSaleBookQuery)) q: AfterSaleBookQuery) {
    return this.book.book(who, q)
  }
}
