import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { ENV, type Env } from '../config/env'
import { AiCostController } from './ai-cost.controller'
import { AiCostRepository } from './ai-cost.repository'
import { AiCostService } from './ai-cost.service'
import { AiLedger } from './ai-ledger'
import { GeminiScanReader } from './gemini.scan-reader'
import { SCAN_READER, type ScanReader } from './scan-reader'

/** Model-backed readers, the ledger every model call is written to, and the
 *  cost doors that read it (ADR 0102). The reader is a value under a token,
 *  like `BOSS`: it has no dependency but `Env`, so a class for Nest to
 *  construct would add nothing. `AuditModule` is for the price write's line. */
@Module({
  imports: [AuditModule],
  controllers: [AiCostController],
  providers: [
    {
      provide: SCAN_READER,
      useFactory: (env: Env): ScanReader => new GeminiScanReader(env),
      inject: [ENV],
    },
    AiLedger,
    AiCostRepository,
    AiCostService,
  ],
  exports: [SCAN_READER, AiLedger],
})
export class AiModule {}
