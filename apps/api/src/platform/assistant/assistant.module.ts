import { Module, type DynamicModule, type ModuleMetadata, type Type } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { AuditModule } from '../audit/audit.module'
import { EnginesModule } from '../engines/engines.module'
import { AssistantBootSweeper } from './assistant-boot.sweeper'
import { AssistantRunner } from './assistant-loop'
import { AssistantSessionRepository } from './assistant-session.repository'
import { AssistantSummarizer } from './assistant-summary'
import { ASSISTANT_TOOLS, AssistantToolGate, type AssistantToolSource } from './assistant-tools'
import { AssistantTurns } from './assistant-turns'
import { AssistantController } from './assistant.controller'
import { AssistantRepository } from './assistant.repository'
import { AssistantService } from './assistant.service'

/** The CRM assistant (ADR 0133). Wave 1 opens `/assistant` to holders of
 *  `assistant.use`, and only while the `assistant` route is on.
 *
 *  `withTools` is the `CommsModule.withHook` shape: this module may not name a
 *  branch, so the composition root hands over the branch's class. The plain module
 *  leaves `ASSISTANT_TOOLS` unbound and refuses to boot. */
@Module({
  imports: [AiModule, AuditModule, EnginesModule],
  controllers: [AssistantController],
  providers: [
    AssistantRepository,
    AssistantSessionRepository,
    AssistantToolGate,
    AssistantSummarizer,
    AssistantRunner,
    AssistantTurns,
    AssistantService,
    AssistantBootSweeper,
  ],
})
export class AssistantModule {
  static withTools(wiring: {
    imports: ModuleMetadata['imports']
    source: Type<AssistantToolSource>
  }): DynamicModule {
    return {
      module: AssistantModule,
      imports: wiring.imports ?? [],
      providers: [{ provide: ASSISTANT_TOOLS, useExisting: wiring.source }],
    }
  }
}
