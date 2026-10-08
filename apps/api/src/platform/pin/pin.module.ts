import { Module, type DynamicModule, type Type } from '@nestjs/common'
import { EnginesModule } from '../engines/engines.module'
import { PIN_REACH, type PinReach } from './pin-reach'
import { PinController } from './pin.controller'
import { PinRepository } from './pin.repository'
import { PinService } from './pin.service'

/** `platform.user_pin` — each person's pinned leads and deals, moved off the
 *  browser so a pin follows its owner. Under `platform/` because the row is a
 *  personal preference no branch owns; which codes may be pinned is the
 *  branch's answer, handed in through `withReach`. The books read pins only
 *  through `pinnedBy` (`pinned.ts`). */
@Module({
  imports: [EnginesModule],
  controllers: [PinController],
  providers: [PinService, PinRepository],
})
export class PinModule {
  /** The `CommsModule.withHook` shape: this module may not name a branch, so
   *  the composition root names the class. `useClass` because the reach needs
   *  only the global `DB`. */
  static withReach(wiring: { reach: Type<PinReach> }): DynamicModule {
    return {
      module: PinModule,
      providers: [{ provide: PIN_REACH, useClass: wiring.reach }],
    }
  }
}
