import { queryOptions } from '@tanstack/react-query'
import {
  Facebook,
  Globe,
  Linkedin,
  Mail,
  MessageCircle,
  Send,
  Smartphone,
  type LucideIcon,
} from 'lucide-react'
import {
  COMMISSION_SPLIT,
  CREDIT_RULES,
  EXIT_REASONS,
  INIT_DATA_QUESTIONS,
  LEAD_CATEGORIES,
  LEADS,
  PIPELINE_STAGES,
  SOURCES,
  dasVina,
  isRunning,
  type WaveChannel,
} from '@pv/engines/fixtures/das-vina'
import type { ConfigBundle } from '@pv/contracts'
import { api } from '@/app/api'

/** Cấu hình phòng kinh doanh — module 6. Kịch bản 2 · DAS Vina.
 *
 *  Mọi hằng số định hình dữ liệu của phòng gom về đúng một chỗ. Màn khác đọc
 *  chúng qua fixture/engine; màn Cấu hình là nơi DUY NHẤT được sửa.
 *
 *  `usage` là số dòng dữ liệu đang bám vào từng mục. Đây KHÔNG phải số trang
 *  trí: nó là thứ quyết định một thay đổi có phải qua E3 hay không. Bỏ một lý do
 *  đang có 21 lead đứng thì 21 dòng đó mất chỗ đứng — không phải chuyện tự
 *  quyết. Vì thế mục nào cũng phải trả về được con số của mình, kể cả mục chưa
 *  có giá trị nào (5.5), vì "chưa ai đặt ngưỡng" mà lại có 32 lead đang chạy
 *  không hạn mới là thứ người xem cần biết. 32 = 42 lead đang chạy trừ 10 lead
 *  đã lên SQL — bậc SQL đã có hạn cột từ `PIPELINE_STAGES`, chỉ hai bậc đầu là
 *  trống. */

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
 *  `LucideIcon` qua props. Đẩy bảng này vào `@pv/ui` là bắt thư viện biết Zalo
 *  OA tồn tại (luật biên giới package · CLAUDE.md).
 *
 *  Truyền tên icon làm dữ liệu là hợp lệ với luật 11 — chỗ render vẫn phải đi
 *  qua `<Icon icon={...} />`, không ai render thẳng.
 *
 *  Bốn kênh E4 lấy hình của chính công cụ gửi (thư · tin nhắn · Telegram · app
 *  trên máy khách); ba kênh còn lại lấy logo nền tảng, vì chúng là chỗ ĐĂNG chứ
 *  không phải chỗ gửi — khác biệt đó là nợ treo số 2, đừng làm mờ nó đi. */
export const CHANNEL_ICON: Record<WaveChannel, LucideIcon> = {
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

const WAVES = SOURCES.flatMap((s) => s.waves)

/** Object neo của ContextRail — cùng chuỗi với sổ lead, vì cấu hình ở đây là
 *  thứ đang áp lên đúng câu chuyện đó (luật 10). */
export const ANCHOR_CODE = 'OP-0288'

export type SalesConfig = Awaited<ReturnType<typeof fetchSalesConfig>>

async function fetchSalesConfig() {
  return {
    /** 5.1 — ô nào bắt buộc chính là cổng MQL → SQL. */
    questions: INIT_DATA_QUESTIONS.map((q) => ({
      ...q,
      /** Bao nhiêu lead trong sổ đã điền ô này. */
      usage: LEADS.filter((l) => l.filled.includes(q.key)).length,
    })),

    /** 5.2 — cột của sổ cơ hội và hạn từng cột. */
    stages: PIPELINE_STAGES.map((s) => ({
      ...s,
      usage: LEADS.filter((l) => l.stage === s.key).length,
    })),

    /** 5.3 — ngành quyết định lead mới rơi vào tay ai. */
    categories: LEAD_CATEGORIES.map((c) => ({
      ...c,
      usage: LEADS.filter((l) => l.category === c.key).length,
    })),

    /** 5.4 — danh sách ĐÓNG, sáu lý do, không có ô "khác". */
    exitReasons: EXIT_REASONS.map((r) => ({
      ...r,
      usage: LEADS.filter((l) => l.exitReason === r.label).length,
    })),

    /** 5.5 — ngưỡng SLA cho đầu mối và MQL. CHƯA AI ĐẶT.
     *
     *  `null` là câu trả lời đúng, không phải số 0 và không phải một mặc định
     *  "cho có". Điền số ở tầng màn là đặt luật cho cả phòng bằng tay lập trình
     *  viên — đúng thứ mục 5.5 sinh ra để chấm dứt (docs · "Nợ đang treo" · 3). */
    earlyStageSla: null as number | null,
    /** Bao nhiêu lead đang chạy ở hai bậc đó — tức bao nhiêu dòng hiện KHÔNG có
     *  hạn nào áp. Đây là cái giá của việc để trống, nói thẳng ra. */
    earlyStageLeads: LEADS.filter((l) => isRunning(l) && l.tier !== 'sql').length,

    /** 5.6 — hoa hồng chỉ chia khi có đơn ký; công trạng ghi ở mọi lần chạm. */
    commission: COMMISSION_SPLIT,
    /** Số hợp đồng đã ký trong kỳ — tức số đơn tỉ lệ chia này đang áp vào. */
    signedDeals: LEADS.filter((l) => l.contractCode).length,
    credit: CREDIT_RULES.map((r) => ({
      ...r,
      /** Bao nhiêu người trong phòng đang mang vai này. Vai của actor ghi kèm
       *  ngành ("Sale · chip") nên so bằng tiền tố, không so bằng dấu bằng. */
      usage: dasVina.actors.filter((a) => a.role === r.role || a.role.startsWith(`${r.role} ·`))
        .length,
    })),

    /** 5.7 — kênh gửi và mẫu đợt. `hasRoad` false = khai báo được nhưng E4 chưa
     *  gửi thật được; giấu nó đi thì người dùng tưởng đợt đã chạy. */
    channels: ALL_CHANNELS.map((key) => {
      const waves = WAVES.filter((w) => w.channel === key)
      return {
        key,
        label: CHANNEL_LABEL[key],
        hasRoad: E4_CHANNELS.includes(key),
        /** Số mẫu đợt đang gửi bằng kênh này. */
        usage: waves.length,
        /** Lead đổ về từ các đợt đó — kênh nào tắt là mất đường của ngần này lead. */
        leads: waves.reduce((sum, w) => sum + w.leads, 0),
      }
    }),

    /** Nguồn tự nhiên không có đợt nào (`waves: []`) nên không bám vào kênh nào.
     *  Đây là repo có phép cân sổ lead: cột "Lead đã về" của 5.7 cộng lại ÍT HƠN
     *  100 đúng bằng ngần này, và màn phải nói ra chỗ chênh chứ không để người
     *  xem tự cộng rồi ngờ số. */
    naturalSources: (() => {
      const nat = SOURCES.filter((s) => s.kind === 'tu-nhien')
      return { count: nat.length, leads: nat.reduce((sum, s) => sum + s.leads, 0) }
    })(),
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
 *  VÌ SAO ĐỨNG RIÊNG, KHÔNG THAY `salesConfigQuery` Ở TRÊN
 *  ------------------------------------------------------------------
 *  Hai query trả hai thứ khác nhau dù cùng tên "cấu hình". Cái ở trên chở
 *  `usage` — bao nhiêu dòng dữ liệu đang bám vào từng mục — và màn Cấu hình
 *  dựng cả bảng quanh con số đó, vì nó là thứ quyết định một thay đổi có phải
 *  qua E3 hay không. Máy chủ KHÔNG trả `usage`. Đổi query cũ sang gọi mạng là
 *  làm trắng một cột của màn Cấu hình để đổi lấy một bảng nhãn cho màn khác.
 *
 *  Nên đường thật mở ở đây, và màn Cấu hình đứng nguyên trên fixture cho tới
 *  khi máy chủ đếm được `usage`.
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
