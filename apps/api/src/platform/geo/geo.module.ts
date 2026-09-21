import { Module } from '@nestjs/common'
import { GeoController } from './geo.controller'
import { GeoLimiter } from './geo.limiter'
import { GeoService } from './geo.service'
import { VietmapAdapter } from './vietmap.adapter'

/** `platform.geo` — address lookup, under `platform/` because an address
 *  belongs to no branch: Supply will want the same picker the day it types a
 *  supplier address, and a second copy under Sales would be a second key.
 *
 *  No `imports`: `ConfigModule` is `@Global()` and there is no table, no
 *  repository and no migration here — nothing is stored. No `exports` either:
 *  the one consumer is the web form, over HTTP. */
@Module({
  controllers: [GeoController],
  providers: [GeoService, GeoLimiter, VietmapAdapter],
})
export class GeoModule {}
