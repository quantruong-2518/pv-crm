import { z } from 'zod'
import { ObjectCode, Moment, Day, textInput, textInputOptional } from '../primitives'
import { PageQuery, SortDir, paged } from '../pagination'
import { ConfigCode } from './config'
import {
  MasRecipient,
  MasSendRequest,
  MasSendResponse,
  MailRunPatchResponse,
  MailRunRow,
} from './mail'

/** Sổ chiến dịch — module 5 của nhánh Sales. `GET/POST /sales/campaigns`.
 *
 *  Đứng trên `sales.campaign` (mã `CP-nnnn`) — đơn vị GỬI, KHÔNG phải nơi lead
 *  sinh ra (xem docblock của bảng ở `campaign.schema.ts`). Khác `./campaign`
 *  (mã `SR-`/`SK-`, "Nguồn dẫn" — nguồn kéo lead về, báo cáo). Hai khái niệm
 *  từng đứng chung một cái tên "chiến dịch" trên UI, đã tách theo quyết định
 *  D2, đóng ở `docs/decisions/0009-campaign-module-decisions.md`.
 *  Tên file này khác `./campaign` dù cùng
 *  đứng trên bảng `campaign` phía máy chủ, đúng lý do trên: `./campaign` đã bị
 *  một phiên khác nhận trước cho phần Nguồn dẫn. */

export const CampaignState = z.enum(['DRAFT', 'RUNNING', 'STOPPED', 'DONE'])

export const CampaignBookRow = z.object({
  code: ObjectCode,
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
  sourceId: ConfigCode.optional(),
  sourceName: z.string().min(1).optional(),

  /** Câu mở đầu ngắn hiện dưới tên chiến dịch trên bước Hồ sơ. Trang trí,
   *  không phải dữ liệu nghiệp vụ — vắng là bình thường. */
  slogan: z.string().min(1).optional(),
  /** URL ảnh thumbnail, không phải file lưu ở máy chủ — kho file chưa có nên
   *  đây là ô dán URL, giống `MailCta.url`. */
  thumbnailUrl: z.url('Địa chỉ ảnh phải là một URL đầy đủ').optional(),

  /** Last day the campaign takes new leads; absent = open-ended. With `state`,
   *  it is what the lead-create picker filters on — see `CampaignPickableResponse`. */
  endsOn: Day.optional(),

  /** Số lead đang `ACTIVE` trong `campaign_member`. Máy chủ tính, không phải
   *  cột — giống `LeadRow.daysHere`. */
  audienceCount: z.number().int().nonnegative(),
  /** Số đợt đã bắn (`campaign_run`), không tính đợt đang soạn chưa gửi. */
  waveCount: z.number().int().nonnegative(),

  createdAt: Moment,
  updatedAt: Moment,
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

/** THE TWO LIMITS THIS CAMPAIGN IS GOVERNED BY, carried on the profile.
 *
 *  Both are environment settings (`PV_MAS_BATCH_MAX`,
 *  `PV_MAS_BOUNCE_CEILING_PERCENT`), and the screen used to invent them — the
 *  send ceiling by borrowing `MAS_MAX_RECIPIENTS`, a contract constant that
 *  bounds a hand-picked REQUEST and never sees a campaign's audience, and the
 *  bounce ceiling by typing "4%" into JSX. Both lied in two directions: raise
 *  the real ceiling and the screen locks a send the server allows, lower it and
 *  the readiness band stays green until a 409. */
export const CampaignProfile = CampaignBookRow.extend({
  waves: z.array(CampaignWaveRow),
  /** Most recipients one wave may carry. */
  batchCeiling: z.number().int().positive(),
  /** Bounce rate at which the breaker holds the rest of a wave, in percent. */
  bounceCeilingPercent: z.number().positive(),
})

/** `POST /sales/campaigns` — mã do máy chủ sinh, trạng thái luôn bắt đầu `DRAFT`. */
export const CampaignCreate = z.object({
  name: textInput(200),
  ownerId: textInputOptional(64),
  sourceId: ConfigCode.optional(),
  slogan: textInputOptional(200),
  thumbnailUrl: z.url('Địa chỉ ảnh phải là một URL đầy đủ').optional(),
  endsOn: Day.optional(),
})

export const CampaignCreateResponse = CampaignBookRow

/** `PATCH /sales/campaigns/:code` — sửa tên/chủ/nguồn quy công. Đổi TRẠNG THÁI
 *  đi qua `/start` và `/stop`, hai đường riêng, vì chúng đòi quyền khác
 *  (`campaign.broadcast`) và không phải sửa nhầm một ô trên form là bắn được mail. */
export const CampaignPatch = z
  .object({
    name: textInput(200).optional(),
    /** THREE states, not two — absent is "leave it", `null` is "CLEAR it".
     *
     *  Until 30/08 there were only two: `textInputOptional` turns `''` into
     *  `undefined`, so a Select returning its unassigned option looked exactly like
     *  a field nobody touched, and an owner once assigned had no API that could
     *  remove it. The screen had to print an
     *  apology where a button belonged. `null` goes straight to the column — all
     *  four are nullable, and the `campaign_no_blank` CHECK compares `<> ''`, so
     *  `NULL` passes it by design rather than by luck. */
    ownerId: textInputOptional(64).nullable(),
    sourceId: ConfigCode.nullable().optional(),
    slogan: textInputOptional(200).nullable(),
    thumbnailUrl: z.url('Địa chỉ ảnh phải là một URL đầy đủ').nullable().optional(),
    endsOn: Day.nullable().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.ownerId !== undefined ||
      v.sourceId !== undefined ||
      v.slogan !== undefined ||
      v.thumbnailUrl !== undefined ||
      v.endsOn !== undefined,
    { message: 'Cần sửa ít nhất một trường' },
  )

export const CampaignPatchResponse = CampaignBookRow

/** `POST /sales/campaigns/:code/members` — thêm/bớt lead khỏi chiến dịch.
 *  `MEMBERSHIP IS FROZEN AT THE MOMENT OF ADDING` (xem `campaign.schema.ts`):
 *  bớt là chuyển `REMOVED`, không xoá dòng — ai đã nhận đợt 1 vẫn còn trong sổ. */
export const CampaignMemberPatch = z
  .object({
    add: z.array(ObjectCode).max(500).optional(),
    remove: z.array(ObjectCode).max(500).optional(),
  })
  .refine((v) => (v.add?.length ?? 0) > 0 || (v.remove?.length ?? 0) > 0, {
    message: 'Cần thêm hoặc bớt ít nhất một lead',
  })

export const CampaignMemberPatchResponse = z.object({
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  audienceCount: z.number().int().nonnegative(),
})

/** `GET /sales/campaigns/:code/members` — WHO IS IN THE AUDIENCE.
 *
 *  Without this door `CampaignMemberPatch.remove` is half an API nobody can
 *  reach: the screen knows who it just added but not who is already in, so a
 *  "remove" button would have to guess. `company`/`contactName` ride along
 *  because this list is read by a PERSON — a bare column of lead codes does not
 *  answer "who should be left out of the next wave". */
export const CampaignMemberState = z.enum(['ACTIVE', 'REMOVED'])

export const CampaignMemberRow = z.object({
  leadCode: ObjectCode,
  company: z.string().min(1),
  contactName: z.string().min(1),
  /** Absent = the lead has no address, so this row is certain to be skipped at
   *  send time. The screen marks it up front rather than letting the sender
   *  discover it afterwards in `skipped`. */
  email: z.email().optional(),
  state: CampaignMemberState,
  addedAt: Moment,
})

export const CampaignMemberQuery = PageQuery.extend({
  state: CampaignMemberState.default('ACTIVE'),
})

export const CampaignMemberListResponse = paged(CampaignMemberRow)

/** Một đợt trong kế hoạch bắt đầu chạy — CÙNG HÌNH `MasSendRequest`, trừ hai
 *  trường `/start` tự điền: `audience` (toàn bộ audience đang ACTIVE của
 *  chiến dịch, máy chủ đọc chứ không nhận từ client — luôn là lead, chiến dịch
 *  chưa có audience opportunity) và `campaignCode` (đã có trên đường dẫn). Một
 *  hình, không phải hai — đúng lý do `MasSendRequest` vốn đã gộp Quick MAS và
 *  chiến dịch làm một. */
export const CampaignWaveInput = MasSendRequest.omit({ audience: true, campaignCode: true })

/** `POST /sales/campaigns/:code/start` — chuyển `DRAFT` → `RUNNING` và bắn đợt
 *  đầu (có thể nhiều đợt cùng lúc nếu đã soạn sẵn). Chỉ nhận chiến dịch NHÁP
 *  CHƯA có đợt nào; đợt thứ hai trở đi đi qua `CampaignWaveAdd` bên dưới, nơi
 *  máy chủ tự đọc audience đã đóng băng. Trần 20 đợt là để chặn một request
 *  khổng lồ, không phải trần thật của một chiến dịch. */
/** The cap on ONE `/start` body, exported because the composer prints it as
 *  `n/20` and a ceiling the screen retypes is a ceiling that drifts from the
 *  one the server enforces. Read the paragraph above before reusing it: this
 *  bounds a REQUEST, not a campaign — `POST /waves` adds wave 21 without ever
 *  seeing this number. */
export const CAMPAIGN_START_MAX_WAVES = 20

export const CampaignStart = z.object({
  waves: z.array(CampaignWaveInput).min(1).max(CAMPAIGN_START_MAX_WAVES),
})

export const CampaignStartResponse = z.object({
  state: CampaignState,
  waves: z.array(MasSendResponse),
})

/** `POST /sales/campaigns/:code/waves` — WAVE TWO ONWARDS, and why it is not
 *  `POST /sales/mail/runs`.
 *
 *  `/start` fires the first wave and locks the campaign `RUNNING`; until 30/08
 *  every wave after that had to detour through the MAS modal on the lead book,
 *  which means the sender RE-PICKS the whole audience BY HAND. That is precisely
 *  what `campaign_member` exists to make unnecessary: the audience was frozen at
 *  wave 1, and picking again by hand picks a DIFFERENT set.
 *
 *  So the request body carries no `audience`, exactly like `CampaignStart`: the
 *  server reads the campaign's own audience. One shape, one source of truth, and
 *  the recipient ceiling enforced in exactly one place. */
export const CampaignWaveAdd = z.object({
  wave: CampaignWaveInput,
})

export const CampaignWaveAddResponse = MasSendResponse

/** `POST /sales/campaigns/:code/stop` — không thân yêu cầu: dừng là RÚT các
 *  đợt CHƯA GỬI khỏi hàng đợi, không phải một cờ. `cancelled` là receipt, một
 *  dòng cho mỗi lô bị huỷ, tái dùng nguyên `MailRunPatchResponse` của A6. */
export const CampaignStopResponse = z.object({
  state: CampaignState,
  cancelled: z.array(MailRunPatchResponse),
})

/** One member of this campaign who is ALSO being written to by another one.
 *
 *  Not a `MasRecipientBlock`: nothing refuses this letter, and the server will
 *  send it. It is the one thing a sender cannot see from anywhere else —
 *  `campaign_member` is per campaign, so two campaigns mailing the same person
 *  in the same week is invisible until the person replies asking to be left
 *  alone. The campaign book's own scorecard admits it counts sends rather than
 *  people; this is the other half of that admission. */
export const CampaignOverlap = z.object({
  leadCode: ObjectCode,
  /** The OTHER campaign — never the one being preflighted. */
  campaignCode: ObjectCode,
  campaignName: z.string().min(1),
})

/** `POST /sales/campaigns/:code/preflight` — WHO THIS CAMPAIGN CAN REACH.
 *
 *  Its own door rather than a `campaignCode` field on `MasPreflightRequest`,
 *  and both reasons point the same way.
 *
 *  ONE ROUTE, ONE PERMISSION (ADR 0004): the MAS preflight declares
 *  `lead.send-email`, while a dry run of `/start` must demand what `/start`
 *  demands — `campaign.broadcast`.
 *
 *  AND A PREFLIGHT MUST PREDICT THE SEND IT PRECEDES. `MasService.send()` reads
 *  a campaign's audience UNSCOPED (`scoped: campaignCode === undefined`), the
 *  MAS preflight hardcodes scoped — so on a campaign holding somebody else's
 *  leads the old door called them missing while the send reached them.
 *
 *  No request body: the audience is `campaign_member`, not a pick. */
export const CampaignPreflightResponse = z.object({
  /** Every ACTIVE member, blocked or not — one list with the refusals marked,
   *  never two the reader has to reconcile. */
  recipients: z.array(MasRecipient),
  /** How many letters this wave would actually produce. */
  sendable: z.number().int().nonnegative(),
  /** How many members produce none, for the reasons on their rows. */
  blocked: z.number().int().nonnegative(),
  /** No `hidden` twin of `MasPreflightResponse`: that number exists because the
   *  scope axis can cut a pick out of the answer, and this read is unscoped by
   *  the same rule the send follows. `sendable + blocked` is the whole
   *  audience, and a missing member here would be a bug, not a permission. */
  alsoRunning: z.array(CampaignOverlap),
})

/** `GET /sales/campaigns/pickable` — the campaign box on `LeadCreate`. Only
 *  `DRAFT`/`RUNNING` campaigns not past `endsOn` are pickable: a `STOPPED` or
 *  `DONE` one, or one whose window closed, cannot gain a new member. */
export const CampaignPickableQuery = z.object({
  q: z.string().trim().min(1).max(120).optional(),
})
export type CampaignPickableQuery = z.infer<typeof CampaignPickableQuery>

export const CampaignPickableResponse = z.object({
  rows: z.array(
    z.object({
      code: ObjectCode,
      name: z.string().min(1),
      state: z.enum(['DRAFT', 'RUNNING']),
      endsOn: Day.optional(),
      sourceId: ConfigCode.optional(),
    }),
  ),
})
export type CampaignPickableResponse = z.infer<typeof CampaignPickableResponse>

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
export type CampaignMemberState = z.infer<typeof CampaignMemberState>
export type CampaignMemberRow = z.infer<typeof CampaignMemberRow>
export type CampaignMemberQuery = z.infer<typeof CampaignMemberQuery>
export type CampaignMemberListResponse = z.infer<typeof CampaignMemberListResponse>
export type CampaignWaveInput = z.infer<typeof CampaignWaveInput>
export type CampaignStart = z.infer<typeof CampaignStart>
export type CampaignStartResponse = z.infer<typeof CampaignStartResponse>
export type CampaignWaveAdd = z.infer<typeof CampaignWaveAdd>
export type CampaignWaveAddResponse = z.infer<typeof CampaignWaveAddResponse>
export type CampaignStopResponse = z.infer<typeof CampaignStopResponse>
export type CampaignOverlap = z.infer<typeof CampaignOverlap>
export type CampaignPreflightResponse = z.infer<typeof CampaignPreflightResponse>
