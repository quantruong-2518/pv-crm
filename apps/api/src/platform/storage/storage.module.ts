import { Module } from '@nestjs/common'
import { ENV, type Env } from '../config/env'
import { DiskStorage } from './disk.storage'
import { LocalStorageController } from './local-storage.controller'
import { S3Storage } from './s3.storage'
import { StorageService } from './storage.service'

/** Object storage for any owner of files. Not `@Global()` — a module that
 *  stores files imports this, so the graph shows who touches the bucket.
 *  The driver is chosen once, here, from `STORAGE_DRIVER`. */
@Module({
  controllers: [LocalStorageController],
  providers: [
    {
      provide: StorageService,
      useFactory: (env: Env): StorageService =>
        env.STORAGE_DRIVER === 's3' ? new S3Storage(env) : new DiskStorage(env),
      inject: [ENV],
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
