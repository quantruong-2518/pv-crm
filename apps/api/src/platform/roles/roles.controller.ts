import { Body, Controller, Get, Param, Patch } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { RoleGrantsPatch, RoleId } from '@pv/contracts'
import { Need } from '../access/need.decorator'
import { NeedsReauth } from '../auth/reauth.guard'
import { zod } from '../http/zod.pipe'
import { CurrentActor } from '../session/current-actor.decorator'
import { RolesService } from './roles.service'

/** `/roles` — the role matrix, and the only door onto
 *  `platform.role_permission`.
 *
 *  No `branch`: like the people book, the matrix belongs to no product line.
 *  Hanging it off a Sales licence would shut the permission screen for a
 *  company that bought only Supply, and the person shut out is the one who
 *  grants permissions to everybody else. */
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** The whole matrix. Gated on `role.manage` and not merely on being signed
   *  in: it says exactly which role can reach which door, which is the map
   *  somebody looking for a way in would want first. */
  @Get()
  @Need({ permission: 'role.manage' })
  matrix() {
    return this.roles.matrix()
  }

  /** Overwrite one role's grants.
   *
   *  `@NeedsReauth()` for the reason the people book's three write doors carry
   *  it: this is the single widest-reaching write in the product — it changes
   *  what every person wearing the role may do, in one call — and it is
   *  precisely what somebody at an abandoned machine would reach for. The
   *  `@Get` above is exempt; reading changes nothing.
   *
   *  `roleId` is validated by the contract's own enum rather than taken as a
   *  string: an unknown role would otherwise insert grants nobody ever reads
   *  and no screen can show. */
  @Patch(':roleId')
  @Need({ permission: 'role.manage' })
  @NeedsReauth()
  replace(
    @CurrentActor() who: Actor,
    @Param('roleId', zod(RoleId)) roleId: RoleId,
    @Body(zod(RoleGrantsPatch)) body: RoleGrantsPatch,
  ) {
    return this.roles.replace(who, roleId, body.permissions)
  }
}
