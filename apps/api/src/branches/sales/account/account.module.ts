import { Module } from '@nestjs/common'
import { GraphModule } from '@api/platform/graph/graph.module'
import { AccountController } from './account.controller'
import { AccountRepository } from './account.repository'
import { AccountService } from './account.service'

/** One Core-adjacent, but a Sales module: the customer COMPANY book.
 *
 *  `GraphModule` and not `EnginesModule`, and the difference says what this
 *  module does and does not do. It writes a mirror row into `platform.object`
 *  for every company (E1's graph is what the ContextRail walks), so it needs
 *  `ObjectMirror`. It does NOT ask E2 anything, because it has no scope axis to
 *  enforce — the two doors it does have are gated entirely by `@Need`, and a
 *  second grid over rows nobody is allowed to hide would filter nothing.
 *
 *  `exports` carries the service because the lead write path calls
 *  `resolveForLead` inside its own transaction — that is the one cross-module
 *  reach here, and it goes through the exported service rather than through the
 *  table, per the branch rule in `apps/api/CLAUDE.md`. */
@Module({
  imports: [GraphModule],
  controllers: [AccountController],
  providers: [AccountService, AccountRepository],
  exports: [AccountService],
})
export class AccountModule {}
