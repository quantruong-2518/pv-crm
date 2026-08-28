import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  CampaignBookQuery,
  CampaignCreate,
  CampaignMemberPatch,
  CampaignPatch,
  CampaignStart,
  MaObject,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { CampaignService } from './campaign.service'

/** `/sales/campaigns` — sổ chiến dịch thật, đứng trên `sales.campaign`
 *  (mã `CP-`). Đóng A3 của `docs/con-thieu-mas-mail.md`.
 *
 *  Controller mỏng có chủ ý, đúng khuôn `lead.controller.ts`: nhận, kiểm, gọi,
 *  trả. Không `if` nghiệp vụ, không SQL.
 *
 *  ------------------------------------------------------------------
 *  `/start` VÀ `/stop` LÀ HAI ĐƯỜNG RIÊNG, KHÔNG PHẢI `state` TRÊN `PATCH`
 *  ------------------------------------------------------------------
 *  Ba lý do: (1) chúng đòi `chiến-dịch.bắn` — quyền BẮN mail thật — trong khi
 *  sửa tên/chủ chỉ đòi `chiến-dịch.sửa`; gộp vào một `PATCH` thì hoặc phải nâng
 *  quyền cho MỌI sửa tên, hoặc phải đọc thân yêu cầu trước khi biết quyền nào
 *  đúng (thứ `MasController` phải làm vì MỘT route phục vụ hai tầm với — ở đây
 *  không cần, vì `/start`/`/stop` vốn đã là hai route riêng). (2) `/start` nhận
 *  một thân khác hẳn (`waves`), không phải một field tuỳ chọn trên `CampaignPatch`.
 *  (3) đọc log là thấy ngay ai bấm gửi mail thật, không phải đoán qua một
 *  `PATCH {state}` chung với mọi sửa khác. */
@Controller('sales/campaigns')
export class CampaignController {
  constructor(private readonly campaigns: CampaignService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'chiến-dịch.xem', scoped: true })
  book(@CurrentActor() who: Actor, @Query(zod(CampaignBookQuery)) q: CampaignBookQuery) {
    return this.campaigns.book(who, q)
  }

  @Get(':code')
  @Need({ branch: 'Sales', permission: 'chiến-dịch.xem', scoped: true })
  profile(@CurrentActor() who: Actor, @Param('code', zod(MaObject)) code: MaObject) {
    return this.campaigns.profile(who, code)
  }

  /** Không `scoped`: chưa có dòng nào để cắt theo phạm vi — cùng lý do
   *  `LeadController.create` không khai `scoped`. */
  @Post()
  @Need({ branch: 'Sales', permission: 'chiến-dịch.sửa' })
  create(@Body(zod(CampaignCreate)) body: CampaignCreate) {
    return this.campaigns.create(body)
  }

  @Patch(':code')
  @Need({ branch: 'Sales', permission: 'chiến-dịch.sửa', scoped: true })
  patch(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaObject)) code: MaObject,
    @Body(zod(CampaignPatch)) body: CampaignPatch,
  ) {
    return this.campaigns.patch(who, code, body)
  }

  @Post(':code/members')
  @Need({ branch: 'Sales', permission: 'chiến-dịch.sửa', scoped: true })
  members(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaObject)) code: MaObject,
    @Body(zod(CampaignMemberPatch)) body: CampaignMemberPatch,
  ) {
    return this.campaigns.members(who, code, body)
  }

  @Post(':code/start')
  @Need({ branch: 'Sales', permission: 'chiến-dịch.bắn', scoped: true })
  start(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaObject)) code: MaObject,
    @Body(zod(CampaignStart)) body: CampaignStart,
  ) {
    return this.campaigns.start(who, code, body)
  }

  @Post(':code/stop')
  @Need({ branch: 'Sales', permission: 'chiến-dịch.bắn', scoped: true })
  stop(@CurrentActor() who: Actor, @Param('code', zod(MaObject)) code: MaObject) {
    return this.campaigns.stop(who, code)
  }
}
