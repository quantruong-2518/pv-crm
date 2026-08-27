import { Body, Controller, Header, HttpCode, Post, Query, UseGuards } from '@nestjs/common'
import { RouteConfig } from '@nestjs/platform-fastify'
import {
  LeadIntakeBody,
  LeadIntakeQuery,
  type LeadIntakeBody as LeadIntakeBodyValue,
  type LeadIntakeQuery as LeadIntakeQueryValue,
} from '@pv/contracts'
import { Public } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentIntakeClient, LeadIntakeGuard } from './lead-intake.guard'
import type { IntakeClient } from './lead-intake.repository'
import { LeadIntakeService } from './lead-intake.service'

/** Anonymous, bounded landing-page door. It is separate from POST /sales/leads
 *  so public callers can never reach internal ownership or pipeline fields. */
@Controller('sales/leads')
export class LeadIntakeController {
  constructor(private readonly intake: LeadIntakeService) {}

  @Post('intake')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @RouteConfig({ bodyLimit: 16 * 1024 })
  @Public()
  @UseGuards(LeadIntakeGuard)
  accept(
    @Query(zod(LeadIntakeQuery)) query: LeadIntakeQueryValue,
    @Body(zod(LeadIntakeBody)) body: LeadIntakeBodyValue,
    @CurrentIntakeClient() client: IntakeClient,
  ) {
    return this.intake.accept(query, body, client)
  }
}
