import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { SettingController } from './setting.controller'
import { SettingRepository } from './setting.repository'
import { SettingService } from './setting.service'

/** `platform.setting` — system constants an operator tunes.
 *
 *  Under `platform/` and not under a branch because the numbers it holds decide
 *  how the WHOLE server behaves: a retention window applies to every branch's
 *  attachments, and a step ceiling applies to every branch's sequences. Filing
 *  it under Sales would license it to one product line and guarantee a second
 *  copy the day a second branch needs a threshold.
 *
 *  `imports: [AuditModule]` and nothing else — `DbModule` is one of the two
 *  `@Global()` modules. Audit is here because the write door records who moved
 *  which dial, in the same transaction as the move.
 *
 *  `exports: [SettingService]` is the point of the module rather than a
 *  convenience: the two HTTP doors serve one admin screen, while `value()` is
 *  what every other service asks its thresholds through. Any module needing a
 *  constant imports this one — it does not read the table, and it does not keep
 *  a default of its own. */
@Module({
  imports: [AuditModule],
  controllers: [SettingController],
  providers: [SettingService, SettingRepository],
  exports: [SettingService],
})
export class SettingModule {}
