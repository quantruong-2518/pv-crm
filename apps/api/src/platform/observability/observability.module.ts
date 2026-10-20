import { Module } from '@nestjs/common'
import { MetricsService } from './metrics.service'

/** Imported by `AppModule`, so both the API and the worker start the timers.
 *  `main.ts` reaches the service with `app.get`; nothing else needs it. */
@Module({ providers: [MetricsService], exports: [MetricsService] })
export class ObservabilityModule {}
