import { z } from 'zod'
import { Dong, Moc, Ngay } from '../primitives'
import { MaConfig } from './config'

/** Module 1 · Chiến dịch & Sự kiện — `GET /sales/campaigns/sources` và
 *  `GET /sales/campaigns/totals`.
 *
 *  ------------------------------------------------------------------
 *  MÁY CHỦ TRẢ SỰ KIỆN, KHÔNG TRẢ KẾT LUẬN
 *  ------------------------------------------------------------------
 *  Mọi trường dưới đây là thứ ĐẾM ĐƯỢC hoặc ai đó ĐÃ NHẬP: bao nhiêu lead về,
 *  bao nhiêu thư gửi đi, bao nhiêu tiền tiêu ngày nào. Không có `openRate`,
 *  không có `costPerGood`, không có `status`, không có dải Wilson — cả bốn đều
 *  là phép tính trên chính những con số này, và chúng nằm ở `data/campaigns.ts`
 *  cùng `@pv/engines/stats` nơi màn đã tính chúng từ đầu.
 *
 *  Đây không phải sự lười ở tầng máy chủ. Một tỉ lệ gửi qua dây là một tỉ lệ
 *  không kiểm lại được: người đọc màn thấy 24% mà không có cách nào biết nó
 *  chia trên mẫu số nào, và ngày hai màn cần hai mẫu số khác nhau thì máy chủ
 *  phải đẻ ra trường thứ hai. Gửi tử số và mẫu số thì cả hai màn tự chia lấy,
 *  và `bounceRate` của module 1 vẫn dùng chung một mẫu số với `openRate` —
 *  điều kiện để ba cột đứng cạnh nhau so được với nhau.
 *
 *  ------------------------------------------------------------------
 *  "NGUỒN" LÀ MỘT DÒNG `SOURCE` CỦA SỔ CẤU HÌNH
 *  ------------------------------------------------------------------
 *  Mã `SR-…`, cùng thứ `lead.campaign_id` trỏ vào. KHÔNG phải `sales.campaign`
 *  (`CP-…`, chiến dịch GỬI MAIL) — xem docblock của `source.schema.ts` trên
 *  máy chủ cho lý do đầy đủ và cho sợi dây nối hai thứ đó. */

// ---------------------------------------------------------------------------
// Tiền
// ---------------------------------------------------------------------------

/** Năm loại chi TIỀN MẶT. Danh sách ĐÓNG — không có loại thứ sáu, không có ô
 *  "khác": một ô "khác" là chỗ mọi hoá đơn khó phân loại chui vào, và sau ba
 *  tháng nó thành loại lớn nhất bảng.
 *
 *  Nhân công KHÔNG có mặt ở đây. 300 triệu chi cho một kỳ là tiền mặt đã ra
 *  khỏi tài khoản; giờ người là một lớp khác và hôm nay chưa có bảng giờ nào
 *  trong hệ để đo. Nhét giờ vào đây là đổi NGHĨA của một con số mà không đổi
 *  giá trị của nó — kiểu sai không test nào bắt được.
 *
 *  ASCII viết hoa, cùng quy ước với `LeadSourceKind` và `LeadMotion`: giá trị
 *  này nằm trong một cột, đi qua URL và qua log. Nhãn tiếng Việt là chuyện của
 *  tầng màn. */
export const CostKind = z.enum(['DATA', 'CHANNEL', 'CONTENT', 'EVENT', 'TOOL'])

export type CostKind = z.infer<typeof CostKind>

/** Một dòng chi. `label` là tên HOÁ ĐƠN ("Apollo 2.000 dòng"), khác nhãn của
 *  loại — một nguồn có ba dòng cùng loại `CHANNEL` là chuyện thường. */
export const SourceCostLine = z.object({
  id: z.uuid(),
  kind: CostKind,
  label: z.string().min(1),
  amount: Dong,
  /** NGÀY TIÊU, không phải ngày nhập. Đây là thứ cho phép cắt chi phí theo kỳ. */
  spentOn: Ngay,
})

// ---------------------------------------------------------------------------
// Đợt
// ---------------------------------------------------------------------------

/** Một đợt gửi của nguồn — một `campaign_run` cộng số đếm của lô mail nó trỏ
 *  tới.
 *
 *  Số đếm là AGGREGATE tính lúc đọc trên `email_delivery`/`mail_event`, không
 *  phải cột ai đó tăng dần: một bộ đếm sửa tay và những dòng nó đếm sẽ lệch
 *  nhau ngay lần webhook đầu tiên bị phát lại, và sau đó không ai biết cái nào
 *  đang nói dối (`MailRunRow` trong `./mail` nói đủ lý do).
 *
 *  `opened` LÀ CẬN DƯỚI CÓ NHIỄU — đọc cảnh báo ở `MailRunRow.opened` trước khi
 *  đặt nó cạnh một dấu phần trăm. */
export const SourceWave = z.object({
  no: z.number().int().positive(),
  label: z.string().min(1),
  /** Lô mail của đợt. Có nó thì màn mở thẳng được sang chi tiết lô. */
  mailRunId: z.uuid(),
  /** Ngày lô rời máy chủ. Vắng = lô còn nháp hoặc còn hẹn giờ, chưa chạy. */
  sentAt: Moc.optional(),
  /** Người nhận lô này NỢ khi mở — picks sống sót sau preflight. */
  audience: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  opened: z.number().int().nonnegative(),
  /** Bấm vào một đường dẫn trong thư — ĐẾM THEO NGƯỜI, không theo lần bấm.
   *
   *  Đây là chỗ thay cho `replied` mà bản fixture có, và việc thay là bắt buộc
   *  chứ không phải gọn hơn: hệ thư của hệ ghi được `OPEN` · `CLICK` ·
   *  `UNSUBSCRIBE`, và KHÔNG ghi được "người ta có trả lời không" — thư trả lời
   *  đi vào hộp thư của người gửi, một nơi máy chủ này không đọc. Giữ tên
   *  `replied` mà đổ số click vào là đặt một cái nhãn sai lên một con số đúng,
   *  và không ai đọc màn phát hiện được. */
  clicked: z.number().int().nonnegative(),
  bounced: z.number().int().nonnegative(),
  /** Lead ĐẶT TRƯỚC cho đợt. `null` = không ai đặt kỳ vọng, KHÁC hẳn 0 — xem
   *  `campaign_run.expected`. */
  expected: z.number().int().nonnegative().nullable(),
})

// ---------------------------------------------------------------------------
// Sự kiện
// ---------------------------------------------------------------------------

/** Chỉ nguồn kiểu sự kiện có khối này. Vắng = không phải sự kiện, KHÔNG phải
 *  "chưa ai đến" — hai chuyện đó phải phân biệt được ở tầng màn. */
export const SourceEvent = z.object({
  venue: z.string().min(1).optional(),
  registered: z.number().int().nonnegative().optional(),
  checkedIn: z.number().int().nonnegative().optional(),
  heldOn: Ngay.optional(),
})

// ---------------------------------------------------------------------------
// Một nguồn
// ---------------------------------------------------------------------------

/** Ba loại nguồn. Giá trị của `config_entry.kind` trên danh mục `SOURCE`, giữ
 *  nguyên cách viết đã có trong cột — đổi cách viết là một migration, không
 *  phải một dòng hợp đồng. */
export const SourceKind = z.enum(['chien-dich', 'su-kien', 'tu-nhien'])

export type SourceKind = z.infer<typeof SourceKind>

/** Một dòng của bảng nguồn.
 *
 *  `ownerName` đi cạnh `ownerId` theo đúng luật `LeadRow` đã đặt: id là thứ
 *  DUY NHẤT được đem đi so, name là thứ DUY NHẤT được in ra. Có cả hai trên dây
 *  thì màn không bao giờ có lý do vẽ một cái mã ra cho người dùng nhìn. */
export const CampaignSource = z.object({
  code: MaConfig,
  name: z.string().min(1),
  /** Vắng = dòng cấu hình chưa ai gán loại. Màn phải chịu được chuyện đó thay
   *  vì đoán 'chien-dich'. */
  kind: SourceKind.optional(),
  active: z.boolean(),

  ownerId: z.string().min(1).optional(),
  ownerName: z.string().min(1).optional(),
  /** Người theo dõi thêm, KHÔNG kể chủ. Rỗng là câu trả lời hợp lệ. */
  followers: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })),

  /** Lead nguồn này kéo về — đếm trên `lead.campaign_id`. */
  leads: z.number().int().nonnegative(),
  /** Lead đã qua cổng init data (đủ ô bắt buộc). `leads - goodLeads` là số lead
   *  còn đang làm bận BD, và đó là phép trừ nghiệp vụ chứ không phải phép trừ
   *  trang trí trong JSX — nên hai số đi cùng nhau và màn tự trừ. */
  goodLeads: z.number().int().nonnegative(),
  /** Lead của nguồn đã thành cơ hội. Cột cuối của bảng, và là câu trả lời thật
   *  cho "nguồn này có ra tiền không" — mọi cột trước nó mới đo cái phễu. */
  ops: z.number().int().nonnegative(),

  waves: z.array(SourceWave),
  costs: z.array(SourceCostLine),
  event: SourceEvent.optional(),

  /** Mốc đầu và cuối của nguồn, suy từ chính dữ liệu: lead sớm nhất, đợt sớm
   *  nhất, hoá đơn sớm nhất. Vắng cả hai = nguồn chưa có gì xảy ra. */
  firstAt: Moc.optional(),
  lastAt: Moc.optional(),
})

export const CampaignSourceResponse = z.object({
  rows: z.array(CampaignSource),
  /** Kỳ mà những con số này nói về — mốc sớm nhất và muộn nhất có dữ liệu.
   *  Màn dựng trục thời gian từ đây thay vì từ một hằng số đóng băng. */
  period: z.object({ fromISO: Moc, toISO: Moc }),
})

// ---------------------------------------------------------------------------
// Tổng của cả sổ
// ---------------------------------------------------------------------------

/** Hàng score card. Cùng luật với `CampaignSource`: tử số và mẫu số, không tỉ
 *  lệ. */
export const CampaignTotals = z.object({
  /** Nguồn có người chạy (`chien-dich` + `su-kien`). */
  sources: z.number().int().nonnegative(),
  /** Nguồn tự nhiên — không ai chạy chiến dịch nào. Tách ra vì số lead của
   *  chúng vẫn phải nói ra một lần, không thì bảng đọc như cả kỳ. */
  natural: z.object({
    count: z.number().int().nonnegative(),
    leads: z.number().int().nonnegative(),
  }),

  waves: z.number().int().nonnegative(),
  audience: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  opened: z.number().int().nonnegative(),
  /** Người bấm, không phải người trả lời — xem `SourceWave.clicked`. */
  clicked: z.number().int().nonnegative(),
  bounced: z.number().int().nonnegative(),

  leads: z.number().int().nonnegative(),
  goodLeads: z.number().int().nonnegative(),
  /** Cơ hội sinh ra từ lead CÓ nguồn, và cả sổ cơ hội. Chỗ chênh là khách tự
   *  tìm tới — không nguồn nào được ghi công, và màn phải nói ra chỗ chênh. */
  ops: z.number().int().nonnegative(),
  opsBook: z.number().int().nonnegative(),

  cost: Dong,
  period: z.object({ fromISO: Moc, toISO: Moc }),
})

export type SourceCostLine = z.infer<typeof SourceCostLine>
export type SourceWave = z.infer<typeof SourceWave>
export type SourceEvent = z.infer<typeof SourceEvent>
export type CampaignSource = z.infer<typeof CampaignSource>
export type CampaignSourceResponse = z.infer<typeof CampaignSourceResponse>
export type CampaignTotals = z.infer<typeof CampaignTotals>
