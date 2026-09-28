import { Module } from '@nestjs/common'
import { ENV, type Env } from '../config/env'
import { GeminiScanReader } from './gemini.scan-reader'
import { SCAN_READER, type ScanReader } from './scan-reader'

/** Model-backed readers. A value under a token, like `BOSS`: the reader has
 *  no dependency but `Env`, so a class for Nest to construct would add nothing. */
@Module({
  providers: [
    {
      provide: SCAN_READER,
      useFactory: (env: Env): ScanReader => new GeminiScanReader(env),
      inject: [ENV],
    },
  ],
  exports: [SCAN_READER],
})
export class AiModule {}
