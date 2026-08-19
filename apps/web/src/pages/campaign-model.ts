import { CalendarCheck, Megaphone, Sprout, type LucideIcon } from 'lucide-react'
import {
  DAS_VINA_FROZEN_AT,
  dasVina,
  dayISO,
  type SourceKind,
  type WaveChannel,
} from '@pv/engines/fixtures/das-vina'
import { dm } from '@/lib/date'
import { DRAFT_STEP_DAYS, DRAFT_TEMPLATE, type DraftWave, type SourceRow } from '@/data/campaigns'
import { CHANNEL_LABEL, E4_CHANNELS } from '@/data/sales-config'

/** Module 1 · phần KHÔNG phải component — hằng số, nhãn, và phép dựng bản nháp.
 *
 *  Tách khỏi `campaign-parts.tsx` vì `react-refresh/only-export-components`:
 *  một file vừa xuất component vừa xuất hằng số thì hot-reload không biết nên
 *  thay gì, và mọi lần sửa một nhãn sẽ dựng lại cả form đang gõ dở. Ranh giới
 *  ở đây là "có JSX hay không", không phải "thuộc màn nào" — cả ba màn của
 *  module đọc từ file này. */

export const KINDS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'chien-dich', label: 'Chiến dịch' },
  { key: 'su-kien', label: 'Sự kiện' },
  { key: 'tu-nhien', label: 'Tự nhiên' },
] as const

export const KIND_LABEL: Record<SourceKind, string> = {
  'chien-dich': 'Chiến dịch',
  'su-kien': 'Sự kiện',
  'tu-nhien': 'Tự nhiên',
}

export const KIND_TONE: Record<SourceKind, 'running' | 'success' | 'draft'> = {
  'chien-dich': 'running',
  'su-kien': 'success',
  'tu-nhien': 'draft',
}

/** Icon định danh của LOẠI nguồn — cùng vai trò với `CHANNEL_ICON` của kênh:
 *  nhìn hình là biết dòng đó là chiến dịch chạy trên kênh, một buổi có mặt người
 *  thật, hay khách tự tìm tới. */
export const KIND_ICON: Record<SourceKind, LucideIcon> = {
  'chien-dich': Megaphone,
  'su-kien': CalendarCheck,
  'tu-nhien': Sprout,
}

/** Kênh gửi đọc từ module 5 · Cấu hình, KHÔNG khai lại ở đây.
 *
 *  Trước 19/08 màn này giữ bản sao `CHANNEL_LABEL` + `E4_CHANNELS` của riêng
 *  nó, vì E4 mới có `type Channel` — một kiểu, không phải danh sách chạy được.
 *  Bản sao đó phá đúng luật 1 của module 5 ("cấu hình là dữ liệu, không màn nào
 *  giữ bản sao một hằng số"), và hai bản sao thì sớm muộn lệch nhau.
 *
 *  Bốn kênh E4 đã mở đường; ba kênh còn lại là nền tảng đăng bài ra ngoài — nợ
 *  treo số 2 của docs. Đây là ranh giới thật chứ không phải cách tô màu: đợt
 *  nằm ngoài bốn kênh đó thì hệ chỉ giữ lịch, người phải tự đăng. */
export const sendsViaE4 = (c: WaveChannel) => E4_CHANNELS.includes(c)

export const CHANNELS = Object.keys(CHANNEL_LABEL) as WaveChannel[]

/** Vai của từng người, tra theo tên — dùng ở chuỗi duyệt. Lấy từ `actors`, đây
 *  là chỗ duy nhất biết "Trần Thu Hà" làm gì. */
export const ROLE_OF = new Map(dasVina.actors.map((a) => [a.name, a.role]))

/** Kỳ của kịch bản, đọc từ fixture. Ngày đầu kỳ là mốc 0 của `dayISO`, ngày
 *  cuối là lúc kịch bản đóng băng — không gõ hai con số này ra tay. */
export const PERIOD = `${dm(dayISO(0))} → ${dm(DAS_VINA_FROZEN_AT)}`

/** Ô "Kênh" của bảng chỉ đủ chỗ cho ba hình; dư thì gộp thành "+n" chứ không
 *  đẩy dòng cao lên — dòng bảng cao cố định 44px. */
export const MAX_CHANNEL_TAGS = 3

/** Số nguyên có dấu chấm ngăn nghìn (luật 6). `millions`/`percent` của @pv/ui lo
 *  phần tiền và tỉ lệ; số người nhận không thuộc hai loại đó. */
export const grouped = (n: number) => n.toLocaleString('vi-VN')

/** Kênh nguồn đã dùng, theo thứ tự đợt và không lặp. */
export const channelsOf = (source: SourceRow): WaveChannel[] => [
  ...new Set(source.waves.map((w) => w.channel)),
]

/** Cố tình không làm — ba thứ bị bỏ có chủ ý, kèm lý do.
 *
 *  Khối này ở lại trên màn (không phải trong comment) vì cả ba là câu người xem
 *  hỏi ngay trong buổi demo đầu tiên: "lead đâu", "sao không gửi luôn được",
 *  "sao không có biểu đồ". Trả lời một lần trên màn rẻ hơn trả lời mười lần.
 *
 *  Không dùng `GlassCard`: khối này nằm trong cột phải của hồ sơ nguồn, thêm

/** Bản nháp đang soạn trong form. `waves` dùng đúng `DraftWave` của tầng data —
 *  form không đẻ ra một hình dữ liệu thứ hai cho cùng một thứ.
 *
 *  KHÔNG có `runDays`: chuỗi dài bao nhiêu ngày suy ra từ nhịp các đợt. Giữ nó
 *  thành ô nhập riêng thì gõ 60 trong khi các đợt trải 28 ngày là hai con số
 *  chọi nhau ngay trên một màn, và không ai đọc ô đó nữa. */
export type CampaignDraft = {
  name: string
  kind: SourceKind
  venue: string
  audience: string
  waves: DraftWave[]
}

/** Đợt trống thêm vào cuối chuỗi.
 *
 *  Nhịp chép từ khoảng cách hai đợt cuối của nguồn mẫu — nhưng CHUỖI RỖNG thì
 *  đợt thứ nhất phải là ngày 0, không phải "sau 14 ngày": không có gì để nó đi
 *  sau cả.
 *
 *  Kỳ vọng để 0. Chép `expected` của đợt liền trước thì đợt trống hiện ra một
 *  con số trông y hệt số ai đó đã đặt thật, mà ô này là ô BẮT BUỘC — người soạn
 *  phải tự đặt. */
export function nextWave(waves: DraftWave[]): DraftWave {
  const last = waves[waves.length - 1]
  return {
    label: `Đợt ${waves.length + 1}`,
    channel: 'email',
    afterDays: last ? last.afterDays + DRAFT_STEP_DAYS : 0,
    expected: 0,
    content: '',
  }
}

/** Nguồn đang mở → bản nháp của form sửa; `null` → bản nháp của form tạo mới.
 *
 *  Bản nháp mở đầu của form tạo CHÉP NHỊP nguồn mẫu (`DRAFT_TEMPLATE`, suy từ
 *  fixture): tên gợi ý, số người nhận, nhịp đợt. Đó là điểm xuất phát để sửa,
 *  KHÔNG phải số đo của chiến dịch mới.
 *
 *  Nội dung đợt khi sửa để TRỐNG: kịch bản đóng băng không lưu bài đã soạn, và
 *  dựng lại một bài chưa từng có là bịa. */
export function draftOf(source: SourceRow | null, withEmptyWave: boolean): CampaignDraft {
  const base: CampaignDraft = source
    ? {
        name: source.label,
        kind: source.kind,
        venue: source.venue ?? '',
        audience: String(source.waves[0]?.sent ?? ''),
        waves: source.waves.map((w) => ({
          label: w.label,
          channel: w.channel,
          afterDays: w.day - source.startDay,
          expected: w.expected,
          content: '',
        })),
      }
    : {
        name: '',
        kind: 'chien-dich',
        venue: '',
        audience: String(DRAFT_TEMPLATE.audience),
        waves: DRAFT_TEMPLATE.waves,
      }

  return withEmptyWave ? { ...base, waves: [...base.waves, nextWave(base.waves)] } : base
}

/** Nháp nội dung một đợt, dạng HTML (`RichText` nhận HTML). Cố tình KHÔNG có số
 *  liệu nào: trợ lý mở lời, người soạn viết phần còn lại. */
export const draftHtml = (w: DraftWave) =>
  `<p><b>${w.label}</b> — gửi bằng ${CHANNEL_LABEL[w.channel]}</p><p>Bản nháp chờ người sửa và duyệt — chưa gửi cho ai.</p>`
