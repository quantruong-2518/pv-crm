import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { registerConstraints } from '../http/db-error'
import { IDENTITY_CONSTRAINTS } from './comms.constraints'
import { IdentityController } from './identity.controller'
import { IdentityRepository } from './identity.repository'
import { IdentityService } from './identity.service'

/** Plugs this module's fences into the database-error translator — the same one
 *  line `users.module.ts` and `sales.module.ts` use. Runs while `AppModule`
 *  resolves its imports, i.e. before the port opens, so no request ever meets
 *  an empty book. */
registerConstraints(IDENTITY_CONSTRAINTS)

/** `comms` — the conversation book. Turn 0 is `comms.identity` alone.
 *
 *  Under `platform/` rather than a branch for the reason the Postgres schema is
 *  its own: an address belongs to a person, and the day Supply exists, mail
 *  with a supplier is this table rather than a copy of it. Filing it under
 *  Sales would say the opposite and guarantee that copy.
 *
 *  `imports: [AuditModule]` and nothing else — `DbModule` is one of the two
 *  `@Global()` modules. Audit is here because all three write doors record who
 *  did what, and `merge` DELETES a row whose address is unrecoverable once gone.
 *
 *  In particular NOT `GraphModule`: a row here POINTS AT `platform.object`
 *  through a real foreign key, it does not mint mirror rows, and `ObjectMirror`
 *  is the door for minting. The guest half can only name a `lead`, `account` or
 *  `contact` code, and all three already carry their own foreign key into the
 *  mirror.
 *
 *  No `exports`: nothing else in the server resolves an address yet.
 *  `resolve.service.ts` is turn 1's, and it will live in this module. */
@Module({
  imports: [AuditModule],
  controllers: [IdentityController],
  providers: [IdentityService, IdentityRepository],
})
export class CommsModule {}
