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
  KPI_LAYERS,
  LEAD_CATEGORIES,
  LEADS,
  PIPELINE_STAGES,
  PROSPECT_BATCHES,
  ROLE_KPI_MODEL,
  SOURCES,
  dasVina,
  isRunning,
  prospectStats,
  prospectTotals,
  type ProspectLegalBasis,
  type ProspectSupplierKind,
  type WaveChannel,
} from '@pv/engines/fixtures/das-vina'
/** Một con số một cách nói: `planMeasureText` là chỗ DUY NHẤT đổi số của một
 *  thước thành chữ theo đơn vị của nó. Chép lại phép đổi ở đây là hai bản, và
 *  chúng lệch nhau ngay lần sửa đầu tiên — module 4 in "12,0 tr" còn module 5 in
 *  "12 triệu" cho đúng một chỉ tiêu. */
import { planMeasureText } from './plan'
/** Bốn ngưỡng của quyết định F và ba bảng nhãn của luồng nhập nằm ở
 *  `data/prospects.ts` — mục 5.8 ĐỌC chúng, không khai lại. Khai lại là hai bản
 *  của cùng một con số, và không ca test nào buộc chúng bằng nhau. */
import {
  DEDUPE_KEYS,
  IMPORT_GATE,
  LEGAL_BASIS_LABEL,
  REJECT_RULES,
  costNeedsApproval,
} from './prospects'

/** Cấu hình phòng kinh doanh — module 5. Kịch bản 2 · DAS Vina.
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

const ALL_CHANNELS = Object.keys(CHANNEL_LABEL) as WaveChannel[]

const WAVES = SOURCES.flatMap((s) => s.waves)

/** Object neo của ContextRail — cùng chuỗi với sổ lead, vì cấu hình ở đây là
 *  thứ đang áp lên đúng câu chuyện đó (luật 10). */
export const ANCHOR_CODE = 'OP-0288'

/** 5.8.2 — ba khoá khử trùng, ĐÚNG THỨ TỰ chạy: dừng ở khoá đầu tiên bắt được.
 *  Đổi thứ tự này là hành động qua E3 (§5.5), không phải một `sort` tự do.
 *
 *  Nhãn, độ tin và điều kiện khớp đọc từ `DEDUPE_KEYS` ở `data/prospects.ts`,
 *  KHÔNG chép lại: màn Cấu hình và màn Soát phải gọi cùng một khoá bằng cùng một
 *  câu chữ, còn `order` là thứ chỉ mục 5.8 mới cần nên nó sinh ở đây.
 *
 *  MỘT bảng, HAI trường nhìn — `label` là nhãn ngắn cho bảng soát của luồng
 *  nhập, `why` là điều kiện khớp đầy đủ cho màn Cấu hình. Hai trường trong cùng
 *  một bảng, không phải hai bảng: hai bảng là hai bộ chữ, và chúng lệch nhau
 *  ngay ở lần sửa đầu tiên. */
const DEDUP_KEYS = DEDUPE_KEYS.map((k, i) => ({ ...k, order: i + 1 }))

/** 5.8.3 — bảy luật chặn dòng, danh sách ĐÓNG (không có ô "khác", cùng luật với
 *  `EXIT_REASONS`). Danh sách và nhãn đọc từ `REJECT_RULES` ở `data/prospects.ts`
 *  — đó là bảng mà chính luồng nhập chạy, nên hai màn không thể nói hai câu chữ
 *  cho cùng một lý do. Ở đây chỉ đổi tên `canDisable` thành `toggleable` cho
 *  đúng giọng của bảng cấu hình.
 *
 *  MỘT bảng, HAI trường nhìn — `label` là nhãn ngắn dùng ở bảng soát, `why` là
 *  điều kiện đầy đủ dùng ở màn Cấu hình. Vì `why` lên được thành một CỘT của
 *  bảng nên màn không phải kể lại ba luật cứng bằng một đoạn văn xuôi bên dưới:
 *  lý do đứng ngay cạnh luật nó giải thích.
 *
 *  Ba luật đầu KHÔNG tắt được — chúng bảo vệ khỏi việc "một dòng không phải một
 *  dòng", lời hứa với người đã từ chối, và cổng Nghị định 13. Bốn luật sau tắt
 *  được: lô đường B (BD gọi tay) đôi khi chỉ cần tên và tỉnh. */
const BLOCK_RULES = REJECT_RULES.map((r) => ({
  reason: r.reason,
  label: r.label,
  toggleable: r.canDisable,
  why: r.why,
}))

/** 5.8.4 — ba căn cứ liên hệ hợp lệ (Nghị định 13/2023/NĐ-CP), danh sách ĐÓNG. */
const LEGAL_BASIS_CATALOG = (Object.keys(LEGAL_BASIS_LABEL) as ProspectLegalBasis[]).map(
  (value) => ({ value, label: LEGAL_BASIS_LABEL[value] }),
)

/** 5.8.1 — nhà cung cấp gom theo TÊN (duy nhất, trùng tên chặn ở bước chọn
 *  nguồn). Kỳ này 8/8 lô là 8 nhà khác nhau, nhưng gom bằng Map để không vỡ khi
 *  một nhà cung cấp bán nhiều lô. */
const supplierByName = new Map<
  string,
  {
    kind: ProspectSupplierKind
    legalBasisDefault: ProspectLegalBasis
    retentionDaysDefault: number
    batches: number
    rows: number
    leads: number
  }
>()
for (const b of PROSPECT_BATCHES) {
  const stats = prospectStats(b.code)
  const cur = supplierByName.get(b.supplier)
  if (cur) {
    cur.batches += 1
    cur.rows += stats.rowsValid
    cur.leads += stats.leads
  } else {
    supplierByName.set(b.supplier, {
      kind: b.supplierKind,
      legalBasisDefault: b.legalBasis,
      retentionDaysDefault: b.retentionDays,
      batches: 1,
      rows: stats.rowsValid,
      leads: stats.leads,
    })
  }
}

/** 5.6 — ba phần của hoa hồng MỘT ĐƠN ĐÃ KÝ, tính bằng phần trăm. Nhãn dựng ở
 *  đây chứ không trong JSX: "phần nào của hoa hồng thuộc về vai nào" là nghiệp
 *  vụ của phòng, và mảng nằm trong JSX thì không test nào chạm tới được.
 *
 *  Đây là phần trăm chia nhau MỘT khoản hoa hồng, KHÔNG phải tiền — mọi nhãn
 *  tiền phải khai phạm vi, và cách khai phạm vi ở đây là nói ra mẫu số. */
const COMMISSION_PARTS = [
  { key: 'mo-cua', label: 'Mở cửa · BD', value: COMMISSION_SPLIT.moCua },
  { key: 'chot', label: 'Chốt · Sale ký', value: COMMISSION_SPLIT.chot },
  { key: 'di-cung-demo', label: 'Đi cùng demo · Presales', value: COMMISSION_SPLIT.diCungDemo },
] as const

/** Số người đang mang một vai. Vai của actor ghi kèm ngành ("Sale · chip") nên
 *  so bằng tiền tố, không so bằng dấu bằng. Một hàm cho cả bảng công trạng
 *  (5.6.1) lẫn bảng chỉ tiêu (5.6.2): hai phép đếm chép tay là hai cơ hội để
 *  cùng một vai có hai số người trên cùng một thẻ. */
const ownersOfRole = (role: string) =>
  dasVina.actors.filter((a) => a.role === role || a.role.startsWith(`${role} ·`)).length

/** 5.6.2 — chỉ tiêu MỘT NGƯỜI MỘT THÁNG, đọc thẳng từ `ROLE_KPI_MODEL`.
 *
 *  Ba chỗ trong repo đã khai module 5 là nhà của chỉ tiêu — docblock ngay trên
 *  `ROLE_KPI_MODEL` ở fixture, `data/performance.ts`, `data/plan.ts` — mà màn
 *  Cấu hình thì chưa hiện nó lần nào. Bảng này là chỗ con số CÓ MẶT, không phải
 *  chỗ nó sinh ra: mọi giá trị đọc từ fixture, màn không khai lại số nào.
 *
 *  MỘT ĐỊNH NGHĨA, BA PHẠM VI CÓ TÊN — cùng một chỉ tiêu, ba mẫu số khác nhau:
 *   · module 5 (đây) · một NGƯỜI trong một THÁNG;
 *   · module 3       · nhân với số tháng của kỳ xem;
 *   · module 4       · nhân thêm số người mang vai, ra mức PHÒNG.
 *  Nhãn nào bỏ vế phạm vi thì ba màn thành ba con số cãi nhau.
 *
 *  `monthlyTarget === null` là thước QUAN SÁT — không chấm đạt/trượt. KHÔNG in
 *  số 0 (0 là "đã đo, bằng không") và KHÔNG in "—" (dấu đó đang mang nghĩa
 *  "không áp dụng cho loại này" ở bảng khác trong cùng màn). */
export type RoleTargetRow = {
  key: string
  role: string
  /** Tên thước, chép đúng chữ của `ROLE_KPI_MODEL`. */
  metric: string
  /** Nhãn lớp KPI — hoạt động · chuyển đổi · chất lượng. */
  layer: string
  /** Chỉ tiêu một người một tháng, đã thành chữ theo đơn vị của thước.
   *  `null` = thước quan sát, màn phải nói ra bằng chữ chứ không bằng số. */
  targetText: string | null
  /** Người đang mang vai — thừa số module 4 nhân thêm để ra mức phòng. */
  owners: number
}

/** Cổng MQL → SQL của MỘT bản nháp: đếm ô đang bắt buộc sau khi lật `flipped`.
 *
 *  Hàm thuần, nằm ở tầng data chứ không trong thân component, vì màn phải vẽ
 *  được hai con số cùng lúc — cổng ĐANG là bao nhiêu và cổng SẼ thành bao nhiêu
 *  nếu người gật gật. Hai lần đếm bằng hai đoạn `filter` chép tay trong JSX là
 *  hai cơ hội lệch. */
export function requiredCount(
  questions: readonly { key: string; required: boolean }[],
  flipped: readonly string[],
): number {
  return questions.filter((q) => q.required !== flipped.includes(q.key)).length
}

export type SalesConfig = Awaited<ReturnType<typeof fetchSalesConfig>>

export async function fetchSalesConfig() {
  return {
    /** Mẫu số của gần hết các cột "đang bám vào": sổ lead của kỳ dữ liệu. Màn
     *  phải nói ra con số này chứ không để người xem đoán 90 ô đã điền là trên
     *  bao nhiêu dòng. */
    leadsTotal: LEADS.length,

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
    commissionParts: COMMISSION_PARTS,
    /** Ba phần cộng lại — phép cộng của màn, làm ở đây để màn khỏi cộng trong
     *  JSX. Bằng 100 là điều kiện đúng của một bảng chia. */
    commissionTotal: COMMISSION_PARTS.reduce((sum, p) => sum + p.value, 0),
    /** Số hợp đồng đã ký trong kỳ — tức số đơn tỉ lệ chia này đang áp vào. */
    signedDeals: LEADS.filter((l) => l.contractCode).length,
    credit: CREDIT_RULES.map((r) => ({
      ...r,
      /** Bao nhiêu người trong phòng đang mang vai này. */
      usage: ownersOfRole(r.role),
    })),

    /** 5.6.2 — chỉ tiêu một người một tháng. Xem docblock của `RoleTargetRow`:
     *  đây là chỗ con số CÓ MẶT, `ROLE_KPI_MODEL` mới là chỗ nó sống. */
    roleTargets: ROLE_KPI_MODEL.flatMap<RoleTargetRow>((r) =>
      r.kpis.map((k) => ({
        key: `${r.role}·${k.key}`,
        role: r.role,
        metric: k.label,
        layer: KPI_LAYERS.find((l) => l.key === k.layer)?.label ?? k.layer,
        targetText: k.monthlyTarget === null ? null : planMeasureText(k.unit, k.monthlyTarget),
        owners: ownersOfRole(r.role),
      })),
    ),

    /** Vai KHÔNG có thước nào. Vắng mặt im lặng trong một bảng chỉ tiêu đọc ra
     *  "quên mất vai này", nên màn phải gọi tên họ. */
    rolesWithoutTarget: ROLE_KPI_MODEL.filter((r) => r.kpis.length === 0).map((r) => r.role),

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

    /** Bao nhiêu kênh đã có đường gửi thật. Đếm ở đây chứ không `filter` trong
     *  JSX: hàng số đầu màn và bảng 5.7 phải nói cùng một con số. */
    channelsWithRoad: ALL_CHANNELS.filter((k) => E4_CHANNELS.includes(k)).length,

    /** Nguồn tự nhiên không có đợt nào (`waves: []`) nên không bám vào kênh nào.
     *  Đây là repo có phép cân sổ lead: cột "Lead đã về" của 5.7 cộng lại ÍT HƠN
     *  100 đúng bằng ngần này, và màn phải nói ra chỗ chênh chứ không để người
     *  xem tự cộng rồi ngờ số. */
    naturalSources: (() => {
      const nat = SOURCES.filter((s) => s.kind === 'tu-nhien')
      return { count: nat.length, leads: nat.reduce((sum, s) => sum + s.leads, 0) }
    })(),

    /** 5.8 — cấu hình lô prospect (module 1 · nạp danh sách). Cấu hình ở đây là
     *  DỮ LIỆU, không phải code: đổi một ô là ghi vết E2, và ba việc — đổi thứ tự
     *  khoá khử trùng, tắt một luật chặn đang loại dòng thật, gỡ một dòng khỏi
     *  danh mục chặn — phải qua E3 (Trần Thu Hà), không nằm trong luồng nhập lô
     *  (§5.5). `usage: null` ở 5.8.2/5.8.3 nghĩa là "chưa tách được theo từng
     *  khoá/luật", không phải 0 — kịch bản đóng băng không chép `ProspectRow`
     *  nên chỉ có TỔNG chung của cả kho, không có bản ghi ai bị bắt vì khoá nào. */
    prospect: {
      /** 5.8.1 — danh mục nhà cung cấp, danh sách MỞ (khác `EXIT_REASONS`).
       *  `usage` là số lô · số dòng hợp lệ · số lead đã sinh đang bám vào nhà
       *  cung cấp này — xoá một nhà đang có lô đã sinh lead phải qua E3. */
      suppliers: Array.from(supplierByName, ([name, v]) => ({
        name,
        kind: v.kind,
        legalBasisDefault: v.legalBasisDefault,
        retentionDaysDefault: v.retentionDaysDefault,
        usage: { batches: v.batches, rows: v.rows, leads: v.leads },
      })),

      /** Tổng của cả kho, lấy thẳng từ `prospectTotals()` — chỗ DUY NHẤT cộng
       *  tám lô lại. Màn không được tự `reduce` trên `suppliers`: hai chỗ cộng
       *  là hai cơ hội lệch, và hôm nay hai kết quả trùng nhau chỉ vì `usage.rows`
       *  tình cờ cũng cộng từ `rowsValid`. */
      batchesTotal: prospectTotals().batches,
      validRowsTotal: prospectTotals().rowsValid,

      /** PHÉP CÂN SỔ LEAD của mục 5.8.1. Cột "Lead cả kỳ" của bảng nhà cung cấp
       *  cộng lại ra `leadsWithBatch`, KHÔNG ra 100 — phần còn lại là lead về từ
       *  các đợt gửi và nguồn tự nhiên, không lô nào đứng sau. Hai số đọc thẳng
       *  từ `prospectTotals()` (das-vina.ts · phép cân 61 + 17 + 22 = 100) để
       *  màn khỏi tự cộng tám lô lần nữa. */
      leadsWithBatch: prospectTotals().leadsWithBatch,
      leadsNoBatch: prospectTotals().leadsNoBatch,

      /** 5.8.2 — ba khoá khử trùng, giữ đúng thứ tự chạy. */
      dedupKeys: DEDUP_KEYS.map((k) => ({ ...k, usage: null as number | null })),
      /** Tổng dòng bị bắt trùng toàn kho (§7.1) — không tách được theo khoá. */
      dedupRowsTotal: prospectTotals().rowsDuplicate,

      /** 5.8.3 — bảy luật chặn dòng, danh sách ĐÓNG. */
      blockRules: BLOCK_RULES.map((r) => ({ ...r, usage: null as number | null })),
      /** Tổng dòng bị loại toàn kho (§7.1) — không tách được theo luật. */
      blockRowsTotal: prospectTotals().rowsRejected,

      /** 5.8.4 (§5.6) — hạn lưu mặc định + căn cứ pháp lý mặc định của lô mới.
       *  `retentionDaysDefaultUsage` là số lô đang giữ đúng mặc định 365 —
       *  quyết định F · 20/08. */
      retentionDaysDefault: IMPORT_GATE.retentionDays,
      retentionDaysDefaultUsage: PROSPECT_BATCHES.filter(
        (b) => b.retentionDays === IMPORT_GATE.retentionDays,
      ).length,
      legalBasis: LEGAL_BASIS_CATALOG.map((l) => ({
        ...l,
        usage: PROSPECT_BATCHES.filter((b) => b.legalBasis === l.value).length,
      })),

      /** 5.8.5 — danh mục chặn (opt-out). Thắng mọi luật khác, kể cả lô/nhà cung
       *  cấp/căn cứ mới. RỖNG THẬT ở kỳ này — chưa ai bị từ chối trong 01/05 →
       *  17/08 — không phải "chưa đo được"; gỡ một dòng khỏi đây phải qua E3. */
      blocklist: { entries: [] as { contact: string; note: string }[], usage: 0 },

      /** 5.8.6 — ngưỡng cảnh báo tỉ lệ loại. `usage` là số lô ĐANG chạm ngưỡng
       *  kỳ này — lô tệ nhất (DS-0103) đang ở 18,6%, dưới ngưỡng, nên 0 là câu
       *  trả lời thật, không phải chỗ trống. */
      rejectRateWarnAt: IMPORT_GATE.rejectRateWarn,
      rejectRateWarnUsage: PROSPECT_BATCHES.filter(
        (b) => (prospectStats(b.code).rejectRate ?? 0) >= IMPORT_GATE.rejectRateWarn,
      ).length,

      /** 5.8.7 — giới hạn file lúc nhập, POC. `usage` là số lô của kỳ này có
       *  `rowsRaw` chạm hoặc vượt giới hạn dòng — lô lớn nhất (DS-0104) có
       *  1.700 dòng, dưới 5.000. */
      fileLimits: {
        maxSizeMb: IMPORT_GATE.maxBytes / 1024 / 1024,
        maxRows: IMPORT_GATE.maxRows,
        maxCols: IMPORT_GATE.maxColumns,
        usage: PROSPECT_BATCHES.filter((b) => b.rowsRaw >= IMPORT_GATE.maxRows).length,
      },

      /** 5.8.8 — ngưỡng chi phí lô phải qua E3 (§5.5, quyết định F). `usage` là
       *  số lô kỳ này CHẠM ngưỡng — lô đắt nhất (DS-0104) là 12 triệu, dưới 20
       *  triệu, nên nhánh `cho-duyet` vì tiền không có ca demo nào ở kỳ này. */
      e3CostThreshold: IMPORT_GATE.approvalCost,
      e3CostThresholdUsage: PROSPECT_BATCHES.filter((b) => costNeedsApproval(b.cost)).length,
    },
  }
}

export const salesConfigQuery = queryOptions({
  queryKey: ['sales', 'config'] as const,
  queryFn: fetchSalesConfig,
})
