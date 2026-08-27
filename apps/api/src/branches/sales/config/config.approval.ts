import { Injectable, Logger } from '@nestjs/common'
import type { Actor, ApprovalState } from '@pv/engines'
import type { ConfigList } from '@pv/contracts'
import { PvError } from '@api/platform/http/problem'
import type { ConfigDraft, ConfigPatchDb } from './config.repository'

/** CHỖ NỐI E3 — MỘT điểm cho cả ba đường ghi, và hôm nay nó đang TRỐNG.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO MỌI ĐƯỜNG GHI PHẢI ĐI QUA ĐÂY
 *  ------------------------------------------------------------------
 *  Ma trận quyền của E2 KHÔNG có `cấu-hình.sửa`. Nó chỉ có `cấu-hình.xem` và
 *  `cấu-hình.đề-nghị` — và đó không phải chỗ thiếu, đó là câu trả lời: sửa từ
 *  vựng nghiệp vụ của cả phòng là việc phải có người gật, không phải việc một
 *  người bấm xong là xong. Bỏ một lý do rơi đang có 21 lead đứng tên thì 21
 *  dòng đó mất chỗ đứng.
 *
 *  Hệ quả: `POST`/`PATCH` của module này KHÔNG ghi thẳng xuống bảng. Chúng dựng
 *  một `ConfigChange` — mô tả đầy đủ và đã kiểm xong của việc cần làm — rồi đưa
 *  cho cửa này. Ngày E3 có mặt, `decide()` gật thì service gọi tiếp phần áp
 *  dụng; trước ngày đó không có gì được ghi.
 *
 *  ------------------------------------------------------------------
 *  ĐANG TRỐNG THẬT — ĐỪNG ĐỌC FILE NÀY NHƯ ĐÃ NỐI
 *  ------------------------------------------------------------------
 *  E3 chưa được khởi tạo ở đâu trong hệ (`ban-giao-api.md`, mục "Nợ đang có"),
 *  và bản `createApprovalEngine()` hiện có giữ yêu cầu trong một `Map` sống
 *  theo tiến trình — tức một lần deploy là mọi yêu cầu đang chờ biến mất. Nối
 *  vào cái đó rồi trả 202 cho người dùng là nói dối họ rằng đề nghị đã được ghi
 *  nhận.
 *
 *  Nên hôm nay cửa này TỪ CHỐI TO TIẾNG. Ba việc phải làm để mở nó, đúng thứ tự
 *  chặn nhau:
 *
 *    1 · bảng `sales.approval` + `approval_link` (đã liệt kê ở
 *        `ban-giao-db.md`, cụm D "chưa dựng") — chỗ lưu bền;
 *    2 · `APPROVALS` thành provider thật trong `platform/engines/engines.module.ts`
 *        (hôm nay module đó chỉ cấp `ACCESS`, và đã ghi rõ lý do ở trong);
 *    3 · thay dòng `useClass` trong `config.module.ts` bằng bản nối thật, rồi
 *        `SalesConfigService.apply()` chạy khi `state === 'approved'`.
 *
 *  Cả ba là việc của platform, không phải của nhánh Sales — nên chúng KHÔNG
 *  được làm lén trong module này. */

/** Việc cần gật. Đã kiểm xong ở service — cửa này không kiểm lại, và người
 *  duyệt đọc đúng thứ sẽ xảy ra chứ không đọc một payload thô.
 *
 *  Hai kiểu `ConfigDraft`/`ConfigPatchDb` mượn thẳng từ repository chứ không
 *  khai lại: đề nghị và phần áp dụng phải là CÙNG một hình dữ liệu, kẻo có ngày
 *  người ta gật một thứ và hệ ghi xuống một thứ khác. `id` và `ord` không nằm
 *  trong `draft` vì máy chủ sinh chúng lúc ÁP DỤNG — hai đề nghị cùng chờ mà đã
 *  giữ sẵn `ord` thì cái được gật sau mang một số đã cũ. */
export type ConfigChange =
  | { kind: 'tao'; list: ConfigList; draft: ConfigDraft }
  | { kind: 'sua'; list: ConfigList; id: string; patch: ConfigPatchDb }
  | { kind: 'thu-tu'; list: ConfigList; ids: string[] }

/** Biên lai của một đề nghị. `state` là của E3, không phải của module này. */
export type ConfigReceipt = {
  /** Mã yêu cầu trong Hộp duyệt của One. */
  requestId: string
  state: ApprovalState
  change: ConfigChange
}

/** Cửa DI. Lớp trừu tượng chứ không `interface`: Nest cần một GIÁ TRỊ làm token
 *  (`emitDecoratorMetadata` ghi tham chiếu lớp vào `design:paramtypes`), mà
 *  interface của TypeScript biến mất lúc biên dịch. Đổi bản triển khai là đổi
 *  đúng một dòng `useClass`. */
export abstract class SalesConfigGate {
  abstract propose(who: Actor, change: ConfigChange): Promise<ConfigReceipt>
}

/** Bản triển khai HÔM NAY: dựng xong đề nghị rồi từ chối, vì không có chỗ cất.
 *
 *  Trả 500 chứ không 202: 202 nghĩa là "đã nhận, đang xử lý", và không có gì
 *  đang xử lý cả. Hỏng theo hướng đóng — cùng hướng với `AccessGuard` và với
 *  `RouteAudit`. */
@Injectable()
export class SalesConfigGateChuaNoi extends SalesConfigGate {
  private readonly log = new Logger('sales.config')

  propose(who: Actor, change: ConfigChange): Promise<ConfigReceipt> {
    /* Đề nghị đã hợp lệ tới tận đây rồi mới chết. Ghi lại để người vận hành
       thấy được nhu cầu thật đang bị chặn ở đâu, và thấy bao nhiêu lần. */
    this.log.warn(
      `Đề nghị cấu hình bị chặn — chưa nối E3: ${who.id} · ${change.kind} · ${change.list}`,
    )

    return Promise.reject(
      new PvError({
        kind: 'server',
        status: 500,
        title:
          'Đề nghị đổi cấu hình chưa gửi đi được: quy trình duyệt (E3) chưa có nơi lưu. ' +
          'Cần bảng sales.approval trước khi đường ghi này mở.',
      }),
    )
  }
}
