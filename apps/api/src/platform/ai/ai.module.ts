import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { ENV, type Env } from '../config/env'
import { AnthropicClient } from './anthropic.client'
import { AiCostController } from './ai-cost.controller'
import { AiCostRepository } from './ai-cost.repository'
import { AiCostService } from './ai-cost.service'
import { AI_CLIENTS, AiGateway, type AiClients } from './ai-gateway'
import { AiLedger } from './ai-ledger'
import { AiRouteController } from './ai-route.controller'
import { AiRouteRepository } from './ai-route.repository'
import { AiRouteService } from './ai-route.service'
import { GatewayScanReader } from './gateway.scan-reader'
import { GeminiClient } from './gemini.client'
import { SCAN_READER, type ScanReader } from './scan-reader'

/** The AI gateway, the vendor clients behind it, the ledger it writes, and the
 *  cost and route doors (ADR 0102 and its gateway successor). Clients and the
 *  reader are values under tokens, like `BOSS`: each needs one constructor
 *  argument, so a class for Nest to construct would add nothing.
 *  `AuditModule` is for the price and route writes' lines. */
@Module({
  imports: [AuditModule],
  controllers: [AiCostController, AiRouteController],
  providers: [
    {
      provide: AI_CLIENTS,
      useFactory: (env: Env): AiClients => ({
        gemini: new GeminiClient(env.GEMINI_API_KEY),
        anthropic: new AnthropicClient(env.ANTHROPIC_API_KEY),
      }),
      inject: [ENV],
    },
    {
      provide: SCAN_READER,
      useFactory: (gateway: AiGateway): ScanReader => new GatewayScanReader(gateway),
      inject: [AiGateway],
    },
    AiGateway,
    AiLedger,
    AiRouteRepository,
    AiRouteService,
    AiCostRepository,
    AiCostService,
  ],
  exports: [SCAN_READER, AiGateway],
})
export class AiModule {}
