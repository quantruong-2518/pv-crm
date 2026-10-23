import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { StopLogController } from './stop-log.controller'
import { StopLogRepository } from './stop-log.repository'
import { StopLogService } from './stop-log.service'

/** The stop log: reads the three books' stop events, and nothing imports it. */
@Module({
  imports: [EnginesModule],
  controllers: [StopLogController],
  providers: [StopLogService, StopLogRepository],
})
export class StopLogModule {}
