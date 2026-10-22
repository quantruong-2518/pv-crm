import { Module, type DynamicModule, type ModuleMetadata, type Type } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { EnginesModule } from '../engines/engines.module'
import { RolesModule } from '../roles/roles.module'
import { ORG_HOOK, type OrgHook } from './org-hook'
import { OrgController } from './org.controller'
import { OrgRepository } from './org.repository'
import { OrgService } from './org.service'

/** `platform.org_*` — the org tree (ADR 0118). Under `platform/` because
 *  visibility will read the same tree KPI reads now; what KPI must say about an
 *  edit (lock, floor, team rows) is handed in through `withHook`. */
@Module({
  imports: [AuditModule, EnginesModule, RolesModule],
  controllers: [OrgController],
  providers: [OrgService, OrgRepository],
})
export class OrgModule {
  /** The `PinModule.withReach` shape: this module may not name a branch, so the
   *  composition root names the class and the module its dependencies come from. */
  static withHook(wiring: {
    imports: ModuleMetadata['imports']
    hook: Type<OrgHook>
  }): DynamicModule {
    return {
      module: OrgModule,
      imports: wiring.imports ?? [],
      providers: [{ provide: ORG_HOOK, useClass: wiring.hook }],
    }
  }
}
