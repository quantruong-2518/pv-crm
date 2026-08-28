import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { registerConstraints } from '../http/db-error'
import { ACTOR_CONSTRAINTS } from './users.constraints'
import { UsersController } from './users.controller'
import { UsersRepository } from './users.repository'
import { UsersService } from './users.service'

/** This module plugs its own constraint book into the database-error
 *  translator, the same one line `sales.module.ts` uses.
 *
 *  Runs when this file is loaded, i.e. inside `AppModule`'s `imports` chain,
 *  i.e. before the server opens a port — no request ever sees an empty book.
 *  Registering HERE rather than having `platform/http/db-error.ts` go looking
 *  keeps the dependency pointing one way; a translator that knew which tables
 *  exist would have to be reopened by every module that ever adds a
 *  constraint. */
registerConstraints(ACTOR_CONSTRAINTS)

/** Quản trị · Người dùng — the four doors of `platform.actor`.
 *
 *  ------------------------------------------------------------------
 *  UNDER `platform/`, NOT UNDER A BRANCH
 *  ------------------------------------------------------------------
 *  The people book belongs to no product line: Sales reads it, Supply will read
 *  it, neither owns it. Filing it under `branches/sales` would say the opposite
 *  and would make the first branch that needed its own view of it build a
 *  second copy — which is the same reasoning that put the table in the
 *  `platform` schema and the contract beside `problem.ts`.
 *
 *  ------------------------------------------------------------------
 *  `imports: [AuthModule]` — TWO THINGS, BOTH RULES RATHER THAN TABLES
 *  ------------------------------------------------------------------
 *  `AuthService` is the only thing this module needs from the sign-in half, and
 *  it needs exactly two of its methods: `sendInvite` to mint a set-password
 *  ticket and post the letter, and `revokeAllSessions` to end a locked
 *  person's access in the same transaction as the lock flag.
 *
 *  `AuthRepository` stays where it is — inside `AuthModule`, unexported, by the
 *  explicit decision written in that module's docblock. Reaching around
 *  `AuthService` to write `platform.session` from here would be the first crack
 *  in "there is one way in", and every rule stated in `auth.service.ts` holds
 *  only because that is true.
 *
 *  ------------------------------------------------------------------
 *  NO `exports`
 *  ------------------------------------------------------------------
 *  Nothing else in the server has any business creating or editing people.
 *  Modules that need to know a person exists already have narrower doors —
 *  `ActorRepository` for the guard, `SalesConfigRepository.actorExists` for a
 *  foreign key — and each of those reads. Exporting the write service "in case"
 *  would be handing out the widest capability in the system before anybody has
 *  asked for it. */
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
})
export class UsersModule {}
