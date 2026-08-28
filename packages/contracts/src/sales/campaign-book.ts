import { z } from 'zod'
import { MaObject, Moc, textNhap, textNhapTuyChon } from '../primitives'
import { PageQuery, SortDir, paged } from '../pagination'
import { MaConfig } from './config'
import { MasSendRequest, MasSendResponse, MailRunPatchResponse, MailRunRow } from './mail'

/** Sổ chiến dịch — module 5 của nhánh Sales. `GET/POST /sales/campaigns`.
 *
 *  Đứng trên `sales.campaign` (mã `CP-nnnn`) — đơn vị GỬI, KHÔNG phải nơi lead
 *  sinh ra (xem docblock của bảng ở `campaign.schema.ts`). Khác `./campaign`
 *  (mã `SR-`/`SK-`, "Nguồn dẫn" — nguồn kéo lead về, báo cáo). Hai khái niệm
 *  từng đứng chung một cái tên "chiến dịch" trên UI, đã tách theo quyết định
 *  D2 ở `docs/con-thieu-mas-mail.md`. Tên file này khác `./campaign` dù cùng
 *  đứng trên bảng `campaign` phía máy chủ, đúng lý do trên: `./campaign` đã bị
 *  một phiên khác nhận trước cho phần Nguồn dẫn. */

export const CampaignState = z.enum(['DRAFT', 'RUNNING', 'STOPPED', 'DONE'])

export const CampaignBookRow = z.object({
  code: MaObject,
  name: z.string().min(1),
  state: CampaignState,

  /** Chưa gán cũng là một trạng thái thật — xem docblock `campaign.schema.ts`.
   *  Ba trường CHỦ đi cùng nhau đúng khuôn `LeadRow.ownerId/ownerName/ownerEmail`:
   *  id là thứ duy nhất được so sánh, tên/hòm thư chỉ để hiển thị. */
  ownerId: z.string().min(1).optional(),
  ownerName: z.string().min(1).optional(),
  ownerEmail: z.string().min(1).optional(),

  /** Nguồn được quy công cho chiến dịch này — `config_entry.id` của một dòng
   *  `SOURCE`, cùng không gian mã `./campaign` đọc. Optional: một chiến dịch
   *  dựng trước khi ai quyết nó thuộc nguồn nào là trạng thái thật, giống hệt
   *  `LeadRow.source.campaignId`. */
  sourceId: MaConfig.optional(),
  sourceName: z.string().min(1).optional(),

  /** Số lead đang `ACTIVE` trong `campaign_member`. Máy chủ tính, không phải
   *  cột — giống `LeadRow.daysHere`. */
  audienceCount: z.number().int().nonnegative(),
  /** Số đợt đã bắn (`campaign_run`), không tính đợt đang soạn chưa gửi. */
  waveCount: z.number().int().nonnegative(),

  createdAt: Moc,
  updatedAt: Moc,
})

export const CampaignBookSortKey = z.enum(['name', 'createdAt'])

export const CampaignBookQuery = PageQuery.extend({
  state: CampaignState.optional(),
  owner: z.string().min(1).max(64).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  sort: CampaignBookSortKey.default('createdAt'),
  dir: SortDir.default('desc'),
})

export const CampaignBookResponse = paged(CampaignBookRow)

/** Một đợt đã bắn của chiến dịch, gắn số thứ tự vào NGUYÊN `MailRunRow` — không
 *  chép lại 11 con số của lô gửi bằng một hình riêng. `mail_run` không biết gì
 *  về chiến dịch (biên `platform`/`branches`), nên số thứ tự chỉ có ở phía này. */
export const CampaignWaveRow = z.object({
  waveNo: z.number().int().positive(),
  run: MailRunRow,
})

export const CampaignProfile = CampaignBookRow.extend({
  waves: z.array(CampaignWaveRow),
})

/** `POST /sales/campaigns` — mã do máy chủ sinh, trạng thái luôn bắt đầu `DRAFT`. */
export const CampaignCreate = z.object({
  name: textNhap(200),
  ownerId: textNhapTuyChon(64),
  sourceId: MaConfig.optional(),
})

export const CampaignCreateResponse = CampaignBookRow

/** `PATCH /sales/campaigns/:code` — sửa tên/chủ/nguồn quy công. Đổi TRẠNG THÁI
 *  đi qua `/start` và `/stop`, hai đường riêng, vì chúng đòi quyền khác
 *  (`chiến-dịch.bắn`) và không phải sửa nhầm một ô trên form là bắn được mail. */
export const CampaignPatch = z
  .object({
    name: textNhap(200).optional(),
    ownerId: textNhapTuyChon(64),
    sourceId: MaConfig.optional(),
  })
  .refine((v) => v.name !== undefined || v.ownerId !== undefined || v.sourceId !== undefined, {
    message: 'Cần sửa ít nhất một trường',
  })

export const CampaignPatchResponse = CampaignBookRow

/** `POST /sales/campaigns/:code/members` — thêm/bớt lead khỏi chiến dịch.
 *  `MEMBERSHIP IS FROZEN AT THE MOMENT OF ADDING` (xem `campaign.schema.ts`):
 *  bớt là chuyển `REMOVED`, không xoá dòng — ai đã nhận đợt 1 vẫn còn trong sổ. */
export const CampaignMemberPatch = z
  .object({
    add: z.array(MaObject).max(500).optional(),
    remove: z.array(MaObject).max(500).optional(),
  })
  .refine((v) => (v.add?.length ?? 0) > 0 || (v.remove?.length ?? 0) > 0, {
    message: 'Cần thêm hoặc bớt ít nhất một lead',
  })

export const CampaignMemberPatchResponse = z.object({
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  audienceCount: z.number().int().nonnegative(),
})

/** Một đợt trong kế hoạch bắt đầu chạy — CÙNG HÌNH `MasSendRequest`, trừ hai
 *  trường `/start` tự điền: `leadCodes` (toàn bộ audience đang ACTIVE của
 *  chiến dịch, máy chủ đọc chứ không nhận từ client) và `campaignCode` (đã có
 *  trên đường dẫn). Một hình, không phải hai — đúng lý do `MasSendRequest`
 *  vốn đã gộp Quick MAS và chiến dịch làm một. */
export const CampaignWaveInput = MasSendRequest.omit({ leadCodes: true, campaignCode: true })

/** `POST /sales/campaigns/:code/start` — chuyển `DRAFT` → `RUNNING` và bắn đợt
 *  đầu (có thể nhiều đợt cùng lúc nếu đã soạn sẵn). Đợt sau này thêm được từng
 *  cái một qua `POST /sales/mail/runs` với `campaignCode` — không cần gọi lại
 *  `/start`. Trần 20 đợt là để chặn một request khổng lồ, không phải trần thật
 *  của một chiến dịch. */
export const CampaignStart = z.object({
  waves: z.array(CampaignWaveInput).min(1).max(20),
})

export const CampaignStartResponse = z.object({
  state: CampaignState,
  waves: z.array(MasSendResponse),
})

/** `POST /sales/campaigns/:code/stop` — không thân yêu cầu: dừng là RÚT các
 *  đợt CHƯA GỬI khỏi hàng đợi, không phải một cờ. `cancelled` là receipt, một
 *  dòng cho mỗi lô bị huỷ, tái dùng nguyên `MailRunPatchResponse` của A6. */
export const CampaignStopResponse = z.object({
  state: CampaignState,
  cancelled: z.array(MailRunPatchResponse),
})

export type CampaignState = z.infer<typeof CampaignState>
export type CampaignBookRow = z.infer<typeof CampaignBookRow>
export type CampaignBookSortKey = z.infer<typeof CampaignBookSortKey>
export type CampaignBookQuery = z.infer<typeof CampaignBookQuery>
export type CampaignBookResponse = z.infer<typeof CampaignBookResponse>
export type CampaignWaveRow = z.infer<typeof CampaignWaveRow>
export type CampaignProfile = z.infer<typeof CampaignProfile>
export type CampaignCreate = z.infer<typeof CampaignCreate>
export type CampaignCreateResponse = z.infer<typeof CampaignCreateResponse>
export type CampaignPatch = z.infer<typeof CampaignPatch>
export type CampaignPatchResponse = z.infer<typeof CampaignPatchResponse>
export type CampaignMemberPatch = z.infer<typeof CampaignMemberPatch>
export type CampaignMemberPatchResponse = z.infer<typeof CampaignMemberPatchResponse>
export type CampaignWaveInput = z.infer<typeof CampaignWaveInput>
export type CampaignStart = z.infer<typeof CampaignStart>
export type CampaignStartResponse = z.infer<typeof CampaignStartResponse>
export type CampaignStopResponse = z.infer<typeof CampaignStopResponse>
