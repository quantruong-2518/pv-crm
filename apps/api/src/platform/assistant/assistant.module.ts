import { Module, type DynamicModule, type ModuleMetadata, type Type } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { AuditModule } from '../audit/audit.module'
import { EnginesModule } from '../engines/engines.module'
import { ASSISTANT_TOOLS, AssistantToolGate, type AssistantToolSource } from './assistant-tools'
import { AssistantRunner } from './assistant-loop'
import { AssistantSummarizer } from './assistant-summary'
import { AssistantRepository } from './assistant.repository'

/** The CRM assistant (ADR 0133). Wave 0 has no controller and no route, so nobody
 *  reaches it over HTTP; it is in the app so the gate's boot check runs.
 *
 *  `withTools` is the `CommsModule.withHook` shape: this module may not name a
 *  branch, so the composition root hands over the branch's class. The plain module
 *  leaves `ASSISTANT_TOOLS` unbound and refuses to boot. */
@Module({
  imports: [AiModule, AuditModule, EnginesModule],
  providers: [AssistantRepository, AssistantToolGate, AssistantSummarizer, AssistantRunner],
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
