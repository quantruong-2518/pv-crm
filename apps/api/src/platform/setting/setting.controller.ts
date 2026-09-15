import { Body, Controller, Get, Patch } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { SettingPatch } from '@pv/contracts'
import { Need } from '../access/need.decorator'
import { zod } from '../http/zod.pipe'
import { CurrentActor } from '../session/current-actor.decorator'
import { SettingService } from './setting.service'

/** `/platform/settings` — the operator's dial box.
 *
 *  Thin, the shape `campaign.controller.ts` and `users.controller.ts` keep:
 *  take, check, call, return. No business `if`, no SQL.
 *
 *  ONE PERMISSION ON BOTH DOORS, and no `branch`. `setting.manage` covers read
 *  and write alike because nobody browses this table — it is opened while about
 *  to turn something — and a separate view permission would grant sight of a
 *  list nobody opens on purpose. The contract states that call; it is not
 *  re-argued here. No `branch` for the reason `/users` writes out in full: a
 *  threshold of the whole system belongs to no product line, and hanging it off
 *  a Sales licence would shut the box for a company that bought only Supply.
 *
 *  No `scoped` either. There is no owner column to cut six system constants by,
 *  and a flag claiming otherwise would be a promise the server cannot keep.
 *
 *  ONE ROUTE, ONE PERMISSION also means the PATCH stays one route: every member
 *  of `SettingPatch` needs exactly `setting.manage`, so no body can reach a door
 *  wanting a different key than the one declared on the line above it. */
@Controller('platform/settings')
export class SettingController {
  constructor(private readonly settings: SettingService) {}

  /** All six, always — including the keys with no row behind them. */
  @Get()
  @Need({ permission: 'setting.manage' })
  list() {
    return this.settings.list()
  }

  /** One key's override, set or moved. No `:key` on the path: the key is inside
   *  the body because `SettingPatch` is a discriminated union on it, and that is
   *  what makes zod pick the right per-key bound. Splitting the key onto the
   *  path would hand zod a value it cannot discriminate on. */
  @Patch()
  @Need({ permission: 'setting.manage' })
  set(@CurrentActor() who: Actor, @Body(zod(SettingPatch)) body: SettingPatch) {
    return this.settings.set(who, body)
  }
}
