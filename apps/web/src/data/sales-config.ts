import { queryOptions } from '@tanstack/react-query'
import {
  Facebook,
  Globe,
  Linkedin,
  Mail,
  MessageCircle,
  Send,
  Smartphone,
  type IconGlyph,
} from '@pv/ui'
import {
  COMMISSION_SPLIT,
  CREDIT_RULES,
  INIT_DATA_QUESTIONS,
  LEAD_CATEGORIES,
  PIPELINE_STAGES,
  type WaveChannel,
} from '@pv/engines/fixtures/das-vina'
import { ExitReason, type ConfigBundle } from '@pv/contracts'
import { api } from '@/app/api'

/** Cấu hình phòng kinh doanh — module 6. Kịch bản 2 · DAS Vina.
 *
 *  Mọi hằng số định hình dữ liệu của phòng gom về đúng một chỗ. Màn khác đọc
 *  chúng qua fixture/engine; màn Cấu hình là nơi DUY NHẤT được sửa.
 *
 *  `usage` — số dòng đang bám vào từng mục, thứ quyết định một thay đổi có phải
 *  qua E3 hay không — nay đếm bằng SQL trên bảng thật và về theo
 *  `salesCatalogQuery` ở cuối file. Mục nào cũng phải trả lời được câu đó, kể cả
 *  mục chưa có giá trị nào (5.5): "chưa ai đặt ngưỡng" mà lại có ngần ấy lead
 *  đang chạy không hạn mới là thứ người xem cần biết. */

/** Kênh gửi hiển thị bằng tên người đọc được (luật 14). Tên sản phẩm giữ nguyên
 *  tiếng Anh — "Zalo OA" không dịch thành "tài khoản chính thức Zalo".
 *
 *  Bảng này thuộc về mục 5.7, tức thuộc về màn Cấu hình. Module 1 hiện còn giữ
 *  một bản sao cục bộ; theo luật 1 của module này thì bản sao đó phải rút về
 *  đây khi ai đó chạm vào màn Chiến dịch lần sau — vì thế hằng số này export
 *  sẵn, chỗ còn thiếu chỉ là dòng import bên màn Chiến dịch. */
export const CHANNEL_LABEL: Record<WaveChannel, string> = {
  email: 'Email',
  'zalo-oa': 'Zalo OA',
  telegram: 'Telegram',
  'in-app': 'Trong app',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  website: 'Website',
}

/** Icon định danh của từng kênh — nhìn là biết đợt đó gửi đi đâu, không phải
 *  đọc chữ rồi mới biết. Dùng ở MỌI chỗ web nhắc tới kênh, để một kênh chỉ có
 *  đúng một hình.
 *
 *  Bảng nằm ở tầng `data/` của app chứ không ở `@pv/ui`: "kênh nào là kênh gì"
 *  là kiến thức nghiệp vụ của phòng kinh doanh, còn thư viện chỉ biết nhận một
 *  `IconGlyph` qua props. Đẩy bảng này vào `@pv/ui` là bắt thư viện biết Zalo
 *  OA tồn tại (luật biên giới package · CLAUDE.md).
 *
 *  Truyền tên icon làm dữ liệu là hợp lệ với luật 11 — chỗ render vẫn phải đi
 *  qua `<Icon icon={...} />`, không ai render thẳng.
 *
 *  Bốn kênh E4 lấy hình của chính công cụ gửi (thư · tin nhắn · Telegram · app
 *  trên máy khách); ba kênh còn lại lấy logo nền tảng, vì chúng là chỗ ĐĂNG chứ
 *  không phải chỗ gửi — khác biệt đó là nợ treo số 2, đừng làm mờ nó đi. */
export const CHANNEL_ICON: Record<WaveChannel, IconGlyph> = {
  email: Mail,
  'zalo-oa': MessageCircle,
  telegram: Send,
  'in-app': Smartphone,
  linkedin: Linkedin,
  facebook: Facebook,
  website: Globe,
}

/** Bốn kênh E4 đã có đường thật. Ba kênh còn lại khai báo được nhưng chưa gửi
 *  được — nợ treo số 2 của docs, không lấp bằng cách giấu chúng đi. */
export const E4_CHANNELS: WaveChannel[] = ['email', 'zalo-oa', 'telegram', 'in-app']

/** Kênh GỬI TỚI MỘT ĐỊA CHỈ — nơi duy nhất "mail hỏng" có nghĩa.
 *
 *  Khác `E4_CHANNELS` ở một chỗ và chỗ đó quan trọng: `in-app` hệ gửi được
 *  nhưng nó không có địa chỉ nào để dội, còn ba kênh đăng bài thì vừa không gửi
 *  được vừa không dội được. Tách hai danh sách vì chúng trả lời hai câu khác
 *  nhau — "hệ có gửi hộ được không" và "gửi hỏng thì có đo được không". */
export const ADDRESSED_CHANNELS: WaveChannel[] = ['email', 'zalo-oa', 'telegram']

const ALL_CHANNELS = Object.keys(CHANNEL_LABEL) as WaveChannel[]

/** Object neo của ContextRail — cùng chuỗi với sổ lead, vì cấu hình ở đây là
 *  thứ đang áp lên đúng câu chuyện đó (luật 10). */
export const ANCHOR_CODE = 'OP-0288'

export type SalesConfig = Awaited<ReturnType<typeof fetchSalesConfig>>

/** MỌI PHÉP ĐẾM RỜI KHỎI ĐÂY 31/08 — chúng nay là `usage` của `salesCatalogQuery`.
 *
 *  Trước lượt này hàm ở đây đếm trên `LEADS`, sổ fixture đóng băng 100 dòng,
 *  trong khi Sổ lead ngay bên cạnh đếm trên Neon 121. Hai con số về cùng một
 *  phòng, lệch nhau, và không có gì trên màn nói cho người xem biết vì sao —
 *  đúng thứ nguy hơn cả một màn giả hẳn, vì giả nằm lẫn trong thật.
 *
 *  Thứ CÒN LẠI ở đây là LUẬT, không phải số: câu hỏi hồ sơ nào bắt buộc, chia
 *  hoa hồng thế nào, phòng có những kênh gửi nào. Chúng vẫn `load:` fixture vì
 *  `config_entry` chưa chở được chúng — bốn khối, đã ghi từng khối bên dưới. */
async function fetchSalesConfig() {
  return {
    /** 5.1 — ô nào bắt buộc chính là cổng MQL → SQL. LUẬT, không phải số: số ô
     *  đã điền nay ở `usage.slots`, khoá là `q.no`. */
    questions: INIT_DATA_QUESTIONS,

    /** 5.2 · 5.3 — cột của sổ cơ hội và ngành. Hai danh mục này `config_entry`
     *  ĐÃ giữ (`STAGE` có `limitDays`, `CATEGORY` có `ownerId`), nhưng nhãn ở
     *  đây còn kèm hai thứ máy chủ chưa trả nguyên hình: `key` chữ thường mà
     *  `sales.lead` đang chứa (nợ §6) và TÊN Sale phụ trách, thứ `ownerId` phải
     *  tra qua sổ nhân sự mới ra. Số đếm thì không còn ở đây — màn đọc
     *  `usage.STAGE[s.key]` và `usage.CATEGORY[c.key]`, khoá nối đúng bằng
     *  `key` này. */
    stages: PIPELINE_STAGES,
    categories: LEAD_CATEGORIES,

    /** 5.5 — ngưỡng SLA cho đầu mối và MQL. CHƯA AI ĐẶT.
     *
     *  `null` là câu trả lời đúng, không phải số 0 và không phải một mặc định
     *  "cho có". Điền số ở tầng màn là đặt luật cho cả phòng bằng tay lập trình
     *  viên — đúng thứ mục 5.5 sinh ra để chấm dứt (docs · "Nợ đang treo" · 3). */
    earlyStageSla: null as number | null,

    /** 5.6 — hoa hồng chỉ chia khi có đơn ký; công trạng ghi ở mọi lần chạm.
     *  Cả hai là tỉ lệ và luật ghi công, không phải dòng dữ liệu — số người mang
     *  từng vai nay ở `usage.roles`. */
    commission: COMMISSION_SPLIT,
    credit: CREDIT_RULES,

    /** 5.7 — kênh gửi. `hasRoad` false = khai báo được nhưng E4 chưa gửi thật
     *  được; giấu nó đi thì người dùng tưởng đợt đã chạy.
     *
     *  HAI CỘT SỐ CỦA MỤC NÀY ĐÃ GỠ 31/08, và không thay bằng gì. Chúng đếm đợt
     *  và lead theo kênh trên `SOURCES` của fixture, mà cơ sở dữ liệu KHÔNG có
     *  cột nào ghi kênh gửi — mọi đợt thật đi đường email và không dòng nào nói
     *  ra điều đó. Để nguyên là in số fixture cạnh năm mục vừa cắt sang Neon,
     *  tức đúng thứ nguy hơn cả một màn giả hẳn. Cột quay lại ngày `mail_run`
     *  hoặc `campaign_run` chở kênh; tới lúc đó bảng vẫn trả lời được câu hỏi
     *  thật của nó — phòng có kênh nào, kênh nào E4 gửi được. */
    channels: ALL_CHANNELS.map((key) => ({
      key,
      label: CHANNEL_LABEL[key],
      hasRoad: E4_CHANNELS.includes(key),
    })),
  }
}

export const salesConfigQuery = queryOptions({
  queryKey: ['sales', 'config'] as const,
  queryFn: () =>
    api.read('/sales/config', {
      need: { branch: 'Sales', permission: 'cấu-hình.xem' },
      load: fetchSalesConfig,
    }),
})

// ---------------------------------------------------------------------------
// Danh mục THẬT — sáu bảng từ `GET /sales/config`
// ---------------------------------------------------------------------------

/** Sáu danh mục như máy chủ đang giữ chúng: `{ id, name, ord, active }` cộng
 *  ba thuộc tính riêng (`limitDays` · `ownerId` · `kind`).
 *
 *  ------------------------------------------------------------------
 *  TỪ 31/08 NÓ CHỞ CẢ `usage` — VÀ ĐÓ LÀ THỨ CẮT MÀN CẤU HÌNH
 *  ------------------------------------------------------------------
 *  Docblock cũ ở đây viết "máy chủ KHÔNG trả `usage`", nên `salesConfigQuery`
 *  bên trên phải đếm lấy trên sổ fixture 100 dòng trong khi Sổ lead đếm trên
 *  Neon 121 — hai con số về cùng một phòng, lệch nhau, trên hai màn cạnh nhau.
 *  `GET /sales/config` nay trả `usage` đếm bằng SQL trên bảng thật
 *  (`config.repository.ts#usage`), nên mọi phép đếm của màn Cấu hình đi qua
 *  ĐÂY. Luật đặt khoá của bảng đếm nằm ở `ConfigUsage` (`@pv/contracts`) —
 *  quan trọng khi nối, vì bốn danh mục còn khoá theo chuỗi cũ chứ chưa theo
 *  `id` cấu hình (nợ §6).
 *
 *  `salesConfigQuery` vẫn đứng riêng và vẫn `load:` fixture, nhưng nay nó chỉ
 *  còn chở LUẬT — danh sách câu hỏi hồ sơ, tỉ lệ chia hoa hồng, bảng kênh gửi —
 *  không còn một con số đếm nào.
 *
 *  Cache dài là mặc định của cả app (`staleTime: Infinity` ở
 *  `app/query-client.ts`) và ở đây nó đúng theo nghĩa mạnh nhất: danh mục chỉ
 *  đổi khi có người duyệt một đề nghị qua E3, tức là một biến cố có người
 *  bấm nút — không phải thứ trôi sau lưng người dùng. */
export const salesCatalogQuery = queryOptions({
  queryKey: ['sales', 'config', 'catalog'] as const,
  queryFn: ({ signal }) =>
    api.read<ConfigBundle>('/sales/config', {
      need: { branch: 'Sales', permission: 'cấu-hình.xem' },
      signal,
    }),
})

/** MỤC 5.4 · LÝ DO RA KHỎI LUỒNG — dựng KHÔNG dùng một chữ nào của fixture.
 *
 *  ------------------------------------------------------------------
 *  MỘT LÝ DO, HAI VỰNG, VÀ CHÚNG KHÔNG NỐI ĐƯỢC BẰNG KHOÁ
 *  ------------------------------------------------------------------
 *  `sales.lead.exit_reason` chứa KHOÁ ('khong-goi-duoc'); `config_entry.name`
 *  chứa NHÃN ('Không gọi được ai'). Không cột nào chở cả hai, nên không có phép
 *  nối bằng khoá — đó là nợ `docs/fix-later.md` §6 nhìn từ đúng chỗ nó đau.
 *
 *  Phép nối duy nhất đang đúng là THỨ TỰ, và nó đúng vì có người đặt cho nó
 *  đúng chứ không phải tình cờ: `seed.ts` sinh sáu dòng `EX-01…EX-06` theo đúng
 *  thứ tự mảng, `ord` bắt đầu từ 1, và `ExitReason.options` giữ nguyên thứ tự
 *  ấy. Nối theo vị trí là thứ dễ hỏng lặng lẽ nhất trong repo này, nên nó nằm
 *  đúng MỘT chỗ — ở đây — có rào và có đường xoá:
 *
 *   · rào: số lượng lệch thì bỏ hẳn nhãn của máy chủ và in khoá ra. Một màn in
 *     'khong-goi-duoc' là một màn xấu mà ĐÚNG; một màn ghép nhầm nhãn với số là
 *     một màn đẹp mà nói dối, và không ai phát hiện ra.
 *   · đường xoá: ngày `sales.lead.exit_reason` chở `id` cấu hình, hàm này rút
 *     còn một vòng `map` trên `catalog.EXIT_REASON`. */
export function exitReasonRows(catalog: ConfigBundle | undefined) {
  const rows = catalog?.EXIT_REASON ?? []
  const aligned = rows.length === ExitReason.options.length

  return ExitReason.options.map((key, i) => ({
    key,
    label: aligned ? (rows[i]?.name ?? key) : key,
    usage: catalog?.usage.EXIT_REASON[key] ?? 0,
  }))
}

/** Nguồn TỰ NHIÊN — khách tự tìm tới, không đợt nào chạy cho họ.
 *
 *  Đây là phép cân sổ lead của mục 5.7: cột "Lead đã về" cộng lại ÍT HƠN tổng
 *  sổ đúng bằng ngần này, và màn phải nói ra chỗ chênh chứ không để người xem
 *  tự cộng rồi ngờ số. Cả hai vế đọc từ máy chủ — `kind` là cột thật của
 *  `config_entry`, số lead là `usage.SOURCE` khoá theo `id`, quan hệ DUY NHẤT
 *  trong sáu danh mục đã có khoá ngoại thật. */
export function naturalSources(catalog: ConfigBundle | undefined) {
  const nat = (catalog?.SOURCE ?? []).filter((s) => s.kind === 'tu-nhien')
  return {
    count: nat.length,
    leads: nat.reduce((sum, s) => sum + (catalog?.usage.SOURCE[s.id] ?? 0), 0),
  }
}
