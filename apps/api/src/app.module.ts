import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { SalesModule } from './branches/sales/sales.module'
import { AccessGuard } from './platform/access/access.guard'
import { AccessModule } from './platform/access/access.module'
import { AuditModule } from './platform/audit/audit.module'
import { AuthModule } from './platform/auth/auth.module'
import { ConfigModule } from './platform/config/config.module'
import { DbModule } from './platform/db/db.module'
import { EnginesModule } from './platform/engines/engines.module'
import { HealthModule } from './platform/health/health.module'
import { MailModule } from './platform/mail/mail.module'
import { ProblemFilter } from './platform/http/problem.filter'
import { ActorGuard } from './platform/session/actor.guard'
import { SessionModule } from './platform/session/session.module'
import { UsersModule } from './platform/users/users.module'

/** Gốc của app. Hai nhóm import, và ranh giới giữa chúng là luật:
 *
 *   · `platform/*` — nền dùng chung, KHÔNG thuộc nhánh nào;
 *   · `branches/*` — mỗi nhánh một module, mỗi nhánh một schema Postgres.
 *
 *  Platform không được nhập ngược lên nhánh, và nhánh không được nhập chéo
 *  nhau. Nest module không tự ép được hai luật đó — `no-restricted-imports`
 *  trong `eslint.config.js` ép, cùng cơ chế repo đang gác biên giới package.
 *
 *  ------------------------------------------------------------------
 *  ĐÚNG HAI MODULE ĐƯỢC `@Global()`
 *  ------------------------------------------------------------------
 *  `ConfigModule` (biến môi trường) và `DbModule` (pool Postgres) — hai thứ hạ
 *  tầng thuần, không mang nghiệp vụ, và mọi tầng đều chạm.
 *
 *  Còn lại đều nhập TƯỜNG MINH. Bản trước có bốn module global và đó là một
 *  lỗi thiết kế im lặng: nếu gần như mọi thứ đều global thì đồ thị module
 *  không còn phát biểu điều gì, tức mất đúng thứ khiến Nest đáng chọn cho một
 *  hệ năm nhánh. Dài thêm mấy dòng, đổi lại đọc `imports` là biết ai phụ thuộc
 *  ai. */
@Module({
  imports: [
    ConfigModule,
    DbModule,
    EnginesModule,
    AuditModule,
    SessionModule,
    /* SAU `SessionModule`, và không phải vì thẩm mỹ: `ActorGuard` bên dưới
       nhận CẢ HAI — `ActorRepository` của `SessionModule` cho cửa sau header,
       và `AuthService` của module này cho đường cookie thật. Module này cũng
       mang `/auth`, bảy cửa của luồng đăng nhập, nên đọc danh sách này phải
       thấy được rằng máy chủ có chúng — cùng lý do `MailModule` được nhập
       tường minh ngay bên dưới. */
    AuthModule,
    /* Right after `AuthModule`, and for the same two reasons that module is
       listed at all. It DEPENDS on it — `/users` mints invite tickets and
       revokes a locked person's sessions through `AuthService`, the only door
       `AuthModule` exports — and it carries `/users`, the four doors of the
       people book, so reading this list has to show that the server has them.
       Filed under `platform/` rather than a branch because `platform.actor`
       belongs to no product line; `users.module.ts` writes that out in full. */
    UsersModule,
    AccessModule,
    HealthModule,
    /* Nhập TƯỜNG MINH dù `LeadModule` cũng đã nhập nó. Hai lý do: `MailModule`
       là của platform, không được đi nhờ qua một nhánh mới có mặt trong cây;
       và nó mang ba controller — cửa webhook của Resend, `/healthz/email` và
       cửa huỷ đăng ký của người nhận — nên đọc danh sách này phải thấy được
       rằng máy chủ có ba đường đó. */
    MailModule,
    SalesModule,
  ],
  providers: [
    /** THỨ TỰ CÓ NGHĨA. Nest chạy guard toàn cục theo đúng thứ tự khai báo:
     *  "anh là ai" phải xong trước khi hỏi "anh được làm gì". Đổi chỗ hai dòng
     *  này thì `AccessGuard` luôn thấy `actor === null` và từ chối tất cả. */
    { provide: APP_GUARD, useClass: ActorGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
})
export class AppModule {}
