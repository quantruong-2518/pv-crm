import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  ContractInstallmentParams,
  OverdueReasonBody,
  OverdueReasonDecideBody,
  OverdueReasonParams,
  OverdueReasonWaitingQuery,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { ContractOverdueReasonService } from './contract-overdue-reason.service'

/** Overdue-installment reasons (ADR 0100, `contracts/sales/contract-overdue-reason.ts`).
 *  Thin: take, validate, call, return. The reading door and the writing door
 *  ask the view floor and the service holds the owner-only rule; deciding and
 *  the month-close list ask the approval permission. */
@Controller('sales')
export class ContractOverdueReasonController {
  constructor(private readonly reasons: ContractOverdueReasonService) {}

  @Get('contracts/:code/installments/:no/overdue-reasons')
  @Need({ branch: 'Sales', permission: 'contract.view', scoped: true })
  list(
    @CurrentActor() who: Actor,
    @Param(zod(ContractInstallmentParams)) p: ContractInstallmentParams,
  ) {
    return this.reasons.list(who, p.code, p.no)
  }

  @Post('contracts/:code/installments/:no/overdue-reasons')
  @Need({ branch: 'Sales', permission: 'contract.view', scoped: true })
  write(
    @CurrentActor() who: Actor,
    @Param(zod(ContractInstallmentParams)) p: ContractInstallmentParams,
    @Body(zod(OverdueReasonBody)) body: OverdueReasonBody,
  ) {
    return this.reasons.write(who, p.code, p.no, body)
  }

  @Post('overdue-reasons/:id/decide')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'contract.approve-overdue-reason' })
  decide(
    @CurrentActor() who: Actor,
    @Param(zod(OverdueReasonParams)) p: OverdueReasonParams,
    @Body(zod(OverdueReasonDecideBody)) body: OverdueReasonDecideBody,
  ) {
    return this.reasons.decide(who, p.id, body)
  }

  @Get('overdue-reasons')
  @Need({ branch: 'Sales', permission: 'contract.approve-overdue-reason' })
  waiting(@Query(zod(OverdueReasonWaitingQuery)) q: OverdueReasonWaitingQuery) {
    return this.reasons.waiting(q)
  }
}
