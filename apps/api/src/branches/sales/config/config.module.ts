import { Module } from '@nestjs/common'
import { SalesConfigController } from './config.controller'
import { SalesConfigGate, SalesConfigGateChuaNoi } from './config.approval'
import { SalesConfigRepository } from './config.repository'
import { SalesConfigService } from './config.service'

/** Module 6 · Cấu hình danh mục Sales.
 *
 *  ------------------------------------------------------------------
 *  TÊN LỚP MANG TIỀN TỐ `SalesConfig`, KHÔNG PHẢI `Config`
 *  ------------------------------------------------------------------
 *  `platform/config/` đã có một `ConfigModule` — biến môi trường. Hai lớp trùng
 *  tên trong cùng một đồ thị DI là một thông báo lỗi của Nest chỉ vào nhầm chỗ
 *  vào đúng lúc người ta đang vội. Tên file giữ nguyên quy ước
 *  `<tính-năng>.<vai>.ts` của repo; chỉ tên lớp dài thêm hai âm.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG `imports: [EnginesModule]` — VÀ ĐÓ LÀ CHỖ TRỐNG, KHÔNG PHẢI CHỖ QUÊN
 *  ------------------------------------------------------------------
 *  Module này cần **E3**, không cần E2 theo dòng như module lead (một dòng cấu
 *  hình không đứng tên ai, nên không có trục phạm vi để cắt). Mà `EnginesModule`
 *  hôm nay chỉ cấp `ACCESS`: `APPROVALS` và `NOTIFY` chưa được khởi tạo ở đâu
 *  trong hệ, vì chúng cần lưu trữ bền mà bảng thì chưa có.
 *
 *  Nên đường ghi đi qua `SalesConfigGate`, và bản đang chạy là bản TỪ CHỐI.
 *  Ngày E3 có bảng, thay đúng dòng `useClass` bên dưới và thêm
 *  `imports: [EnginesModule]` — đó là toàn bộ chỗ phải sửa ở nhánh Sales. Đọc
 *  `config.approval.ts` để biết ba việc phải xong trước ngày đó.
 *
 *  `exports` cố tình chỉ có `SalesConfigService`: module khác được hỏi "danh
 *  mục có những gì", không được với thẳng vào bảng. Sổ lead sẽ cần đúng thế để
 *  đổi mã sang nhãn. */
@Module({
  controllers: [SalesConfigController],
  providers: [
    SalesConfigService,
    SalesConfigRepository,
    { provide: SalesConfigGate, useClass: SalesConfigGateChuaNoi },
  ],
  exports: [SalesConfigService],
})
export class SalesConfigModule {}
