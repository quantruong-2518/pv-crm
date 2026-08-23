import { Megaphone } from 'lucide-react'
import {
  DAS_VINA_FROZEN_AT,
  dasVina,
  dayISO,
  type WaveChannel,
} from '@pv/engines/fixtures/das-vina'
import { dm, dmy } from '@/lib/date'
import {
  DRAFT_STEP_DAYS,
  DRAFT_TEMPLATE,
  EMPTY_GROUP,
  dayAfterToday,
  type DraftWave,
  type LeadGroup,
  type SourceRow,
} from '@/data/campaigns'
import { CHANNEL_LABEL, E4_CHANNELS } from '@/data/sales-config'

/** Module 1 · phần KHÔNG phải component — hằng số, nhãn, và phép dựng bản nháp.
 *
 *  Tách khỏi `campaign-parts.tsx` vì `react-refresh/only-export-components`:
 *  một file vừa xuất component vừa xuất hằng số thì hot-reload không biết nên
 *  thay gì, và mọi lần sửa một nhãn sẽ dựng lại cả form đang gõ dở. Ranh giới
 *  ở đây là "có JSX hay không", không phải "thuộc màn nào" — cả ba màn của
 *  module đọc từ file này. */

/** Icon của module. MỘT icon, không phải một bảng tra theo loại.
 *
 *  Tới 23/08 module này chia nguồn làm ba loại (chiến dịch · sự kiện · tự
 *  nhiên) và mỗi loại mang một hình riêng. Cả ba đã bỏ: nguồn tự nhiên ra khỏi
 *  sổ vì không ai chạy đợt nào cho nó, còn "sự kiện" chỉ là một chiến dịch có
 *  thêm địa điểm — nó vẫn có chuỗi đợt, vẫn gửi mail, vẫn đo bằng đúng bảy cột
 *  ấy. Giữ hai nhãn cho một thứ làm cùng một việc là bắt người mới học một
 *  phân biệt không đổi được hành vi nào của họ. */
export const CAMPAIGN_ICON = Megaphone

/** Kênh gửi đọc từ module Cấu hình, KHÔNG khai lại ở đây.
 *
 *  Trước 19/08 màn này giữ bản sao `CHANNEL_LABEL` + `E4_CHANNELS` của riêng
 *  nó, vì E4 mới có `type Channel` — một kiểu, không phải danh sách chạy được.
 *  Bản sao đó phá đúng luật 1 của module Cấu hình ("cấu hình là dữ liệu, không màn nào
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

/** Bản nháp đang soạn trong form — ba câu hỏi của ba bước, không hơn.
 *
 *  `group` thay cho ô "audience" gõ tay cũ. Một con số "1.200 người nhận" gõ
 *  bằng tay không nói được GỬI CHO AI, không kiểm được, và tới lúc chạy thì
 *  không ai dựng lại được danh sách đó. Nhóm là một bộ lọc trên sổ lead nên nó
 *  vừa đọc được thành câu, vừa đếm được ngay lúc soạn.
 *
 *  `stopOnReply` và `stopAtLeads` là hai điều kiện dừng — thuộc bản nháp chứ
 *  không phải state rời của form, vì nút "Nhân bản" phải chép được chúng.
 *
 *  KHÔNG có `runDays`: chuỗi dài bao nhiêu ngày suy ra từ ngày của các đợt. Giữ
 *  nó thành ô nhập riêng thì gõ 60 trong khi các đợt trải 28 ngày là hai con số
 *  chọi nhau ngay trên một màn, và không ai đọc ô đó nữa. */
export type CampaignDraft = {
  name: string
  group: LeadGroup
  waves: DraftWave[]
  /** Khách trả lời rồi thì không nhắc nữa. Bật sẵn — đây là thứ người mới quên
   *  bật và bị khách phàn nàn vì nhắc người đã trả lời. */
  stopOnReply: boolean
  /** Đủ bao nhiêu lead thì dừng cả chuỗi. 0 = không đặt trần. */
  stopAtLeads: number
}

/** Đợt trống thêm vào cuối chuỗi.
 *
 *  Nhịp chép từ khoảng cách hai đợt cuối của nguồn mẫu — nhưng CHUỖI RỖNG thì
 *  đợt thứ nhất là đợt mở màn, và mở màn thì mặc định GỬI NGAY.
 *
 *  Kỳ vọng để 0. Chép `expected` của đợt liền trước thì đợt trống hiện ra một
 *  con số trông y hệt số ai đó đã đặt thật. */
export function nextWave(waves: DraftWave[]): DraftWave {
  const last = waves[waves.length - 1]
  /* Ngày của đợt mới đếm từ ngày của đợt cuối, kể cả khi đợt cuối là "Gửi
     ngay" — lúc đó mốc là hôm nay. Nếu không thì bấm "Thêm đợt" hai lần trên
     một chuỗi gửi ngay sẽ ra hai đợt trùng ngày. */
  const from = last && !last.sendNow ? daysFromToday(last.dateISO) : 0

  return {
    label: `Đợt ${waves.length + 1}`,
    channel: 'email',
    sendNow: waves.length === 0,
    dateISO: dayAfterToday(from + DRAFT_STEP_DAYS),
    time: last?.time ?? '09:00',
    expected: 0,
    content: '',
  }
}

const TODAY_ISO = dayAfterToday(0)

/** `YYYY-MM-DD` → cách hôm nay của kịch bản bao nhiêu ngày. So hai chuỗi đã ghim
 *  `Z` nên không đụng múi giờ của máy người dùng — cùng một bản nháp mở ở Hà Nội
 *  và ở Seoul phải ra đúng một nhịp. */
export function daysFromToday(dateISO: string): number {
  const ms = Date.parse(`${dateISO}T00:00:00Z`) - Date.parse(`${TODAY_ISO}T00:00:00Z`)
  return Number.isNaN(ms) ? 0 : Math.round(ms / 86_400_000)
}

/** Chiến dịch đang mở → bản nháp của form sửa; `null` → bản nháp của form tạo.
 *
 *  Bản nháp mở đầu của form tạo CHÉP NHỊP nguồn mẫu (`DRAFT_TEMPLATE`, suy từ
 *  fixture): tên gợi ý, nhịp đợt. Đó là điểm xuất phát để sửa, KHÔNG phải số đo
 *  của chiến dịch mới.
 *
 *  Ngày của đợt khi SỬA dời về tương lai theo đúng nhịp cũ: chuỗi đã chạy xong
 *  từ tháng trước, nên in lại ngày cũ vào ô hẹn gửi là mời người dùng bấm lưu
 *  một chuỗi hẹn gửi vào quá khứ.
 *
 *  Nội dung đợt khi sửa để TRỐNG: kịch bản đóng băng không lưu bài đã soạn, và
 *  dựng lại một bài chưa từng có là bịa. */
export function draftOf(source: SourceRow | null, withEmptyWave: boolean): CampaignDraft {
  const base: CampaignDraft = source
    ? {
        name: source.label,
        group: EMPTY_GROUP,
        waves: source.waves.map((w) => ({
          label: w.label,
          channel: w.channel,
          sendNow: false,
          dateISO: dayAfterToday(w.day - source.startDay + 1),
          time: '09:00',
          expected: w.expected,
          content: '',
        })),
        stopOnReply: true,
        stopAtLeads: 0,
      }
    : {
        name: '',
        group: EMPTY_GROUP,
        waves: DRAFT_TEMPLATE.waves,
        stopOnReply: true,
        stopAtLeads: 0,
      }

  return withEmptyWave ? { ...base, waves: [...base.waves, nextWave(base.waves)] } : base
}

/** Bản nháp của nút "Nhân bản" — chép mọi thứ TRỪ nhóm người nhận.
 *
 *  Đây là chỗ duy nhất của module cố tình bỏ trống một ô đã có sẵn giá trị.
 *  Nhân bản một chiến dịch mà giữ nguyên danh sách cũ nghĩa là gửi lại đúng
 *  những người vừa nhận — vừa là việc không ai muốn làm, vừa là cách nhanh nhất
 *  để một người mới đốt danh sách của cả phòng. Tên cũng đổi để hai dòng trong
 *  sổ không mang cùng một chữ. */
export function duplicateOf(source: SourceRow): CampaignDraft {
  const base = draftOf(source, false)
  return { ...base, name: `${source.label} — bản sao`, group: EMPTY_GROUP }
}

/** Đợt này gửi lúc nào, viết thành chữ. Dùng ở form, ở thanh tóm tắt và ở chuỗi
 *  đợt trên hồ sơ — ba chỗ phải đọc ra cùng một câu.
 *
 *  "Gửi ngay" KHÔNG có nghĩa là bấm phát đi liền: chiến dịch còn phải được bấm
 *  "Bắt đầu chạy" đã. Chữ trên màn phải nói đủ mệnh đề đó, nếu không người mới
 *  bấm Lưu nháp rồi ngồi đợi mail bay đi. */
export const whenText = (w: DraftWave) =>
  w.sendNow ? 'gửi ngay khi chiến dịch bắt đầu chạy' : `hẹn ${dmy(w.dateISO)} lúc ${w.time}`
