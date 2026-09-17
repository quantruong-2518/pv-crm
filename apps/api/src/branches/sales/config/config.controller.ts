import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  ConfigEntryCreate,
  ConfigEntryPatch,
  ConfigList,
  ConfigOrderPatch,
  ConfigCode,
  LeadMotion,
  MotionPolicyPatch,
  StageCriterion,
  StageCriterionCreate,
  StageCriterionPatch,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { SalesConfigService } from './config.service'
import { StageCriterionService } from './stage-criterion.service'

/** `/sales/config` — cấu hình danh mục, module 6 của nhánh Sales.
 *
 *  Controller mỏng có chủ ý: nhận, kiểm, gọi, trả. Mọi thứ đáng đọc của năm
 *  endpoint này nằm ở các dòng khai báo — đường dẫn, quyền, hình dữ liệu vào.
 *
 *  ------------------------------------------------------------------
 *  HAI QUYỀN, VÀ KHOẢNG CÁCH GIỮA CHÚNG LÀ MỘT QUYẾT ĐỊNH
 *  ------------------------------------------------------------------
 *  Đọc cần `config.view` — năm trong bảy vai có. Ghi cần `config.propose`,
 *  mà ma trận E2 chỉ cấp nó cho Giám đốc và TP Kinh doanh. KHÔNG có
 *  `config.edit` trong `PERMISSIONS`, và đó là câu trả lời chứ không phải chỗ
 *  thiếu: từ vựng nghiệp vụ của cả phòng đổi thì phải có người gật. Ba đường
 *  ghi vì thế trả 202 — "đã nhận đề nghị", không phải "đã ghi".
 *
 *  ------------------------------------------------------------------
 *  THỨ TỰ HAI ĐƯỜNG `PATCH` CÓ NGHĨA
 *  ------------------------------------------------------------------
 *  `:list/order` khai TRƯỚC `:list/:id`. Bộ định tuyến của Fastify ưu tiên đoạn
 *  tĩnh hơn đoạn tham số nên thứ tự khai không đổi kết quả, nhưng người đọc thì
 *  đọc từ trên xuống — và `ConfigCode` cũng đã từ chối chuỗi 'order', nên có ba
 *  lớp cùng nói một điều. Ba lớp cho một chỗ dễ vấp là rẻ. */
@Controller('sales/config')
export class SalesConfigController {
  constructor(
    private readonly config: SalesConfigService,
    private readonly criteria: StageCriterionService,
  ) {}

  /** Cả sáu danh mục. Đây là thứ màn Cấu hình và mọi bảng tra nhãn cần. */
  @Get()
  @Need({ branch: 'Sales', permission: 'config.view' })
  bundle() {
    return this.config.bundle()
  }

  @Get(':list')
  @Need({ branch: 'Sales', permission: 'config.view' })
  list(@Param('list', zod(ConfigList)) list: ConfigList) {
    return this.config.list(list)
  }

  /** The six lead motions and what each declares — mostly nothing, so far.
   *
   *  Declared BEFORE the `:list` doors below, the habit this file already keeps:
   *  the router prefers a static segment over a parameter on its own, but a
   *  reader meets the narrow path first only if somebody writes it first. */
  @Get('motions')
  @Need({ branch: 'Sales', permission: 'config.view' })
  motions() {
    return this.config.motions()
  }

  /** Change one motion's declaration. 202 like every other write here: what
   *  comes back is a receipt for a request in the One inbox, not a saved row.
   *
   *  `PATCH` rather than `PUT` because a motion row always exists — the six are
   *  planted by migration and there is no door that creates or removes one. */
  @Patch('motions/:motion')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'config.propose' })
  patchMotion(
    @CurrentActor() who: Actor,
    @Param('motion', zod(LeadMotion)) motion: LeadMotion,
    @Body(zod(MotionPolicyPatch)) body: MotionPolicyPatch,
  ) {
    return this.config.proposeMotion(who, motion, body)
  }

  /** Stage gate exit criteria. Static segment, declared before the `:list`
   *  doors for the same reader's reason as `motions`. */
  @Get('stage-criteria')
  @Need({ branch: 'Sales', permission: 'config.view' })
  stageCriteria() {
    return this.criteria.list()
  }

  @Post('stage-criteria')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'config.propose' })
  createCriterion(
    @CurrentActor() who: Actor,
    @Body(zod(StageCriterionCreate)) body: StageCriterionCreate,
  ) {
    return this.criteria.create(who, body)
  }

  @Patch('stage-criteria/:id')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'config.propose' })
  patchCriterion(
    @CurrentActor() who: Actor,
    @Param('id', zod(StageCriterion.shape.id)) id: string,
    @Body(zod(StageCriterionPatch)) body: StageCriterionPatch,
  ) {
    return this.criteria.patch(who, id, body)
  }

  @Post(':list')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'config.propose' })
  create(
    @CurrentActor() who: Actor,
    @Param('list', zod(ConfigList)) list: ConfigList,
    @Body(zod(ConfigEntryCreate)) body: ConfigEntryCreate,
  ) {
    return this.config.create(who, list, body)
  }

  @Patch(':list/order')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'config.propose' })
  reorder(
    @CurrentActor() who: Actor,
    @Param('list', zod(ConfigList)) list: ConfigList,
    @Body(zod(ConfigOrderPatch)) body: ConfigOrderPatch,
  ) {
    return this.config.reorder(who, list, body)
  }

  @Patch(':list/:id')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'config.propose' })
  patch(
    @CurrentActor() who: Actor,
    @Param('list', zod(ConfigList)) list: ConfigList,
    @Param('id', zod(ConfigCode)) id: ConfigCode,
    @Body(zod(ConfigEntryPatch)) body: ConfigEntryPatch,
  ) {
    return this.config.patch(who, list, id, body)
  }
}
