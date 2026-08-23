import { Module } from '@nestjs/common'
import { ActorRepository } from './actor.repository'

/** Chỉ xuất khẩu `ActorRepository`.
 *
 *  `ActorGuard` CỐ TÌNH không nằm trong `providers`: nó được cấp bằng
 *  `APP_GUARD` ở `app.module.ts`, và Nest dựng một thể hiện riêng trong ngữ
 *  cảnh của `AppModule`. Khai ở cả hai chỗ thì có hai thể hiện — vô hại vì
 *  guard không giữ trạng thái, nhưng nó nói dối người đọc về vòng đời. */
@Module({ providers: [ActorRepository], exports: [ActorRepository] })
export class SessionModule {}
