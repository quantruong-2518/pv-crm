import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { EnginesModule } from '../engines/engines.module'
import { registerConstraints } from '../http/db-error'
import { IDENTITY_CONSTRAINTS, THREAD_CONSTRAINTS } from './comms.constraints'
import { IdentityController } from './identity.controller'
import { IdentityRepository } from './identity.repository'
import { IdentityService } from './identity.service'
import { ThreadController } from './thread.controller'
import { ThreadRepository } from './thread.repository'
import { ThreadService } from './thread.service'

/** Plugs this module's fences into the database-error translator — the same one
 *  line `users.module.ts` and `sales.module.ts` use. Runs while `AppModule`
 *  resolves its imports, i.e. before the port opens, so no request ever meets
 *  an empty book. */
registerConstraints(IDENTITY_CONSTRAINTS)
registerConstraints(THREAD_CONSTRAINTS)

/** `comms` — the conversation book. Turn 0 is `comms.identity`, turn 1 the
 *  thread/message/party/link four.
 *
 *  Under `platform/` rather than a branch for the reason the Postgres schema is
 *  its own: an address belongs to a person, and the day Supply exists, mail
 *  with a supplier is this table rather than a copy of it. Filing it under
 *  Sales would say the opposite and guarantee that copy.
 *
 *  `imports: [AuditModule, EnginesModule]` — `DbModule` is one of the two
 *  `@Global()` modules, the other two are asked for by name. Audit is here
 *  because every write door records who did what, `merge` DELETES a row whose
 *  address is unrecoverable once gone, and turn 1 added a READ that leaves a
 *  trail too (§5c). `EnginesModule` arrived with turn 1: E2 answers both the
 *  scope question and the content question, and it is not `@Global()`.
 *
 *  Still NOT `GraphModule`, and turn 1 does not change that. Rows here POINT
 *  AT `platform.object` through real foreign keys; they never mint a mirror
 *  row, and `ObjectMirror` is the door for minting. Reading a mirror row to
 *  ask E2 about it is a `SELECT` on a table this schema already references,
 *  not a reason to import the write half of the object graph.
 *
 *  No `exports`: nothing else in the server reads a conversation yet. */
@Module({
  imports: [AuditModule, EnginesModule],
  controllers: [IdentityController, ThreadController],
  providers: [IdentityService, IdentityRepository, ThreadService, ThreadRepository],
})
export class CommsModule {}
