import { useRef, useState } from 'react'
import {
  Activity,
  ArrowRight,
  CalendarRange,
  FileCheck,
  Filter,
  TriangleAlert,
  UserMinus,
  Users,
  Wallet,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AiAction,
  AppShell,
  Avatar,
  Badge,
  BarChart,
  billions,
  Button,
  ContextRail,
  CostBand,
  DataTable,
  Drawer,
  EmptyState,
  GlassCard,
  Icon,
  Input,
  InsetPanel,
  Kicker,
  LoadingBlock,
  MetaPill,
  millions,
  Money,
  PageHeader,
  percent,
  Progress,
  RadialGauge,
  SectionTitle,
  SegmentedControl,
  Separator,
  StatCard,
  TableSkeleton,
  cn,
  type BarDatum,
} from '@pv/ui'
import {
  DAS_VINA_FROZEN_AT,
  HEAD_OF_SALES,
  LEAD_TIERS,
  SLA_WATCH_MARGIN as SLA_MARGIN,
} from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { dm } from '@/lib/date'
import {
  BD_NAME,
  BOOK_TOTAL,
  LAYERS,
  PERFORMANCE_RAIL,
  performanceQuery,
  type KpiReading,
  type PaceRow,
  type Performance,
  type PersonCard,
  type Verdict,
} from '@/data/performance'
import {
  DATA_WINDOW,
  DEFAULT_CHOICE,
  MONTHS,
  QUARTERS,
  YEARS,
  vn,
  type Grain,
  type PeriodChoice,
} from '@/data/period'

/** Module 3 · Performance (docs/kien-truc-san-pham.md · "Năm module Pebble Sales").
 *
 *  Màn trả đúng một câu: **ai đang làm được, ai đang tắc — trong kỳ nào**.
 *
 *  --------------------------------------------------------------------------
 *  BA QUYẾT ĐỊNH LÀM NÊN HÌNH DẠNG MÀN NÀY (đổi ngày 19/08)
 *  --------------------------------------------------------------------------
 *  1. **Có trục thời gian.** Bản trước cấm, vì tưởng fixture chỉ là một lát cắt.
 *     Nhưng mỗi dòng sổ lead đã mang sẵn ngày của từng mốc đời nó, nên cắt theo
 *     tháng/quý/năm là ĐỌC LẠI ngày đã có. Lý do đầy đủ ở `data/period.ts`.
 *     Cả màn treo vào một bộ chọn kỳ duy nhất ở đầu màn — đổi kỳ thì mọi con số
 *     dưới nó đổi theo, không có khối nào sống ở một kỳ riêng.
 *
 *  2. **Danh sách trước, chi tiết sau.** Bản trước trải bảy thẻ chi tiết của bảy
 *     người ra thẳng màn: hai cột, thẻ cao thấp khác nhau, mỗi thẻ một mảng
 *     trắng chết, và muốn so hai người thì phải cuộn qua ba màn hình. Giờ người
 *     là MỘT BẢNG — so được bằng mắt theo cột — bấm một dòng mới mở drawer chi
 *     tiết. Bảng ở nguyên chỗ nên không mất mạch so sánh.
 *
 *  3. **Chi tiết có tâm.** Drawer không phải danh sách số dàn hàng ngang: giữa
 *     là đồng hồ KPI chính của vai, quanh nó là mục tiêu · đã đạt · còn thiếu ·
 *     còn mấy ngày, rồi mới tới ba lớp thước và bảng bằng chứng. Cùng một vai
 *     thì cùng một bộ thước — KPI của BD giống nhau, của Sale giống nhau.
 *
 *  4. **Phễu vẽ ĐÚNG MỘT LẦN.** Tới 20/08 màn vẽ phễu ở hai chỗ — ô hero của
 *     khối thước, và một bản y hệt trong drawer của vai không chấm cá nhân —
 *     cùng đọc `data.funnel`, cùng `orientation="bar"`, cùng nhãn "của bậc
 *     trên". Hai bản cùng số là hai chỗ để lệch nhau. Drawer giờ chỉ DẪN sang
 *     phễu ở đầu màn, và dẫn bằng CHỮ chứ không bằng nút: drawer không cuộn
 *     được lên đầu màn, nút ở đó sẽ hứa một chỗ nó không đưa tới.
 *
 *  5. **Màn có lối đi tiếp** (21/08). Trước đó cả 1.363 dòng không có một
 *     `navigate` nào: vòng "nguồn → chia việc → đo → chỉnh" đứt đúng ở khớp
 *     "đo". Giờ ba đường, và cả ba đều tới một màn CÓ THẬT trong `routes.tsx`:
 *     chân màn sang `/sales/plan` (bước "chỉnh"), dòng bảng nguồn sang hồ sơ
 *     nguồn, dòng bảng lead và bảng đơn sang hồ sơ lead. Chip ContextRail thì
 *     KHÔNG bấm được — bốn mã của nó chưa có màn nào nhận.
 *
 *  6. **Kết luận đứng trước chẩn đoán** (21/08). "Mấy người đang dưới mục tiêu"
 *     và "bậc rớt sâu nhất" từng chỉ sống trong câu quảng cáo của khối AI ở
 *     đáy trang. Giờ chúng là một dòng ngay dưới tiêu đề khối đầu tiên, và bảng
 *     người đứng trước khối dòng chảy.
 *
 *  Thước đo lấy nguyên từ `ROLE_KPI_MODEL` (fixture · module 5): module 3 chỉ hiển
 *  thị, không tự định nghĩa cách chấm ai. Thước nào fixture chưa có nguồn số thì
 *  màn nói thẳng "chưa đo được".
 *
 *  **Màn này được miễn khối "Cố tình không làm" (19/08).** Đổi lại, mọi điều bị
 *  bỏ phải nói TẠI CHỖ: "chưa đo được" đứng ngay trên thước, "kỳ này không lead
 *  nào rơi" đứng ngay trong ô rỗng, hai chặng SLA sau bán nói lý do ngay dưới
 *  tiêu đề bảng. Đừng đưa khối gom lại quay về.
 *
 *  Số lấy qua `useQuery`, tính hết trong `data/performance.ts`. Màn này không
 *  cộng trừ con số nào, chỉ chọn cách đọc chúng — kể cả "còn thiếu bao nhiêu"
 *  (`KpiReading.gap`) và "bậc rớt sâu nhất" (`Performance.worstStep`).
 *
 *  State của màn, cả ba đều là chuyện riêng của màn nên giữ bằng `useState`: kỳ
 *  đang xem · vai đang lọc · người đang mở drawer. */

const ALL = 'all'

const TIER_LABEL = new Map(LEAD_TIERS.map((t) => [t.key, t.label]))

const GRAINS: { value: Grain; label: string }[] = [
  { value: 'thang', label: 'Tháng' },
  { value: 'quy', label: 'Quý' },
  { value: 'nam', label: 'Năm' },
  { value: 'ngay', label: 'Khoảng ngày' },
]

/** Nhãn ngắn của vai trên chip lọc. 'Trưởng phòng Kinh doanh' dài gấp ba nhãn
 *  bên cạnh nó và làm vỡ hàng chip trên tablet. */
const ROLE_SHORT: Record<string, string> = { 'Trưởng phòng Kinh doanh': 'Trưởng phòng' }

const VERDICT: Record<Verdict, { label: string; tone: 'success' | 'warning' | 'draft' }> = {
  dat: { label: 'Đạt', tone: 'success' },
  'can-cai-thien': { label: 'Cần cải thiện', tone: 'warning' },
  'chua-do': { label: 'Chưa đo được', tone: 'draft' },
  /* Đã đo xong, số hiện đủ — chỉ chưa chấm được vì kỳ chưa đóng. Tông 'draft'
     giống 'chua-do' vì cả hai đều KHÔNG phải một lời khen hay một lời chê. */
  'chua-chot': { label: 'Chưa chốt', tone: 'draft' },
}

/** Số nguyên hiện nguyên, số lẻ giữ một chữ số — chuẩn VN, phẩy thập phân (luật 6). */
function num(value: number): string {
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
}

function money(value: number): string {
  return value >= 1_000_000_000 ? billions(value, 1) : millions(value, 0)
}

/** Một thước → chữ hiện trên màn. `null` là chưa đo được, không phải 0. */
function kpiText(k: Pick<KpiReading, 'value' | 'unit'>): string {
  if (k.value === null) return 'chưa đo được'
  if (k.unit === 'ty-le') return percent(k.value)
  if (k.unit === 'tien') return money(k.value)
  return num(k.value)
}

function targetText(k: KpiReading): string | null {
  if (k.target === null) return null
  if (k.unit === 'ty-le') return percent(k.target)
  if (k.unit === 'tien') return money(k.target)
  return num(k.target)
}

/** Nhãn ô khoảng cách. Với thước "càng thấp càng tốt" — giá mỗi lead tốt —
 *  "còn thiếu" là câu nói ngược: vượt mục tiêu ở đó là tin xấu, không phải một
 *  lời khen. Chiều do tầng dữ liệu chốt (`gapKind`), màn không tự đoán. */
function gapLabel(k: KpiReading): string {
  return k.gapKind === 'dang-vuot' ? 'Đang vượt mục tiêu' : 'Còn thiếu'
}

function gapText(k: KpiReading): string {
  if (k.gap === null) return '—'
  if (k.gap === 0) return k.gapKind === 'dang-vuot' ? 'trong mục tiêu' : 'đã đạt'
  return kpiText({ value: k.gap, unit: k.unit })
}

export function PerformancePage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const [choice, setChoice] = useState<PeriodChoice>(DEFAULT_CHOICE)
  const [role, setRole] = useState<string>(ALL)
  const [openId, setOpenId] = useState<string | null>(null)

  const { data, isPending } = useQuery(performanceQuery(choice))
  const picked = data?.people.find((p) => p.actorId === openId) ?? null

  return (
    <AppShell {...chrome.shell}>
      <div className="flex flex-col gap-4 lg:gap-6">
        <PageHeader
          title="Performance"
          subtitle={
            <>
              Kịch bản DAS Vina · chủ màn là {HEAD_OF_SALES} · kỳ dữ liệu {vn(DATA_WINDOW.from)} →{' '}
              <span className="font-mono">{dm(DAS_VINA_FROZEN_AT)}</span> lúc{' '}
              <span className="font-mono">{DAS_VINA_FROZEN_AT.slice(11, 16)}</span>, sau mốc đó
              không còn số đo · chuỗi dưới là đơn lớn nhất đang mở, dựng từ đồ thị object.
            </>
          }
          rail={<ContextRail objects={PERFORMANCE_RAIL} />}
        />

        <PeriodBar choice={choice} onChange={setChoice} data={data} />

        {isPending || !data ? (
          <Waiting />
        ) : (
          <>
            <ScoreBento data={data} />
            {/* Bảng người đứng TRƯỚC khối dòng chảy: nó là câu trả lời của màn
                ("ai đang tắc"), còn lý do rơi và SLA là phần chẩn đoán đọc sau. */}
            <PeopleBlock
              data={data}
              role={role}
              onRole={setRole}
              openId={openId}
              onOpen={setOpenId}
            />
            <FlowBlock
              data={data}
              onWiden={() => setChoice({ grain: 'nam', key: YEARS[YEARS.length - 1]?.key ?? '' })}
            />
            <SourceNote />
            <AssistantBlock data={data} />
          </>
        )}
      </div>

      <PersonDrawer person={picked} data={data} onClose={() => setOpenId(null)} />
    </AppShell>
  )
}

/** Khung chờ đo theo đúng hai khối sẽ mọc lên: hàng thẻ số (hai dải cao xấp xỉ
 *  hai hàng bento) rồi bảng nhân sự bảy dòng. Khung thấp hơn nội dung thật thì
 *  màn nhảy một nhịp lúc số về — đúng thứ khung chờ sinh ra để tránh. */
function Waiting() {
  return (
    <>
      <LoadingBlock height={216} lines={2} label="Đang tải thước của phòng" />
      <GlassCard variant="b" className="flex flex-col gap-3 p-4 lg:p-5">
        <TableSkeleton rows={7} header label="Đang tải bảng hiệu suất theo nhân sự" />
      </GlassCard>
    </>
  )
}

// ---------------------------------------------------------------------------
// Bộ chọn kỳ — thứ lái cả màn
// ---------------------------------------------------------------------------

/** Thanh kỳ vừa là bộ chọn vừa là đồ thị.
 *
 *  Cột tháng ở đây KHÔNG phải trang trí: nó trả lời "tháng nào phòng kéo được
 *  nhiều lead nhất" ngay lúc người dùng đang tìm tháng để bấm vào. Tách đồ thị
 *  ra một thẻ riêng thì cùng một dãy tháng phải vẽ hai lần trên một màn. */
function PeriodBar({
  choice,
  onChange,
  data,
}: {
  choice: PeriodChoice
  onChange: (c: PeriodChoice) => void
  data: Performance | undefined
}) {
  const list = choice.grain === 'quy' ? QUARTERS : choice.grain === 'nam' ? YEARS : MONTHS

  const columns: BarDatum[] = (data?.months ?? []).map((m) => ({
    key: m.key,
    label: m.short,
    value: m.leads,
    display: num(m.leads),
    active: m.selected,
    onSelect: () => onChange({ grain: 'thang', key: m.key }),
  }))

  return (
    <GlassCard className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:gap-6 lg:p-5">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Icon icon={CalendarRange} size={16} className="text-accent-foreground" />
          <SegmentedControl
            label="Mức của kỳ xem"
            hideLabel
            value={choice.grain}
            options={GRAINS}
            onChange={(grain) =>
              onChange(
                grain === 'ngay'
                  ? { grain, key: '', from: DATA_WINDOW.from, to: DATA_WINDOW.cutoff }
                  : {
                      grain: grain as Grain,
                      key:
                        (grain === 'quy' ? QUARTERS : grain === 'nam' ? YEARS : MONTHS).slice(-1)[0]
                          ?.key ?? '',
                    },
              )
            }
          />
          {/* Bộ chọn kỳ KHÔNG dùng `size="sm"`: nó lái mọi con số dưới nó, mà
              `sm` cho ô cao 24px — nửa ngưỡng 48px của luật 13. `md` lên 32px;
              phần còn lại tới 48px chờ quyết định chung về Button và
              SegmentedControl, ghi trong báo cáo. */}
          {choice.grain === 'ngay' ? (
            <DayRange choice={choice} onChange={onChange} />
          ) : (
            <SegmentedControl
              label="Kỳ xem"
              hideLabel
              value={choice.key}
              options={list.map((p) => ({ value: p.key, label: p.label }))}
              onChange={(key) => onChange({ grain: choice.grain, key })}
            />
          )}
        </div>

        {data && (
          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Đang xem <b className="text-foreground font-semibold">{data.period.label}</b> ·{' '}
            {vn(data.period.from)} → {vn(data.period.cutoff)} · {num(data.period.elapsed)} ngày đã
            có số đo
            {data.period.closed
              ? ' · kỳ đã đóng'
              : ` · còn ${num(data.period.daysLeft)} ngày tới hết kỳ`}
            .
          </p>
        )}
      </div>

      {columns.length > 0 && (
        <BarChart
          data={columns}
          className="lg:shrink-0"
          source="Lead vào sổ theo tháng · bấm một cột để xem tháng đó"
          height={96}
        />
      )}
    </GlassCard>
  )
}

/** Khoảng ngày tự chọn. Hai ô ngày gốc của trình duyệt — chúng có sẵn lịch, bàn
 *  phím và bánh xe của hệ điều hành; popover tự dựng thua cả ba. `min`/`max`
 *  chặn ngay ở tầng control để không ai chọn được ngày kịch bản không có, nên
 *  khối này KHÔNG cần thêm một câu nhắc kỳ dữ liệu — phụ đề màn đã nói. */
function DayRange({
  choice,
  onChange,
}: {
  choice: PeriodChoice
  onChange: (c: PeriodChoice) => void
}) {
  const from = choice.from ?? DATA_WINDOW.from
  const to = choice.to ?? DATA_WINDOW.cutoff

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground text-[11px]">Từ</span>
        <Input
          type="date"
          value={from}
          min={DATA_WINDOW.from}
          max={to}
          onChange={(e) => onChange({ ...choice, grain: 'ngay', key: '', from: e.target.value })}
          className="w-[148px] px-3 text-[11.5px]"
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground text-[11px]">Đến</span>
        <Input
          type="date"
          value={to}
          min={from}
          max={DATA_WINDOW.horizon}
          onChange={(e) => onChange({ ...choice, grain: 'ngay', key: '', to: e.target.value })}
          className="w-[148px] px-3 text-[11.5px]"
        />
      </label>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bento chỉ số — một ô hero 2×2 (luật 3) + thẻ số quanh nó
// ---------------------------------------------------------------------------

/** Delta so với kỳ liền trước cùng loại. Không có kỳ trước thì KHÔNG có ô delta:
 *  "tăng so với không có gì" không phải một con số đọc được. */
function delta(now: number | null, before: number | null, unit: 'so' | 'ty-le' | 'tien') {
  if (now === null || before === null) return undefined
  const diff = now - before
  const text =
    unit === 'ty-le'
      ? `${diff >= 0 ? '+' : '−'}${percent(Math.abs(diff))}`
      : unit === 'tien'
        ? `${diff >= 0 ? '+' : '−'}${money(Math.abs(diff))}`
        : `${diff >= 0 ? '+' : '−'}${num(Math.abs(diff))}`

  return {
    direction: diff > 0 ? ('up' as const) : diff < 0 ? ('down' as const) : ('flat' as const),
    text,
    tone: diff > 0 ? ('success' as const) : diff < 0 ? ('warning' as const) : ('muted' as const),
  }
}

/** Một ô tỷ lệ. Mẫu số bằng 0 thì ô KHÔNG hiện 0% — nó hiện gạch ngang, và câu
 *  ngay dưới gạch nói ra gạch ấy nghĩa là gì. Gạch đứng một mình là chỗ người
 *  đọc tự điền nghĩa, và mỗi người điền một nghĩa khác nhau. */
function rateCell(value: number | null, hint: string, why: string) {
  return { value: value === null ? '—' : percent(value), hint: value === null ? why : hint }
}

/** Kết luận của cả màn, viết thành MỘT dòng.
 *
 *  Ba con số này đã có sẵn trong `data` từ lâu — `behind` và `worstStep` tính ở
 *  tầng dữ liệu, `daysLeft` ở `period` — nhưng tới 20/08 chúng chỉ hiện trong
 *  câu quảng cáo của khối AI ở đáy trang. Người mở màn năm giây đầu thấy chín
 *  con số trần và không biết nhìn vào đâu. Dòng này không đẻ số mới, nó chỉ đưa
 *  kết luận lên chỗ mắt chạm trước.
 *
 *  Mẫu câu chênh lấy đúng của `campaigns.tsx` — cùng repo, cùng cách đọc. */
function Conclusion({ data }: { data: Performance }) {
  const total = data.people.length

  return (
    <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
      {data.behind > 0 ? (
        <b className="text-foreground font-semibold">
          {num(data.behind)} trên {num(total)} người đang dưới mục tiêu kỳ
        </b>
      ) : (
        /* KHÔNG viết "cả N người đều đạt": `behind` chỉ đếm người bị chấm Cần
           cải thiện, còn người chưa có thước nào chấm được thì không đạt cũng
           không trượt — gộp họ vào một lời khen là nói quá. */
        <b className="text-foreground font-semibold">
          Không ai trong {num(total)} người đang dưới mục tiêu kỳ
        </b>
      )}
      {data.worstStep ? ` · phễu hẹp nhất ở ${data.worstStep}` : ''}
      {data.period.closed ? ' · kỳ đã đóng' : ` · còn ${num(data.period.daysLeft)} ngày tới hết kỳ`}
      .
    </p>
  )
}

function ScoreBento({ data }: { data: Performance }) {
  const o = data.overview
  const before = data.previous?.overview ?? null
  const vs = data.previous
    ? `so với ${data.previous.label.toLowerCase()}`
    : 'kỳ đầu — chưa có mốc so'

  return (
    <section aria-label="Thước của phòng trong kỳ" className="flex flex-col gap-3">
      <SectionTitle size="md">Thước của phòng trong kỳ</SectionTitle>
      <Conclusion data={data} />

      {/* `xl:` là điểm gãy thứ tư, ngoài ba điểm của hợp đồng §8.1#5 — giữ lại
          có chủ ý và đã ghi thành câu hỏi cho người quyết: hạ xuống `lg:` thì
          tablet 1024px phải nhét bốn cột, trong đó ô hero chiếm hai, và thẻ số
          compact tụt xuống dưới 200px. Đừng đổi lặng lẽ. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
        <FunnelHero data={data} />

        <StatCard
          size="compact"
          icon={Users}
          value={num(o.leads)}
          label="Lead vào sổ trong kỳ"
          hint={vs}
          delta={delta(o.leads, before?.leads ?? null, 'so')}
        />
        <StatCard
          size="compact"
          icon={Activity}
          label="Tỷ lệ MQL"
          {...rateCell(
            o.mqlRate,
            `${num(o.mql)} trên ${num(o.leads)} lead của lứa`,
            'chưa đo được — kỳ này chưa lead nào vào sổ để làm mẫu số',
          )}
          delta={delta(o.mqlRate, before?.mqlRate ?? null, 'ty-le')}
        />
        <StatCard
          size="compact"
          icon={Activity}
          label="Tỷ lệ SQL"
          {...rateCell(
            o.sqlRate,
            `${num(o.sql)} trên ${num(o.mql)} lead lên MQL`,
            'chưa đo được — lứa của kỳ chưa lead nào lên MQL để làm mẫu số',
          )}
          delta={delta(o.sqlRate, before?.sqlRate ?? null, 'ty-le')}
        />
        <StatCard
          size="compact"
          icon={FileCheck}
          /* Luật 14 · chữ trên màn là tiếng Việt. "Win rate" không nằm trong
             danh sách viết tắt được miễn (MQL · SQL · SLA · BD · KPI), và nó là
             chuỗi màn tự gõ chứ không lấy từ fixture. Ba ô tỷ lệ giờ đọc liền
             một mạch: Tỷ lệ MQL · Tỷ lệ SQL · Tỷ lệ chốt. Nhãn của thước cùng
             tên trong `ROLE_KPI_MODEL` vẫn là 'Win rate' — đổi nó là việc của
             `packages/**`, đã ghi thành đòi hỏi trong báo cáo. */
          label="Tỷ lệ chốt"
          {...rateCell(
            o.winRate,
            `${num(o.won)} đã ký trên ${num(o.sql)} SQL của lứa`,
            'chưa đo được — lứa của kỳ chưa lead nào vào sổ cơ hội để làm mẫu số',
          )}
          delta={delta(o.winRate, before?.winRate ?? null, 'ty-le')}
        />

        <StatCard
          size="compact"
          icon={FileCheck}
          value={num(o.signedInPeriod)}
          label="Hợp đồng ký trong kỳ"
          hint={vs}
          delta={delta(o.signedInPeriod, before?.signedInPeriod ?? null, 'so')}
        />
        <StatCard
          size="compact"
          icon={UserMinus}
          value={num(o.exited)}
          label="Lead ra khỏi luồng"
          hint={vs}
          delta={delta(o.exited, before?.exited ?? null, 'so')}
        />
        <StatCard
          size="compact"
          icon={Wallet}
          value={billions(o.openValue, 1)}
          /* Cùng con số này ở drawer ghi "Giá trị đơn đang mở"; nhãn trần "Giá
             trị đang mở" ở đây thừa hưởng chữ "trong kỳ" của tiêu đề khối trong
             khi nó KHÔNG cắt theo kỳ (quyết định G · mọi nhãn tiền khai phạm
             vi). Hai đầu giờ đọc y hệt nhau. */
          label="Giá trị đơn đang mở"
          hint={`${num(o.openDeals)} đơn · số chụp tại ${dm(DAS_VINA_FROZEN_AT)}`}
        />
        <StatCard
          size="compact"
          icon={TriangleAlert}
          value={num(o.rotting)}
          label="Đơn đang mục"
          hint={`Quá hạn cột · trên ${num(o.openDeals)} đơn · số chụp tại ${dm(DAS_VINA_FROZEN_AT)}`}
        />
      </div>
    </section>
  )
}

/** Ô hero 2×2 của màn (luật 3 · mỗi dashboard đúng một ô hero), và là chỗ DUY
 *  NHẤT trên màn vẽ phễu.
 *
 *  Phễu bốn bậc. `FUNNEL` trong fixture có sáu bậc, nhưng hai bậc "Báo giá" và
 *  "Chờ ký" là trạng thái của sổ cơ hội và không có ngày trên từng dòng lead —
 *  vẽ chúng theo kỳ là bịa ngày.
 *
 *  Mỗi bậc ghi CẢ số tuyệt đối lẫn tỷ lệ, vì phần trăm đứng một mình giấu mất
 *  mẫu số. Điều đó là hợp đồng của `BarDatum.note`, không cần nói lại trên màn. */
function FunnelHero({ data }: { data: Performance }) {
  const steps = data.funnel
  const last = steps[steps.length - 1]
  const first = steps[0]

  const bars: BarDatum[] = steps.map((s) => ({
    key: s.key,
    label: s.label,
    value: s.count,
    display: num(s.count),
    note: s.ratio === null ? 'đầu phễu' : `${percent(s.ratio)} của bậc trên`,
    tone: s.key === 'hop-dong' ? 'success' : 'primary',
  }))

  return (
    <GlassCard className="col-span-2 flex flex-col gap-4 p-5 lg:row-span-2 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Kicker>Phễu của kỳ</Kicker>
          <h4 className="mt-2 text-[13px] font-semibold">Rớt qua từng bậc</h4>
        </div>
        <MetaPill mono tone="accent">
          {data.period.short}
        </MetaPill>
      </div>

      <BarChart
        data={bars}
        orientation="bar"
        max={first?.count}
        source="Mốc đời lead · Sổ lead 100 dòng"
        className="flex-1"
      />

      {/* Nửa câu sau là chỗ bắc cầu sang hai màn kia: Sổ lead đếm 100 dòng, sổ
          nguồn cộng ra 100 lead, còn cột đầu phễu ở đây là phần VÀO SỔ TRONG
          KỲ. Không có nửa câu đó thì "16" và chữ "Sổ lead 100 dòng" đứng cách
          nhau 40px trong cùng một thẻ mà không ai nối. Mẫu câu lấy của
          `campaigns.tsx`; số 100 đọc từ fixture qua `BOOK_TOTAL`. */}
      <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
        {first && last && first.count > 0
          ? `Cả phễu: ${num(first.count)} → ${num(last.count)} · ${last.ofTop === null ? 'chưa đo được' : percent(last.ofTop)} từ lead vào sổ thành hợp đồng — ${num(first.count)} trên ${num(BOOK_TOTAL)} lead cả sổ, phần vào sổ trong kỳ này.`
          : `Kỳ này chưa lead nào vào sổ — phễu chưa có mẫu số để đo, dù cả sổ có ${num(BOOK_TOTAL)} lead.`}
      </p>
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------
// Dòng chảy — lý do rơi và SLA bàn giao
// ---------------------------------------------------------------------------

function FlowBlock({ data, onWiden }: { data: Performance; onWiden: () => void }) {
  return (
    <section aria-label="Dòng chảy" className="grid gap-4 lg:grid-cols-2 lg:gap-6">
      <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6">
        <SectionTitle
          size="sm"
          hint={`Mẫu số là ${num(data.exitedTotal)} lead ra khỏi luồng trong kỳ, không phải cả sổ — và danh sách lý do là danh sách đóng, không có ô "khác".`}
        >
          Lý do rời luồng
        </SectionTitle>
        {data.exits.length === 0 ? (
          /* Ô trống phải nói ra "vì sao trống" và mở đường đi tiếp — kỳ hẹp là
             lý do hay gặp nhất, nên nút đưa thẳng về cả kỳ. Câu KHÔNG gõ số
             lượng lý do: danh sách đóng ấy sửa được ở module 5, và một con số
             gõ tay ở đây sẽ nói sai ngay hôm ai đó thêm một lý do. */
          <EmptyState
            className="my-auto"
            icon={UserMinus}
            message={`Không lead nào ra khỏi luồng trong ${data.period.label.toLowerCase()}. Kỳ càng hẹp thì càng dễ rỗng — mở rộng ra cả kỳ để thấy đủ danh sách lý do.`}
            action={{ label: 'Xem cả kỳ', onClick: onWiden }}
          />
        ) : (
          <BarChart
            orientation="bar"
            data={data.exits.map((e): BarDatum => ({
              key: e.label,
              label: e.label,
              value: e.count,
              display: num(e.count),
              note: percent(e.share),
              tone: 'danger',
            }))}
            source={`${num(data.exitedTotal)} lead rơi trong kỳ · Sổ lead`}
          />
        )}
      </GlassCard>

      <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6">
        <SectionTitle
          size="sm"
          hint="Hai chặng sau bán không có mốc nào để đo — DAS Vina là kịch bản khách chưa mua."
        >
          SLA bàn giao
        </SectionTitle>
        <DataTable
          columns={[
            { header: 'Chặng', width: '1.5fr' },
            { header: 'Lần đo', width: '0.6fr', align: 'right' },
            { header: 'Mục tiêu', width: '0.8fr', align: 'right' },
            { header: 'Thực tế', width: '0.8fr', align: 'right' },
            { header: 'Trạng thái', width: '1.1fr', align: 'right' },
          ]}
          rows={data.sla.map((s) => ({
            id: s.key,
            cells: [
              <span key="l" className="flex min-w-0 flex-col">
                <span className="truncate">{s.label}</span>
                <span className="text-muted-foreground truncate text-[10.5px]">{s.note}</span>
              </span>,
              <span key="c" className="tnum font-num text-muted-foreground">
                {num(s.count)}
              </span>,
              <span key="t" className="tnum font-num">
                ≤ {num(s.targetDays)} ngày
              </span>,
              /* Chặng không có lần bàn giao nào trong kỳ thì ô nói thẳng "chưa
                 đo được", không để một dấu gạch tự nhận nghĩa. Trong bảng này
                 gạch ngang vì thế không mang nghĩa nào cả. */
              s.actualDays === null ? (
                <span key="a" className="text-muted-foreground text-[11px]">
                  chưa đo được
                </span>
              ) : (
                <span
                  key="a"
                  className={cn(
                    'tnum font-num font-semibold',
                    s.verdict === 'can-cai-thien' && 'text-warning',
                  )}
                >
                  {num(s.actualDays)} ngày
                </span>
              ),
              /* Ba trạng thái có tên nhưng chỉ hai tông: `buildSla` gộp "Cần
                 theo dõi" và "Trễ hạn" vào cùng `can-cai-thien`, nên hai badge
                 ra cùng màu vàng và chú thích dưới bảng hứa ba mức mà mắt chỉ
                 thấy hai. Tông thứ ba phải lấy `--destructive-foreground` —
                 token đang đo 4,34:1 trên glass-a, dưới ngưỡng luật 13, và
                 quyết định L cấm đụng nó trong đợt này. Nên mức nặng nhất tách
                 ra bằng HÌNH chứ không bằng màu. */
              <span key="s" className="flex items-center justify-end gap-2">
                {s.state === 'Trễ hạn' && (
                  <Icon icon={TriangleAlert} size={16} className="text-warning" />
                )}
                <Badge tone={VERDICT[s.verdict].tone}>{s.state}</Badge>
              </span>,
            ],
          }))}
        />
        <div className="mt-auto flex flex-col gap-2">
          <Separator fade />
          <p className="text-muted-foreground text-[11px] leading-[1.6]">
            Trong mục tiêu là Đúng hạn · vượt không quá {percent(SLA_MARGIN)} là Cần theo dõi · hơn
            nữa là Trễ hạn · &quot;Lần đo&quot; đếm số lần bàn giao thật rơi vào kỳ, không có lần
            nào thì chặng chưa đo được chứ không phải 0 ngày.
          </p>
        </div>
      </GlassCard>
    </section>
  )
}

/** Ô rỗng của một bảng bằng chứng trong drawer.
 *
 *  KHÔNG dùng `EmptyState`: nó bắt buộc có một nút, mà từ đây không có màn nào
 *  để đi tới — "kỳ này BD chưa chạm lead nào" là một sự thật, không phải một
 *  việc còn dang dở. Vẽ nút ở đây là hứa một chỗ không tồn tại. Đổi lại, câu
 *  phải nói ra VÌ SAO rỗng ngay tại chỗ, đúng luật của màn được miễn khối "Cố
 *  tình không làm". */
function Empty({ children }: { children: string }) {
  return <p className="text-muted-foreground text-[11.5px] leading-[1.5]">{children}</p>
}

// ---------------------------------------------------------------------------
// Người — danh sách, không phải bảy thẻ chi tiết
// ---------------------------------------------------------------------------

function PeopleBlock({
  data,
  role,
  onRole,
  openId,
  onOpen,
}: {
  data: Performance
  role: string
  onRole: (key: string) => void
  openId: string | null
  onOpen: (id: string) => void
}) {
  const shown = role === ALL ? data.people : data.people.filter((p) => p.roleKey === role)

  return (
    <section aria-label="Hiệu suất theo nhân sự" className="flex flex-col gap-3">
      <SectionTitle
        size="md"
        hint="Xếp người đang tắc lên đầu, tắc nặng nhất trước — bấm một dòng để mở chi tiết của người đó."
        actions={
          <div className="flex items-center gap-2">
            <Icon icon={Filter} size={16} className="text-muted-foreground" />
            {/* Nhãn là "Vai": cả màn gọi thứ này là vai ("Thước của vai", "Ba
                lớp thước của vai"), tầng dữ liệu gọi `roleKey`, và bảng vai
                người của tài liệu kiến trúc cũng gọi là vai. */}
            <SegmentedControl
              label="Vai"
              hideLabel
              value={role}
              onChange={onRole}
              options={[
                { value: ALL, label: 'Tất cả', count: data.people.length },
                ...data.roles.map((r) => ({
                  value: r.key,
                  label: ROLE_SHORT[r.label] ?? r.label,
                  count: r.count,
                })),
              ]}
            />
          </div>
        }
      >
        Hiệu suất theo nhân sự
      </SectionTitle>

      <GlassCard variant="b" className="flex flex-col gap-3 p-4 lg:p-5">
        {/* Sáu cột không ép được vào 390px mà còn đọc nổi. Cho cuộn ngang trong
            lòng thẻ, đừng bóp cột — bóp thì tên người và con số cùng vỡ. */}
        <div className="-mx-1 overflow-x-auto px-1">
          <DataTable
            className="min-w-[680px]"
            columns={[
              { header: 'Nhân sự', width: '1.8fr' },
              { header: 'Thước chính', width: '1.2fr' },
              /* Số đo và mục tiêu ở CHUNG một ô: tách đôi thì bảng thành sáu
                 cột và cột cuối bị cắt ngay ở tablet, mà "55 / 120" đọc liền
                 còn nhanh hơn hai ô rời. */
              { header: 'Trong kỳ / mục tiêu', width: '1.1fr', align: 'right' },
              { header: 'Tiến độ', width: '1.2fr' },
              /* Cột này rộng hơn ba cột giữa vì nó phải chứa được TÊN thước
                 đang trượt, không chỉ một cái badge. */
              { header: 'Trạng thái', width: '1.7fr', align: 'right' },
            ]}
            rows={shown.map((p) => ({
              id: p.actorId,
              state: p.actorId === openId ? ('selected' as const) : undefined,
              onOpen: () => onOpen(p.actorId),
              cells: [
                <span key="n" className="flex min-w-0 items-center gap-2">
                  <Avatar name={p.name} size="sm" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{p.name}</span>
                    <span className="text-muted-foreground truncate text-[10.5px]">{p.role}</span>
                  </span>
                </span>,
                <span key="m" className="text-muted-foreground truncate text-[11.5px]">
                  {p.primary?.label ?? 'Không chấm cá nhân'}
                </span>,
                <PrimaryValue key="v" reading={p.primary} />,
                <RowProgress key="p" reading={p.primary} />,
                /* Badge và số thước trên CÙNG một dòng: hàng bảng cao cứng
                   44px, xếp hai dòng là chữ dưới chạm mép hàng kế tiếp. */
                <span key="s" className="flex items-center justify-end gap-2">
                  <ScoreNote person={p} />
                  <Badge tone={VERDICT[p.verdict].tone}>{VERDICT[p.verdict].label}</Badge>
                </span>,
              ],
            }))}
          />
        </div>
      </GlassCard>
    </section>
  )
}

/** Chữ nhỏ đứng trước badge trạng thái.
 *
 *  Đúng một thước trượt thì in TÊN nó. "2/3 thước" nói CÓ trượt mà không nói
 *  trượt ở đâu, và ca thật của kịch bản làm điều đó thành một câu nói ngược:
 *  hàng Vũ Minh Châu ở tháng 5 hiện 31/24, thanh tiến độ xanh đầy, ngay cạnh
 *  là badge "Cần cải thiện" — thước thật sự trượt là Tỷ lệ lead tốt, và nó chỉ
 *  thấy được sau khi mở drawer. Từ hai thước trở lên thì tên không đủ chỗ, quay
 *  về đếm. Danh sách `failing` dựng ở tầng dữ liệu nên nó không lệch `scored`. */
function ScoreNote({ person }: { person: PersonCard }) {
  if (person.scored.total === 0) return null

  const one = person.failing.length === 1 ? person.failing[0] : null

  return (
    <span className="text-muted-foreground tnum min-w-0 truncate text-[10.5px]">
      {one ? `trượt: ${one}` : `${person.scored.ok}/${person.scored.total} thước`}
    </span>
  )
}

/** Số đo và mục tiêu trong một ô. Không có mục tiêu — hoặc chưa đo được — thì
 *  KHÔNG in dấu gạch chéo cho có: "chưa đo được / —" đọc ra như một phép chia. */
function PrimaryValue({ reading }: { reading: KpiReading | null }) {
  if (!reading) return <span className="text-muted-foreground text-[11.5px]">—</span>

  const target = targetText(reading)
  if (reading.value === null || target === null) {
    return <span className="text-warning whitespace-nowrap text-[11.5px]">{kpiText(reading)}</span>
  }

  return (
    <span className="tnum font-num whitespace-nowrap">
      <b className="font-semibold">{kpiText(reading)}</b>
      <span className="text-muted-foreground"> / {target}</span>
    </span>
  )
}

/** Thanh tiến độ trong ô bảng — chiều cao 6px để không đội hàng lên quá 44px.
 *
 *  Rãnh lấy `--surface-control`, thanh của trạng thái "chưa chốt" lấy
 *  `--muted-foreground`: cả hai đều là token có tên, không phải một mức trắng
 *  gõ tay. Chưa chốt cố tình KHÔNG dùng tông thắng/thua — kỳ chưa đóng thì thanh
 *  chỉ nói "đo được tới đây", không nói đạt hay trượt. */
function RowProgress({ reading }: { reading: KpiReading | null }) {
  /* Ba lý do khác nhau làm ô này không có thanh, và chúng KHÔNG được gộp thành
     một câu: vai không chấm cá nhân · thước chưa có nguồn số · thước có số mà
     chưa ai đặt mục tiêu. Gộp lại là mất đúng thứ người xem cần biết. */
  if (!reading) return <span className="text-muted-foreground text-[11px]">—</span>
  if (reading.value === null) {
    return <span className="text-warning text-[11px]">chưa đo được</span>
  }
  if (reading.ratio === null) {
    return <span className="text-muted-foreground text-[11px]">chưa đặt mục tiêu</span>
  }
  const pct = Math.min(reading.ratio, 1)
  return (
    <span className="flex items-center gap-2">
      <span className="bg-surface-control h-1.5 flex-1 overflow-hidden rounded-sm">
        <span
          className={cn(
            'block h-full rounded-sm',
            reading.verdict === 'dat'
              ? 'bg-success'
              : reading.verdict === 'chua-chot'
                ? 'bg-muted-foreground'
                : 'bg-warning',
          )}
          style={{ width: `${pct * 100}%` }}
        />
      </span>
      <span className="tnum font-num w-9 shrink-0 text-right text-[11px]">
        {percent(reading.ratio)}
      </span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Drawer — chi tiết KPI một người
// ---------------------------------------------------------------------------

/** Chi tiết một người. Thứ tự khối là thứ tự câu hỏi người xem hỏi:
 *
 *    1 · đang đạt bao nhiêu phần mục tiêu kỳ này        → đồng hồ ở giữa
 *    2 · còn thiếu bao nhiêu, còn mấy ngày, cần mỗi ngày → nhịp ngày/tháng/quý
 *    3 · đo bằng những thước nào                        → ba lớp KPI
 *    4 · số đó lấy ở đâu ra                             → bảng bằng chứng
 *
 *  Ai cũng mở được drawer của mọi người: KPI là thứ để phòng nhìn nhau mà chạy,
 *  không phải hồ sơ mật. Số ở đây không có gì mà sổ lead chưa cho xem. */
function PersonDrawer({
  person,
  data,
  onClose,
}: {
  person: PersonCard | null
  data: Performance | undefined
  onClose: () => void
}) {
  /* Giữ lại người VỪA xem trong quãng panel trượt ra.
     `person` về null ngay lúc bấm đóng; trả `null` luôn thì cả `<Drawer>` bị
     gỡ khỏi cây trước khi nó kịp chạy hoạt cảnh đi ra, và panel biến mất đánh
     phụt — đúng cái giật mà hoạt cảnh sinh ra để xoá. Panel đọc người cũ thêm
     một nhịp 180ms nữa rồi mới tự gỡ. */
  const last = useRef<PersonCard | null>(null)
  if (person) last.current = person
  const shown = person ?? last.current

  if (!shown || !data) return null

  const verdict = VERDICT[shown.verdict]

  return (
    <Drawer
      open={person !== null}
      width="lg"
      onClose={onClose}
      title={shown.name}
      subtitle={`${shown.role} · ${data.period.label} · ${vn(data.period.from)} → ${vn(data.period.cutoff)}`}
      meta={<Badge tone={verdict.tone}>{verdict.label}</Badge>}
    >
      <div className="flex flex-col gap-5">
        <GaugeBlock person={shown} data={data} />
        {shown.pace.length > 0 && <PaceBlock pace={shown.pace} unit={shown.primary?.unit} />}
        <LayerBlock person={shown} />
        <EvidenceBlock person={shown} />
      </div>
    </Drawer>
  )
}

/** Khối tâm: đồng hồ ở giữa, bốn con số vây quanh.
 *
 *  Vây quanh chứ không xếp dưới — bốn số này là bốn mảnh của CÙNG một câu
 *  ("đã đạt bao nhiêu trên mục tiêu, còn thiếu bao nhiêu, còn mấy ngày"), nên
 *  chúng phải đọc được cùng lúc với cái đồng hồ chứ không sau nó. */
function GaugeBlock({ person, data }: { person: PersonCard; data: Performance }) {
  const k = person.primary

  if (!k) {
    /* Vai không chấm cá nhân thì ô này KHÔNG được để trống — trống sẽ bị đọc
       thành "người này không làm gì". Thay đồng hồ cá nhân bằng số của phòng.
       Phễu thì KHÔNG vẽ lại ở đây: bản y hệt đã có ở đầu màn, và hai bản cùng
       một số là hai chỗ để lệch nhau. Dẫn bằng chữ, không bằng nút — drawer
       không cuộn được lên đầu màn nên nút ở đây sẽ hứa chỗ nó không đưa tới. */
    return (
      <GlassCard className="flex flex-col gap-4 p-5">
        <Kicker>Thước của vai</Kicker>
        <p className="text-[12.5px] font-semibold leading-[1.6]">{person.note}</p>
        <div className="grid grid-cols-2 gap-4">
          <Fact label="Lead vào sổ trong kỳ" value={num(data.overview.leads)} strong />
          <Fact label="Hợp đồng ký trong kỳ" value={num(data.overview.signedInPeriod)} strong />
          {/* Mệnh đề "số chụp tại 17/08" từng đứng trong CẢ HAI nhãn, hai ô
              cạnh nhau trong một lưới 2×2. Nó là một câu nói về cả hàng dưới,
              nên nó xuống dòng chú thích chung. */}
          <Fact label="Giá trị đơn đang mở" value={billions(data.overview.openValue, 1)} />
          <Fact label="Đơn đang mục" value={num(data.overview.rotting)} />
        </div>
        <Separator fade />
        <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
          Hai ô dưới là số chụp tại {dm(DAS_VINA_FROZEN_AT)}, không cắt theo kỳ. Phễu của phòng
          trong kỳ nằm ở khối &quot;Thước của phòng trong kỳ&quot; đầu màn, không vẽ lại trong
          drawer.
        </p>
      </GlassCard>
    )
  }

  const tone =
    k.verdict === 'dat'
      ? 'success'
      : k.verdict === 'chua-do' || k.verdict === 'chua-chot'
        ? 'primary'
        : 'warning'

  return (
    <GlassCard className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Kicker>Thước chính của vai</Kicker>
          <h4 className="mt-2 text-[13px] font-semibold">{k.label}</h4>
        </div>
        {k.snapshot && <MetaPill tone="warning">số chụp tại {dm(DAS_VINA_FROZEN_AT)}</MetaPill>}
      </div>

      {/* Ba điểm gãy của hợp đồng màn: base · md · lg. Trước đây khối này gãy ở
          `sm:` — điểm thứ tư, và là điểm duy nhất trong cả màn. */}
      <div className="flex flex-col items-center gap-5 md:flex-row md:gap-6">
        <RadialGauge
          size={168}
          tone={tone}
          label={`${k.label} của ${person.name}`}
          value={k.ratio ?? 0}
          center={k.ratio === null ? '' : percent(k.ratio)}
          caption={k.ratio === null ? undefined : 'của mục tiêu kỳ'}
          empty={k.value === null ? 'chưa đo được' : undefined}
        />

        <div className="grid flex-1 grid-cols-2 gap-4">
          <Fact label="Đã đạt trong kỳ" value={kpiText(k)} strong />
          <Fact label="Mục tiêu kỳ" value={targetText(k) ?? 'chưa đặt'} />
          <Fact
            label={gapLabel(k)}
            value={gapText(k)}
            tone={k.gap === null ? undefined : k.gap > 0 ? 'warning' : 'success'}
          />
          <Fact
            label="Còn lại của kỳ xem"
            value={data.period.closed ? 'kỳ đã đóng' : `${num(data.period.daysLeft)} ngày`}
          />
        </div>
      </div>

      <p className="text-muted-foreground text-[11.5px] leading-[1.6]">
        {k.note} · công thức: {k.formula}
      </p>
    </GlassCard>
  )
}

function Fact({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: 'warning' | 'success'
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span
        className={cn(
          'tnum font-num font-semibold',
          strong ? 'text-[22px] tracking-[-.5px]' : 'text-[15px]',
          tone === 'warning' && 'text-warning',
          tone === 'success' && 'text-on-tint-success-strong',
        )}
      >
        {value}
      </span>
    </div>
  )
}

/** Nhịp KPI — câu trả lời cho "còn bao lâu nữa mới đạt".
 *
 *  Ba mốc neo vào lát cắt chứ không theo kỳ đang xem: kỳ đang xem có thể là
 *  tháng 5, nhưng câu hỏi "hôm nay tôi còn phải làm gì" luôn hỏi về hôm nay. */
function PaceBlock({ pace, unit }: { pace: PaceRow[]; unit?: KpiReading['unit'] }) {
  const fmt = (v: number) => kpiText({ value: v, unit: unit ?? 'so' })
  /* Số nhịp hay nhỏ hơn 1 ("cần 0,07 đơn mỗi ngày"). `num` cắt còn một chữ số
     thập phân nên nó ra "0" — đúng kiểu số làm người đọc tưởng không phải làm
     gì. Nhịp vì thế giữ hai chữ số khi nhỏ hơn 1. */
  const pace1 = (v: number) =>
    unit === 'tien' || unit === 'ty-le'
      ? fmt(v)
      : v < 1
        ? v.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
        : fmt(v)

  const today = pace.find((r) => r.key === 'ngay')
  const month = pace.find((r) => r.key === 'thang')
  const milestones = pace.filter((r) => r.key !== 'ngay')

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5">
      <SectionTitle
        size="sm"
        hint="Ba mốc luôn tính từ lát cắt của kịch bản, không theo kỳ xem chọn ở đầu màn."
      >
        Còn bao lâu nữa mới đạt
      </SectionTitle>

      {/* Mốc "hôm nay" KHÔNG có thanh tiến độ, và đó là chủ ý: chia mục tiêu
          tháng cho 31 ngày ra những con số như "0,03 đơn" — vẽ thanh cho nó thì
          mỗi ngày không ký hợp đồng đều hiện ra như một ngày trượt chỉ tiêu.
          Câu người ta thật sự cần là "để kịp tháng, mỗi ngày phải bao nhiêu".

          Ô lồng nằm trên `glass-b` — mặt navy đục không tính vào trần hai lớp
          trắng của luật 13, nên chữ phụ ở đây vẫn đủ tương phản. */}
      {today && month && (
        <InsetPanel pad="sm" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[12.5px] font-semibold">{today.label}</span>
            <span className="text-muted-foreground text-[11px]">
              hôm nay đã có <b className="text-foreground font-semibold">{fmt(today.done)}</b>
            </span>
          </div>
          <p className="text-muted-foreground text-[11px] leading-[1.6]">
            {month.missing <= 0
              ? `Mục tiêu ${month.label.toLowerCase()} đã đạt — phần làm thêm từ hôm nay là phần vượt.`
              : month.daysLeft > 0
                ? `Để kịp ${month.label.toLowerCase()} còn phải thêm ${fmt(month.missing)} trong ${num(month.daysLeft)} ngày — nhịp ${pace1(month.missing / month.daysLeft)} mỗi ngày.`
                : `${month.label} đã đóng và còn hụt ${fmt(month.missing)} — mốc này không gỡ lại được nữa.`}
          </p>
        </InsetPanel>
      )}

      {milestones.map((row) => (
        <div key={row.key} className="flex flex-col gap-2">
          <Progress
            value={row.ratio}
            label={`${row.label} · ${row.window}`}
            tone={row.ratio >= 1 ? 'success' : 'warning'}
          />
          <div className="flex flex-wrap items-center gap-2">
            <MetaPill mono>
              {fmt(row.done)} / {fmt(row.target)}
            </MetaPill>
            {row.missing > 0 ? (
              <MetaPill tone="warning">còn thiếu {fmt(row.missing)}</MetaPill>
            ) : (
              <MetaPill tone="success">đã đạt mốc này</MetaPill>
            )}
            {row.daysLeft > 0 && <MetaPill mono>còn {num(row.daysLeft)} ngày</MetaPill>}
            {row.perDay !== null && (
              <MetaPill tone="accent">cần {pace1(row.perDay)} mỗi ngày</MetaPill>
            )}
          </div>
        </div>
      ))}
    </GlassCard>
  )
}

/** Ba lớp KPI của khung tài liệu: hoạt động · chuyển đổi · chất lượng.
 *  Cùng một vai thì cùng bộ thước, nên hai người cùng vai đọc y hệt nhau. */
function LayerBlock({ person }: { person: PersonCard }) {
  if (person.kpis.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle
        size="sm"
        hint="Ba lớp tách nhau có chủ ý: chỉ nhìn lớp kết quả thì người có đầu vào kém chất lượng bị chấm oan."
      >
        Ba lớp thước của vai {person.roleKey}
      </SectionTitle>

      {LAYERS.map((layer) => {
        const rows = person.kpis.filter((k) => k.layer === layer.key)
        if (rows.length === 0) return null

        return (
          <GlassCard key={layer.key} variant="b" className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h5 className="text-[12.5px] font-semibold">{layer.label}</h5>
              <span className="text-muted-foreground text-[10.5px]">
                {layer.note}
                {layer.key === 'chat-luong' ? ' · không dùng để xếp hạng' : ''}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {rows.map((k) => (
                <KpiRow key={k.key} k={k} />
              ))}
            </div>
          </GlassCard>
        )
      })}
    </div>
  )
}

/** Thước chốt muộn, kỳ chưa đóng: số đã đủ nhưng nhãn phải hoãn. Tiền của một
 *  nguồn đang chạy đã ghi hết vào kỳ trong khi lead của nó chưa về hết, nên
 *  chấm ngay bây giờ là chấm ĐỘ TRỄ chứ không chấm hiệu quả. Câu này phải đứng
 *  ngay cạnh con số — nói ở một khối gom cuối màn thì người đọc số không thấy. */
const CHUA_CHOT_NOTE = 'kỳ chưa đóng nên thước này hiện đủ số mà chưa chấm Đạt hay Trượt'

function KpiRow({ k }: { k: KpiReading }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[12.5px]">{k.label}</span>
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              'tnum font-num text-[15px] font-semibold',
              k.value === null && 'text-warning text-[12.5px]',
              k.verdict === 'dat' && 'text-on-tint-success-strong',
              k.verdict === 'can-cai-thien' && 'text-warning',
            )}
          >
            {kpiText(k)}
          </span>
          {k.target !== null && (
            <span className="text-muted-foreground tnum text-[11px]">mục tiêu {targetText(k)}</span>
          )}
          {/* Chưa chốt KHÔNG mượn tông thắng/thua — nó không phải một lời khen
              cũng không phải một lời chê. */}
          {k.verdict === 'chua-chot' && (
            <Badge tone={VERDICT[k.verdict].tone}>{VERDICT[k.verdict].label}</Badge>
          )}
        </span>
      </div>
      <p className="text-muted-foreground text-[10.5px] leading-[1.5]">
        {k.note}
        {k.verdict === 'chua-chot' ? ` · ${CHUA_CHOT_NOTE}` : ''}
        {k.snapshot ? ` · số chụp tại ${dm(DAS_VINA_FROZEN_AT)}` : ''}
      </p>
    </div>
  )
}

/** Bằng chứng — bảng cho thấy con số ở trên đếm từ những dòng nào.
 *  Bảng nằm trên glass-b (luật 8), kể cả khi ngắn. */
function EvidenceBlock({ person }: { person: PersonCard }) {
  if (person.sources) return <SourcesTable rows={person.sources} note={person.sourcesNote} />
  if (person.leads) return <BdLeadsTable rows={person.leads} />
  if (person.deals) return <DealsTable rows={person.deals} />
  return null
}

/** Từng nguồn của Marketing, ĐÃ CẮT THEO KỲ — cả lead lẫn tiền.
 *
 *  Câu hint cũ ("chi phí của một nguồn không chia được theo ngày") đúng cho tới
 *  20/08; giờ mỗi dòng chi mang ngày nên nó chia được, và câu đó thành lời thú
 *  nhận sai. Câu mới đến từ tầng dữ liệu vì nó phải đổi cùng lúc với phép cắt.
 *
 *  Nhãn tiền ở đây khai phạm vi hai lần, cố ý: cột ghi "Chi của nguồn" và câu
 *  dưới tiêu đề nói tiền mua dòng của lô danh sách nằm TRONG số đó nhưng có
 *  mẫu số riêng. Bản trước viết "KHÔNG phải tiền mua dòng" — nghe ra thành hai
 *  thước rời nhau, trong khi fixture chốt `ProspectBatch.cost` là một phần của
 *  `Source.cost`; người đi tìm 31 triệu ở ngoài 300 triệu sẽ không thấy nó.
 *
 *  Phạm vi của bảng là `sourcesOwnedBy(Marketing)` — nguồn ĐỨNG TÊN vai này.
 *  Hai phạm vi cùng nhãn "giá mỗi lead tốt" ở màn khác là "có tiêu tiền" (Kế
 *  hoạch) và "đã chạy đợt" (Chiến dịch); ba tập khác nhau, ba con số khác nhau.
 *
 *  Cột giá hiện DẢI chứ không hiện một con số trần (§6.7): trên cỡ mẫu vài lead
 *  của một tháng, cận trên cách điểm nhiều lần, và cận trên mới là số dùng để
 *  quyết chi tiền.
 *
 *  Cả dòng mở hồ sơ nguồn — sáu mã ở đây đều là nguồn có thật trong sổ nguồn,
 *  nên đường này không hứa gì nó không đưa tới. */
function SourcesTable({ rows, note }: { rows: NonNullable<PersonCard['sources']>; note?: string }) {
  const navigate = useNavigate()

  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <SectionTitle size="sm" hint={note}>
        Nguồn đứng tên Marketing · lead tốt và giá của nó
      </SectionTitle>
      <DataTable
        columns={[
          { header: 'Mã', width: '0.9fr' },
          { header: 'Lead', width: '0.5fr', align: 'right' },
          { header: 'Lead tốt', width: '0.7fr', align: 'right' },
          { header: 'Chi của nguồn', width: '1fr', align: 'right' },
          { header: 'Giá mỗi lead tốt · dải 95%', width: '1.8fr' },
        ]}
        rows={rows.map((r) => ({
          id: r.code,
          onOpen: () => navigate(`/sales/campaigns/${r.code}`),
          cells: [
            <span key="c" className="font-mono text-[11px]">
              {r.code}
            </span>,
            <span key="l" className="tnum font-num">
              {num(r.leads)}
            </span>,
            <span key="g" className="tnum font-num">
              {num(r.good)}
            </span>,
            /* Chi cả kỳ đứng ngay cạnh chi trong kỳ: thiếu nó thì một nguồn 145
               triệu hiện 0 đồng ở tháng 5 đọc như thể nó không tốn gì. */
            <span key="s" className="flex flex-col items-end">
              <Money value={r.cost} scale="table" />
              {r.cost !== r.costWhole ? (
                <span className="text-muted-foreground text-[10.5px]">
                  cả kỳ {millions(r.costWhole)}
                </span>
              ) : null}
            </span>,
            <CostBand
              key="p"
              variant="table"
              point={r.band.point}
              lo={r.band.lo}
              hi={r.band.hi}
              enough={r.enough}
            />,
          ],
        }))}
      />
    </GlassCard>
  )
}

/** Lead BD đã chạm. Cả dòng mở hồ sơ lead — mã ở đây là mã sổ lead, và
 *  `/sales/leads/:code` nhận đúng nó. */
function BdLeadsTable({ rows }: { rows: NonNullable<PersonCard['leads']> }) {
  const navigate = useNavigate()

  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <SectionTitle
        size="sm"
        hint={`"Đã chạm" chứ không phải "đang giữ": lead lên SQL thì đổi chủ sang Sale, nhưng ô bắt buộc do ${BD_NAME} moi vẫn là công của anh.`}
      >
        Lead BD chạm trong kỳ · {num(rows.length)} dòng
      </SectionTitle>
      {rows.length === 0 ? (
        <Empty>Kỳ này BD chưa chạm lead nào.</Empty>
      ) : (
        <DataTable
          columns={[
            { header: 'Công ty', width: '1.6fr' },
            { header: 'Bậc', width: '0.7fr' },
            { header: 'Ô bắt buộc', width: '0.9fr', align: 'right' },
            { header: 'Ngày ở đây', width: '0.9fr', align: 'right' },
          ]}
          rows={rows.map((r) => ({
            id: r.code,
            onOpen: () => navigate(`/sales/leads/${r.code}`),
            cells: [
              r.company,
              <Badge key="t" tone="running">
                {TIER_LABEL.get(r.tier) ?? r.tier}
              </Badge>,
              <span key="s" className="tnum font-num">
                {num(r.requiredFilled)}
              </span>,
              <span key="d" className="tnum font-num">
                {num(r.daysHere)}
              </span>,
            ],
          }))}
        />
      )}
    </GlassCard>
  )
}

/** Đơn đang mở của một Sale.
 *
 *  Dòng mở HỒ SƠ LEAD, không mở "hồ sơ đơn": `routes.tsx` không có màn nào nhận
 *  mã đơn, và lead là chỗ duy nhất kể được câu chuyện của đơn đó. Đơn nào sổ
 *  lead không có dòng trỏ vào thì dòng KHÔNG bấm được — thà một dòng trơ còn
 *  hơn một cú bấm rơi vào màn trống. */
function DealsTable({ rows }: { rows: NonNullable<PersonCard['deals']> }) {
  const navigate = useNavigate()

  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <SectionTitle
        size="sm"
        hint="Quá hạn cột thì đơn tính là đang mục — cùng một phép so của engine, không có ngưỡng thứ hai."
      >
        Đơn đang mở · tốc độ qua cột
      </SectionTitle>
      {rows.length === 0 ? (
        <Empty>Vai này không giữ đơn nào đang mở.</Empty>
      ) : (
        <DataTable
          columns={[
            { header: 'Công ty', width: '1.5fr' },
            { header: 'Cột', width: '1fr' },
            { header: 'Ngày / hạn', width: '0.9fr', align: 'right' },
            { header: 'Giá trị', width: '1.2fr', align: 'right' },
          ]}
          rows={rows.map((r) => ({
            id: r.code,
            onOpen: r.leadCode ? () => navigate(`/sales/leads/${r.leadCode}`) : undefined,
            cells: [
              <span key="n" className="flex items-center gap-2">
                {r.company}
                {r.rotting ? (
                  <Icon icon={TriangleAlert} size={16} className="text-warning" />
                ) : null}
              </span>,
              r.stage,
              <span key="d" className={cn('tnum font-num', r.rotting && 'text-warning')}>
                {num(r.days)}/{num(r.limitDays)}
              </span>,
              <Money key="a" value={r.amount} scale="table" />,
            ],
          }))}
        />
      )}
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------

/** "Số trên màn lấy từ đâu" — khối có tên của khuôn màn.
 *
 *  Màn này có nhiều phép cắt hơn mọi màn khác của nhánh: lứa · ngày xảy ra · số
 *  chụp. Ba phép ấy từng nằm rải trong một câu `hint` dài ở đầu màn và trong
 *  prop `source` của ba biểu đồ — tức người đọc phải ghép lại lấy. Ba gạch đầu
 *  dòng, đọc một lần là xong.
 *
 *  Đây KHÔNG phải khối "Cố tình không làm" quay về: màn vẫn được miễn khối đó
 *  (19/08), và mọi điều bị bỏ vẫn nói tại chỗ. */
function SourceNote() {
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-5 lg:p-6">
      <SectionTitle size="sm" kicker="Số trên màn lấy từ đâu">
        Ba phép cắt, không trộn vào nhau
      </SectionTitle>
      <ul className="text-muted-foreground m-0 flex list-none flex-col gap-2 p-0 text-[12.5px] leading-[1.6]">
        <li>
          <b className="text-foreground font-semibold">Lứa của kỳ</b> — lead vào sổ trong kỳ. Phễu
          và ba ô tỷ lệ đọc trên lứa này, nên mỗi bậc luôn là tập con của bậc trên.
        </li>
        <li>
          <b className="text-foreground font-semibold">Ngày xảy ra</b> — hợp đồng ký, lead ra khỏi
          luồng, ô bắt buộc BD moi được: đếm theo ngày việc đó xảy ra, không theo lứa của lead.
        </li>
        <li>
          <b className="text-foreground font-semibold">Số chụp tại {dm(DAS_VINA_FROZEN_AT)}</b> —
          giá trị đơn đang mở và đơn đang mục. Hai thứ này không có ngày để cắt, nên chúng giữ
          nguyên khi đổi kỳ.
        </li>
      </ul>
    </GlassCard>
  )
}

/** Luật 9 · khối AI có "Căn cứ:", có nút, và có state "Chưa tạo gì cả" ngay dưới
 *  nút. Trợ lý không tự dựng, và bản dựng ra vẫn phải qua người gật.
 *
 *  Hai kết luận trong lời gợi ý — bậc rớt sâu nhất và số người dưới mục tiêu —
 *  đến từ `data/performance.ts`, không tính lại ở đây: chúng là phán xét về số
 *  liệu, và một phán xét tính ở hai chỗ là hai phán xét. */
function AssistantBlock({ data }: { data: Performance }) {
  const [drafted, setDrafted] = useState(false)
  const navigate = useNavigate()
  const o = data.overview

  return (
    <section aria-label="Bước kế của vòng" className="flex flex-col gap-3">
      <AiAction
        suggestion={`Dựng bản tóm tắt ${data.period.label.toLowerCase()} gửi ${HEAD_OF_SALES} — nêu ${num(data.behind)} người đang dưới mục tiêu${data.worstStep ? ` và bậc rớt sâu nhất "${data.worstStep}"` : ''}.`}
        basis={`${num(o.leads)} lead vào sổ · ${num(o.mql)} MQL · ${num(o.sql)} SQL · ${num(o.signedInPeriod)} hợp đồng ký · ${num(o.exited)} lead rời luồng · ${data.period.label}`}
        confirmLabel="Dựng bản tóm tắt"
        done={drafted}
        /* Luật 9 · state "Chưa tạo gì cả" nằm TRONG khối, ngay dưới nút. */
        empty={`Chưa tạo gì cả. Trợ lý chỉ dựng khi có người bấm, và bản dựng ra vẫn phải qua ${HEAD_OF_SALES} trước khi thành báo cáo của phòng.`}
        onConfirm={() => {
          setDrafted(true)
          /* Nối E3 khi có backend: `proposeFromAi` với đúng basis ở trên. Bản
             tóm tắt vào hệ ở trạng thái chờ, không tự gửi cho ai. */
        }}
      />

      {/* Bước "chỉnh" của vòng bốn module. Màn này ĐO; chỗ sửa chỉ tiêu và duyệt
          đề xuất nằm ở module 4, và tới 20/08 không màn nào của module 1–3 mời
          người dùng sang đó — cả vòng đứt đúng ở khớp này. `/sales/plan` có
          thật trong `routes.tsx`, nên nút không hứa gì nó không đưa tới. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="md" onClick={() => navigate('/sales/plan')}>
          Xem kế hoạch của kỳ
          <Icon icon={ArrowRight} size={16} />
        </Button>
        <p className="text-muted-foreground min-w-0 flex-1 text-[12.5px] leading-[1.5]">
          Màn này chỉ đo; chỉ tiêu và đề xuất chỉnh nằm ở Số liệu &amp; kế hoạch.
        </p>
      </div>
    </section>
  )
}

export default PerformancePage
