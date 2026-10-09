import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  ActivityFreshnessPatch,
  ConfigEntryCreate,
  ConfigEntryPatch,
  ConfigList,
  ConfigOrderPatch,
  ConfigCode,
  LeadMotion,
  MotionPolicyPatch,
  StateRulePatch,
  StepTemplateCreate,
  StepTemplateOrderPatch,
  StepTemplateParams,
  StepTemplatePatch,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { SalesConfigService } from './config.service'
import { StepFrameService } from './step-frame.service'

/** `/sales/config` — cấu hình danh mục, module 6 của nhánh Sales.
 *
 *  Controller mỏng có chủ ý: nhận, kiểm, gọi, trả. Mọi thứ đáng đọc của các
 *  endpoint ở đây nằm ngay trên dòng khai báo — đường dẫn, quyền, hình dữ liệu vào.
 *
 *  ------------------------------------------------------------------
 *  HAI QUYỀN, VÀ KHOẢNG CÁCH GIỮA CHÚNG LÀ MỘT QUYẾT ĐỊNH
 *  ------------------------------------------------------------------
 *  Đọc cần `config.view` — năm trong bảy vai có. Ghi cần `config.propose`,
 *  mà ma trận E2 chỉ cấp nó cho Giám đốc và TP Kinh doanh. KHÔNG có
 *  `config.edit` trong `PERMISSIONS`, và đó là câu trả lời chứ không phải chỗ
 *  thiếu: từ vựng nghiệp vụ của cả phòng đổi thì phải có người gật. MỌI đường
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
    private readonly frame: StepFrameService,
  ) {}

  /** Cả sáu danh mục. Đây là thứ màn Cấu hình và mọi bảng tra nhãn cần. */
  @Get()
  @Need({ branch: 'Sales', permission: 'config.view' })
  bundle() {
    return this.config.bundle()
  }

  /** The book's staleness pair (ADR 0077 §4). Declared before `:list`, the
   *  habit `motions` keeps: a reader meets the narrow path first. */
  @Get('activity-freshness')
  @Need({ branch: 'Sales', permission: 'config.view' })
  activityFreshness() {
    return this.config.activityFreshness()
  }

  /** Both dials in one body, 202 like every write here. */
  @Patch('activity-freshness')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'config.propose' })
  patchActivityFreshness(
    @CurrentActor() who: Actor,
    @Body(zod(ActivityFreshnessPatch)) body: ActivityFreshnessPatch,
  ) {
    return this.config.proposeActivityFreshness(who, body)
  }

  /** The journey frame (ADR 0080): every template, switched-off ones too, and
   *  one rule per state with the default already resolved. The five doors sit
   *  before `:list` — `step-frame/rules` has the very shape of `:list/:id`. */
  @Get('step-frame')
  @Need({ branch: 'Sales', permission: 'config.view' })
  stepFrame() {
    return this.frame.frame()
  }

  @Post('step-frame/templates')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'config.propose' })
  createStepTemplate(
    @CurrentActor() who: Actor,
    @Body(zod(StepTemplateCreate)) body: StepTemplateCreate,
  ) {
    return this.frame.proposeCreate(who, body)
  }

  /** `order` before `:id`, the reason `:list/order` gives; `StepTemplateId` is
   *  a uuid, so the word could never be read as an id either. */
  @Patch('step-frame/templates/order')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'config.propose' })
  reorderStepTemplates(
    @CurrentActor() who: Actor,
    @Body(zod(StepTemplateOrderPatch)) body: StepTemplateOrderPatch,
  ) {
    return this.frame.proposeOrder(who, body)
  }

  @Patch('step-frame/templates/:id')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'config.propose' })
  patchStepTemplate(
    @CurrentActor() who: Actor,
    @Param(zod(StepTemplateParams)) params: StepTemplateParams,
    @Body(zod(StepTemplatePatch)) body: StepTemplatePatch,
  ) {
    return this.frame.proposePatch(who, params.id, body)
  }

  @Patch('step-frame/rules')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'config.propose' })
  patchStateRule(@CurrentActor() who: Actor, @Body(zod(StateRulePatch)) body: StateRulePatch) {
    return this.frame.proposeRule(who, body)
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

/** `GET /sales/lead-stop-reasons` — on `lead.view`, not `config.view`: whoever
 *  stops a lead or reads its history must name the reason (ADR 0070). */
@Controller('sales/lead-stop-reasons')
export class LeadStopReasonController {
  constructor(private readonly config: SalesConfigService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'lead.view' })
  list() {
    return this.config.stopReasons()
  }
}

/** `GET /sales/lead-motions` — the live `asks` for whoever types a lead. On
 *  `lead.edit`, not `config.view`: typists lack config rights yet must follow it. */
@Controller('sales/lead-motions')
export class LeadMotionController {
  constructor(private readonly config: SalesConfigService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'lead.edit' })
  list() {
    return this.config.motionOptions()
  }
}

/** `GET /sales/comm-vocabulary` — on `comm.view`, not `config.view`: whoever
 *  closes a comm must pick from these lists (ADR 0074), presales included. */
@Controller('sales/comm-vocabulary')
export class CommVocabularyController {
  constructor(private readonly config: SalesConfigService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'comm.view' })
  list() {
    return this.config.commVocabulary()
  }
}
