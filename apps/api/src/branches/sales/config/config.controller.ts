import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  ConfigEntryCreate,
  ConfigEntryPatch,
  ConfigList,
  ConfigOrderPatch,
  MaConfig,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { SalesConfigService } from './config.service'

/** `/sales/config` — cấu hình danh mục, module 6 của nhánh Sales.
 *
 *  Controller mỏng có chủ ý: nhận, kiểm, gọi, trả. Mọi thứ đáng đọc của năm
 *  endpoint này nằm ở các dòng khai báo — đường dẫn, quyền, hình dữ liệu vào.
 *
 *  ------------------------------------------------------------------
 *  HAI QUYỀN, VÀ KHOẢNG CÁCH GIỮA CHÚNG LÀ MỘT QUYẾT ĐỊNH
 *  ------------------------------------------------------------------
 *  Đọc cần `cấu-hình.xem` — năm trong bảy vai có. Ghi cần `cấu-hình.đề-nghị`,
 *  mà ma trận E2 chỉ cấp nó cho Giám đốc và TP Kinh doanh. KHÔNG có
 *  `cấu-hình.sửa` trong `PERMISSIONS`, và đó là câu trả lời chứ không phải chỗ
 *  thiếu: từ vựng nghiệp vụ của cả phòng đổi thì phải có người gật. Ba đường
 *  ghi vì thế trả 202 — "đã nhận đề nghị", không phải "đã ghi".
 *
 *  ------------------------------------------------------------------
 *  THỨ TỰ HAI ĐƯỜNG `PATCH` CÓ NGHĨA
 *  ------------------------------------------------------------------
 *  `:list/order` khai TRƯỚC `:list/:id`. Bộ định tuyến của Fastify ưu tiên đoạn
 *  tĩnh hơn đoạn tham số nên thứ tự khai không đổi kết quả, nhưng người đọc thì
 *  đọc từ trên xuống — và `MaConfig` cũng đã từ chối chuỗi 'order', nên có ba
 *  lớp cùng nói một điều. Ba lớp cho một chỗ dễ vấp là rẻ. */
@Controller('sales/config')
export class SalesConfigController {
  constructor(private readonly config: SalesConfigService) {}

  /** Cả sáu danh mục. Đây là thứ màn Cấu hình và mọi bảng tra nhãn cần. */
  @Get()
  @Need({ branch: 'Sales', permission: 'cấu-hình.xem' })
  bundle() {
    return this.config.bundle()
  }

  @Get(':list')
  @Need({ branch: 'Sales', permission: 'cấu-hình.xem' })
  list(@Param('list', zod(ConfigList)) list: ConfigList) {
    return this.config.list(list)
  }

  @Post(':list')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'cấu-hình.đề-nghị' })
  create(
    @CurrentActor() who: Actor,
    @Param('list', zod(ConfigList)) list: ConfigList,
    @Body(zod(ConfigEntryCreate)) body: ConfigEntryCreate,
  ) {
    return this.config.create(who, list, body)
  }

  @Patch(':list/order')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'cấu-hình.đề-nghị' })
  reorder(
    @CurrentActor() who: Actor,
    @Param('list', zod(ConfigList)) list: ConfigList,
    @Body(zod(ConfigOrderPatch)) body: ConfigOrderPatch,
  ) {
    return this.config.reorder(who, list, body)
  }

  @Patch(':list/:id')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'cấu-hình.đề-nghị' })
  patch(
    @CurrentActor() who: Actor,
    @Param('list', zod(ConfigList)) list: ConfigList,
    @Param('id', zod(MaConfig)) id: MaConfig,
    @Body(zod(ConfigEntryPatch)) body: ConfigEntryPatch,
  ) {
    return this.config.patch(who, list, id, body)
  }
}
