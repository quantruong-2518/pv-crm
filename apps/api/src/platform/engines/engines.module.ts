import { Module } from '@nestjs/common'
import { createAccessControl } from '@pv/engines'
import { ACCESS } from './tokens'

/** Bốn engine nền tảng, đăng ký NGUYÊN TRẠNG.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG BỌC ENGINE VÀO MỘT @Injectable
 *  ------------------------------------------------------------------
 *  Cám dỗ ở đây là viết `@Injectable() class AccessService` rồi uỷ nhiệm từng
 *  hàm sang `createAccessControl()`. Đừng. Lớp bọc đó là một bản fork: ngày
 *  nào đó ai đó thêm một nhánh `if` vào lớp bọc mà không thêm vào engine, và
 *  từ hôm ấy app web với máy chủ kiểm quyền theo hai luật khác nhau. Luật
 *  "nhánh không fork engine" (CLAUDE.md) áp cho cả máy chủ.
 *
 *  Engine đã tự tiêm phụ thuộc tường minh (`createAccessControl({ clock })`) —
 *  đó CHÍNH LÀ dependency injection, chỉ là không cần container. Việc của
 *  module này chỉ là gọi factory một lần và cho phần còn lại của app mượn.
 *
 *  E3 và E4 chưa có mặt: chúng chưa được khởi tạo ở đâu trong `apps/web` và là
 *  DỰNG MỚI ở máy chủ, không phải port — chúng cần lưu trữ bền, mà lưu trữ bền
 *  thì phải có bảng và có repository trước. Thêm vào đây khi có. */

@Module({
  providers: [{ provide: ACCESS, useFactory: () => createAccessControl() }],
  exports: [ACCESS],
})
export class EnginesModule {}
