import { useState } from 'react'
import { Activity, FileCheck, TriangleAlert, UserMinus, Users, Wallet } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  AiAction,
  AppShell,
  Badge,
  billions,
  Button,
  ContextRail,
  DataTable,
  GlassCard,
  Icon,
  Money,
  percent,
  Skeleton,
  Sparkline,
  StatCard,
  cn,
} from '@pv/ui'
import {
  DAS_VINA_FROZEN_AT,
  dasVina,
  dayISO,
  HEAD_OF_SALES,
  LEAD_TIERS,
} from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { dm } from '@/lib/date'
import {
  performanceQuery,
  railChips,
  type Conversion,
  type ExitRow,
  type Metric,
  type Overview,
  type Performance,
  type RoleCard,
} from '@/data/performance'

/** Module 3 · Performance (docs/kien-truc-san-pham.md · "Năm module Pebble Sales").
 *
 *  Màn trả đúng một câu: ai đang làm được, ai đang tắc. Ba khối theo đúng thứ tự
 *  docs chốt — tổng quan · xét theo vai · top các con số chuyển đổi.
 *
 *  LUẬT CỨNG CỦA MÀN: **không có trục tháng-quý-năm**. Kịch bản DAS Vina là một
 *  LÁT CẮT đóng băng 17/08 · 09:10; dựng trục thời gian thì phải đẻ ra số của
 *  tháng 5, tháng 6, tháng 7 mà không ai ký. Vì thế:
 *
 *   · thẻ số **không có ô delta** — delta là "so với kỳ trước", mà ở đây chỉ có
 *     một kỳ. Phần trăm của mỗi thẻ là so với bậc đầu phễu, và nó nằm ở dòng
 *     `hint` chứ không nhồi vào nhãn — nhãn nói "số này là gì", hint nói "so
 *     với cái gì";
 *   · đường duy nhất trên màn là sparkline **theo sáu bậc phễu**, không theo
 *     thời gian — bậc phễu là số đã chốt nên vẽ được. Đường đó đứng cạnh bảng
 *     "Rớt qua từng bậc phễu" ở khối 3, không đứng trên thẻ số (lý do đầy đủ ở
 *     `OverviewBlock`).
 *
 *  Thước đo của từng vai lấy nguyên từ `CREDIT_RULES`: module 3 chỉ hiển thị,
 *  không tự định nghĩa cách chấm ai. Thước nào fixture chưa có dữ liệu thì màn
 *  nói thẳng "chưa đo được" — xem khối "Cố tình không làm" ở cuối màn.
 *
 *  Số lấy qua `useQuery`, tính hết trong `data/performance.ts`. Màn này không
 *  cộng trừ con số nào, chỉ chọn cách đọc chúng.
 *
 *  State: vai đang xem là chuyện RIÊNG của màn nên giữ ở đây bằng `useState`. */

/** Mọi vai, hay một vai. Không có nhóm trung gian kiểu "chỉ Sale" — muốn so ba
 *  Sale với nhau thì để nguyên "Cả phòng", ba thẻ nằm cạnh nhau. */
const ALL = 'all'

const TIER_LABEL = new Map(LEAD_TIERS.map((t) => [t.key, t.label]))

/** Số nguyên hiện nguyên, số lẻ giữ một chữ số — chuẩn VN, phẩy thập phân (luật 6). */
function num(value: number): string {
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
}

export function PerformancePage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const { data, isPending } = useQuery(performanceQuery)
  const [picked, setPicked] = useState<string>(ALL)

  const period = `${dm(dayISO(0))} → ${dm(DAS_VINA_FROZEN_AT)}`

  return (
    <AppShell
      /* BottomNav chỉ có bốn mục Core; màn nhánh không nằm trong đó nên giữ
         'home' làm mục sáng — người dùng dưới lg vẫn về được Core. */
      activeNav="home"
      approvalsCount={chrome.approvalsCount}
      sidebar={chrome.sidebar}
      topbar={chrome.topbar}
    >
      <div className="flex flex-col gap-5 lg:gap-6">
        <div>
          <h2 className="font-display text-[20px] font-semibold lg:text-[22px]">Performance</h2>
          <p className="text-muted-foreground mt-1 text-[12px]">
            DAS Vina · lát cắt {period} · chốt lúc{' '}
            <span className="font-mono">{DAS_VINA_FROZEN_AT.slice(11, 16)}</span> ngày{' '}
            <span className="font-mono">{dm(DAS_VINA_FROZEN_AT)}</span> · không có trục
            tháng-quý-năm
          </p>
        </div>

        {isPending || !data ? (
          <LoadingBlock />
        ) : (
          <>
            <OverviewBlock o={data.overview} period={period} />
            <RolesBlock
              roles={data.roles}
              overview={data.overview}
              picked={picked}
              onPick={setPicked}
            />
            <ConversionBlock data={data} />
            <AssistantBlock o={data.overview} conversions={data.conversions} />
            <NotDoing />
          </>
        )}
      </div>
    </AppShell>
  )
}

function LoadingBlock() {
  return (
    <GlassCard className="flex flex-col gap-3 p-5 lg:p-6">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------
// Khối 1 · Tổng quan
// ---------------------------------------------------------------------------

/** Sáu ô số của cả phòng. Không ô nào có delta: xem khối chú thích ở đầu file.
 *
 *  ---- Vì sao cả sáu thẻ là `compact`, và vì sao sparkline không còn ở đây ----
 *  Bản trước: thẻ mở đầu mang sparkline phễu nên cao 150px, năm thẻ còn lại chỉ
 *  có đúng một con số và một dòng nhãn. Ô của CSS grid `stretch` theo thẻ cao
 *  nhất trong hàng, nên năm thẻ kia bị kéo cao bằng thẻ đầu và mỗi thẻ thừa ra
 *  một mảng trắng chết — đúng lỗi người dùng chỉ ra trên toàn nhánh Sales.
 *
 *  Hai lối thoát hiển nhiên đều dở. Giữ `hero` cho riêng thẻ đầu thì một thẻ
 *  150px đứng cạnh năm thẻ ~95px, đọc ra như lỗi layout chứ không ra như chủ ý.
 *  Bỏ hẳn sparkline thì mất đường DUY NHẤT màn này được phép vẽ.
 *
 *  Lối thứ ba là trả đường về chỗ nó thuộc về: sparkline vẽ SÁU BẬC PHỄU, mà
 *  sáu bậc phễu chính là nội dung bảng "Rớt qua từng bậc phễu" ở khối 3 — đường
 *  và số của cùng một thứ đứng cạnh nhau thì đọc được, còn đứng trên một thẻ số
 *  của "Lead cả kỳ" thì nó chỉ là hình trang trí. Hàng thẻ ở đây vì thế đồng
 *  đều tuyệt đối và mỗi thẻ cao đúng bằng nội dung của nó.
 *
 *  Lưới đọc theo ĐÚNG ba thiết bị của luật 3, không đẻ điểm gãy thứ tư: mobile
 *  390 → 2 cột · tablet 1024 (`lg`) → 3 cột · desktop 1440 (`xl`) → cả sáu chỉ
 *  số nằm trên MỘT hàng để quét mắt. Sáu cột ở tablet thì ô "Giá trị đang mở"
 *  còn ~126px cho một con số kiểu "18,4 tỷ" — nó xuống dòng, thẻ đó cao hơn năm
 *  thẻ kia, và khoảng trắng chết quay lại bằng cửa sau. */
function OverviewBlock({ o, period }: { o: Overview; period: string }) {
  /* Cả câu, không chỉ con số: "24%" đứng một mình không nói được so với cái gì,
     mà mẫu số ở đây luôn là bậc đầu phễu chứ không phải số lead đang chạy. */
  const share = (n: number) => (o.leads > 0 ? `${percent(n / o.leads)} của đầu mối` : '')

  return (
    <section aria-label="Tổng quan" className="flex flex-col gap-3">
      <h3 className="text-[13px] font-semibold">Tổng quan</h3>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          size="compact"
          icon={Users}
          value={num(o.leads)}
          label="Lead cả kỳ"
          hint={period}
        />
        <StatCard
          size="compact"
          icon={FileCheck}
          value={num(o.signed)}
          label="Hợp đồng đã ký"
          hint={share(o.signed)}
        />
        <StatCard
          size="compact"
          icon={Activity}
          value={num(o.running)}
          label="Lead đang chạy"
          hint={share(o.running)}
        />
        <StatCard
          size="compact"
          icon={UserMinus}
          value={num(o.exited)}
          label="Lead đã ra khỏi luồng"
          hint={share(o.exited)}
        />
        <StatCard
          size="compact"
          icon={Wallet}
          value={billions(o.openValue, 1)}
          label="Giá trị đang mở"
          hint={`${num(o.openDeals)} đơn đang mở`}
        />
        <StatCard
          size="compact"
          icon={TriangleAlert}
          value={num(o.rotting)}
          label="Đơn đang mục"
          hint={`Quá hạn cột · trên ${num(o.openDeals)} đơn đang mở`}
        />
      </div>

      <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
        Phép cân của sổ: {num(o.leads)} đầu mối = {num(o.signed)} đã ký + {num(o.running)} đang chạy
        + {num(o.exited)} đã ra khỏi luồng. Ba phần này không chồng nhau, và không phần nào là số
        của một tháng riêng lẻ.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Khối 2 · Xét theo vai
// ---------------------------------------------------------------------------

function RolesBlock({
  roles,
  overview,
  picked,
  onPick,
}: {
  roles: RoleCard[]
  overview: Overview
  picked: string
  onPick: (key: string) => void
}) {
  const shown = picked === ALL ? roles : roles.filter((r) => r.actorId === picked)

  return (
    <section aria-label="Xét theo vai" className="flex flex-col gap-3">
      <h3 className="text-[13px] font-semibold">Xét theo vai</h3>
      <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
        Mỗi vai đo bằng đúng thứ vai đó làm — thước lấy nguyên từ bảng công trạng, màn này chỉ hiện.
        Đổi thước là việc của module Cấu hình.
      </p>

      <FilterGroup
        label="Vai"
        options={[
          { key: ALL, label: 'Cả phòng' },
          ...roles.map((r) => ({ key: r.actorId, label: r.name })),
        ]}
        active={picked}
        onPick={onPick}
      />

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        {shown.map((card) => (
          <RoleCardView key={card.actorId} card={card} overview={overview} />
        ))}
      </div>
    </section>
  )
}

function RoleCardView({ card, overview }: { card: RoleCard; overview: Overview }) {
  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-semibold">{card.name}</span>
        <Badge>{card.role}</Badge>
      </div>

      {card.note ? (
        <p className="text-[11.5px] leading-[1.5]">
          {card.kind === 'truong-phong' ? <b className="font-semibold">{card.note}</b> : card.note}
        </p>
      ) : null}

      {card.metrics.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {card.metrics.map((m) => (
            <MetricView key={m.label} m={m} />
          ))}
        </div>
      ) : null}

      {/* Vai không có thước cá nhân vẫn phải có số để nhìn — số của phòng. Ô
          trống ở đây sẽ bị đọc thành "chưa làm gì", mà sự thật là "không chấm". */}
      {card.kind === 'truong-phong' ? <DepartmentFacts o={overview} /> : null}

      {card.sources ? <SourcesTable rows={card.sources} /> : null}
      {card.leads ? <BdLeadsTable rows={card.leads} /> : null}
      {card.deals ? <DealsTable rows={card.deals} /> : null}
    </GlassCard>
  )
}

/** Một thước. `value === null` là chưa đo được — nói thẳng chứ không hiện số 0,
 *  vì 0 nghĩa là "đo rồi, kết quả bằng không". */
function MetricView({ m }: { m: Metric }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px]">{m.label}</span>
      {m.value === null ? (
        <span className="text-warning text-[13px] font-semibold">chưa đo được</span>
      ) : m.unit === 'tien' ? (
        <Money value={m.value} scale="table" />
      ) : (
        <span className="tnum font-num text-[18px] font-semibold">
          {m.unit === 'ty-le' ? percent(m.value) : num(m.value)}
        </span>
      )}
      <span className="text-muted-foreground text-[11px] leading-[1.5]">{m.note}</span>
    </div>
  )
}

function DepartmentFacts({ o }: { o: Overview }) {
  const facts = [
    { label: 'Lead cả kỳ', value: num(o.leads) },
    { label: 'Hợp đồng đã ký', value: num(o.signed) },
    { label: 'Giá trị đang mở', value: billions(o.openValue, 1) },
    { label: 'Đơn đang mục', value: num(o.rotting) },
  ]

  return (
    <div className="grid grid-cols-2 gap-4">
      {facts.map((f) => (
        <div key={f.label} className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">{f.label}</span>
          <span className="tnum font-num text-[18px] font-semibold">{f.value}</span>
        </div>
      ))}
    </div>
  )
}

/** Bảng nằm trên glass-b — luật 8, kể cả khi bảng ngắn. */
function SourcesTable({ rows }: { rows: NonNullable<RoleCard['sources']> }) {
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <h4 className="text-[12px] font-semibold">Từng đợt · lead tốt và giá của nó</h4>
      <DataTable
        columns={[
          { header: 'Mã', width: '0.9fr' },
          { header: 'Lead', width: '0.6fr', align: 'right' },
          { header: 'Lead tốt', width: '0.8fr', align: 'right' },
          { header: 'Giá mỗi lead tốt', width: '1.2fr', align: 'right' },
        ]}
        rows={rows.map((r) => ({
          id: r.code,
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
            r.costPerGood === null ? (
              <span key="p" className="text-muted-foreground">
                chưa có lead tốt
              </span>
            ) : (
              <Money key="p" value={r.costPerGood} scale="table" />
            ),
          ],
        }))}
      />
    </GlassCard>
  )
}

function BdLeadsTable({ rows }: { rows: NonNullable<RoleCard['leads']> }) {
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      {/* "Đã chạm", không phải "đang giữ": bảng này là bằng chứng công trạng nên
          kể cả lead đã ra khỏi luồng vẫn đứng đây. Phần tách 12/10/2 nằm ở note
          của thước thứ nhất, ngay phía trên bảng. */}
      <h4 className="text-[12px] font-semibold">Lead BD đã chạm · {num(rows.length)} dòng</h4>
      <DataTable
        columns={[
          { header: 'Công ty', width: '1.6fr' },
          { header: 'Bậc', width: '0.7fr' },
          { header: 'Ô bắt buộc', width: '0.9fr', align: 'right' },
          { header: 'Ngày ở đây', width: '0.9fr', align: 'right' },
        ]}
        rows={rows.map((r) => ({
          id: r.code,
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
    </GlassCard>
  )
}

/** Tốc độ qua cột đọc bằng mắt: số ngày đang nằm so với hạn của cột. Quá hạn thì
 *  đơn tính là đang mục — cùng một phép so của engine, không có ngưỡng thứ hai. */
function DealsTable({ rows }: { rows: NonNullable<RoleCard['deals']> }) {
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <h4 className="text-[12px] font-semibold">Đơn đang mở · tốc độ qua cột</h4>
      <DataTable
        columns={[
          { header: 'Công ty', width: '1.5fr' },
          { header: 'Cột', width: '1fr' },
          { header: 'Ngày / hạn', width: '0.9fr', align: 'right' },
          { header: 'Giá trị', width: '1.2fr', align: 'right' },
        ]}
        rows={rows.map((r) => ({
          id: r.code,
          cells: [
            <span key="n" className="flex items-center gap-2">
              {r.company}
              {r.rotting ? <Icon icon={TriangleAlert} size={16} className="text-warning" /> : null}
            </span>,
            r.stage,
            <span key="d" className={cn('tnum font-num', r.rotting && 'text-warning')}>
              {num(r.days)}/{num(r.limitDays)}
            </span>,
            <Money key="a" value={r.amount} scale="table" />,
          ],
        }))}
      />
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------
// Khối 3 · Top các con số chuyển đổi
// ---------------------------------------------------------------------------

/** Ghi CẢ số tuyệt đối VÀ %. "%" đứng một mình giấu mất mẫu số: 55% nghe khá,
 *  nhưng 11 → 6 thì thấy ngay là mất năm đơn ở bậc cuối. */
function ConversionBlock({ data }: { data: Performance }) {
  return (
    <section aria-label="Top các con số chuyển đổi" className="flex flex-col gap-3">
      <h3 className="text-[13px] font-semibold">Top các con số chuyển đổi</h3>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <GlassCard variant="b" className="flex flex-col gap-3 p-5 lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-[12px] font-semibold">Rớt qua từng bậc phễu</h4>
            {/* Đường DUY NHẤT của màn, và nó chạy theo sáu bậc phễu chứ không
                theo thời gian. Đứng ở đây vì bảng ngay dưới là đúng sáu bậc mà
                đường này vẽ — trên thẻ số "Lead cả kỳ" thì nó không có gì để
                đối chiếu, chỉ tạo ra khoảng trắng cho năm thẻ bên cạnh. */}
            <Sparkline
              points={data.overview.funnelPoints}
              source="Sáu bậc phễu · Kinh doanh"
              tone="primary"
            />
          </div>
          <DataTable
            columns={[
              { header: 'Bậc', width: '1.7fr' },
              { header: 'Số', width: '1fr', align: 'right' },
              { header: 'Tỷ lệ', width: '0.8fr', align: 'right' },
            ]}
            rows={data.conversions.map((c) => ({
              id: `${c.fromLabel}-${c.toLabel}`,
              cells: [
                `${c.fromLabel} → ${c.toLabel}`,
                <Pair key="n" c={c} />,
                <Rate key="r" c={c} />,
              ],
            }))}
          />
          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Cả phễu: {`${num(data.overall.fromCount)} → ${num(data.overall.toCount)}`} ·{' '}
            {percent(data.overall.ratio)} từ {data.overall.fromLabel.toLowerCase()} thành{' '}
            {data.overall.toLabel.toLowerCase()}.
          </p>
        </GlassCard>

        <GlassCard variant="b" className="flex flex-col gap-3 p-5 lg:p-6">
          <h4 className="text-[12px] font-semibold">
            Top lý do rơi · {num(data.exitedTotal)} lead đã ra khỏi luồng
          </h4>
          <DataTable
            columns={[
              { header: 'Lý do', width: '1.9fr' },
              { header: 'Số', width: '0.7fr', align: 'right' },
              { header: 'Tỷ lệ', width: '0.8fr', align: 'right' },
            ]}
            rows={data.exits.map((e) => ({
              id: e.label,
              cells: [e.label, <ExitCount key="n" e={e} />, <ExitShare key="r" e={e} />],
            }))}
          />
          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Mẫu số là {num(data.exitedTotal)} lead đã rơi, không phải {num(data.overall.fromCount)}{' '}
            đầu mối. Sáu lý do là toàn bộ danh sách, không có ô &quot;khác&quot;.
          </p>
        </GlassCard>
      </div>
    </section>
  )
}

const Pair = ({ c }: { c: Conversion }) => (
  <span className="tnum font-num">{`${num(c.fromCount)} → ${num(c.toCount)}`}</span>
)

const Rate = ({ c }: { c: Conversion }) => (
  <span className="tnum font-num font-semibold">{percent(c.ratio)}</span>
)

const ExitCount = ({ e }: { e: ExitRow }) => <span className="tnum font-num">{num(e.count)}</span>

const ExitShare = ({ e }: { e: ExitRow }) => (
  <span className="tnum font-num font-semibold">{percent(e.share)}</span>
)

// ---------------------------------------------------------------------------

/** Luật 9 · khối AI có "Căn cứ:", có nút, và có state "Chưa tạo gì cả" ngay dưới
 *  nút. Trợ lý không tự dựng, và bản dựng ra vẫn phải qua người gật.
 *
 *  Luật 10 · ContextRail dựng thẳng từ E1, màn không tự viết chip. Chuỗi lấy của
 *  đơn LỚN NHẤT đang mở — đó là câu chuyện mà con số của màn này đang nói tới. */
function AssistantBlock({ o, conversions }: { o: Overview; conversions: Conversion[] }) {
  const [drafted, setDrafted] = useState(false)

  /* Không dùng `conversions[0]!`: phễu còn một bậc thì `!` ném TypeError trần.
     Hỏng thì hỏng ở đây, kèm câu nói được vì sao. */
  const firstStep = conversions[0]
  if (!firstStep) throw new Error('Phễu chỉ có một bậc — không có bước rớt nào để trợ lý nêu')
  const worst = conversions.reduce((a, c) => (c.ratio < a.ratio ? c : a), firstStep)

  const rail = railChips(dasVina.graph.story(o.biggestDealCode), o.biggestDealCode)

  return (
    <div className="flex flex-col gap-3">
      <AiAction
        suggestion={`Dựng bản tóm tắt hiệu suất phòng gửi ${HEAD_OF_SALES} — nêu ${num(o.rotting)} đơn đang mục và bậc rớt sâu nhất "${worst.fromLabel} → ${worst.toLabel}".`}
        basis={`${num(o.leads)} lead cả kỳ · ${num(o.signed)} hợp đồng · ${num(o.exited)} lead đã rơi · ${num(o.openDeals)} đơn đang mở`}
        confirmLabel="Dựng bản tóm tắt"
        done={drafted}
        onConfirm={() => {
          setDrafted(true)
          /* Nối E3 khi có backend: `proposeFromAi` với đúng basis ở trên. Bản
             tóm tắt vào hệ ở trạng thái chờ, không tự gửi cho ai. */
        }}
      />
      {drafted ? null : (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Chưa tạo gì cả. Trợ lý chỉ dựng khi có người bấm, và bản dựng ra vẫn phải qua{' '}
          {HEAD_OF_SALES} trước khi thành báo cáo của phòng.
        </p>
      )}

      <ContextRail objects={rail.map((chip) => ({ ...chip, onOpen: () => {} }))} />
      <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
        Chuỗi trên là đơn lớn nhất đang mở, dựng từ đồ thị object — không phải chip viết tay.
      </p>
    </div>
  )
}

/** Khối bắt buộc của mọi màn trong bộ năm module. Thứ bị bỏ phải nói ra, nếu
 *  không lần sau sẽ có người "bổ sung cho đủ" bằng số tự nghĩ. */
function NotDoing() {
  const items = [
    'Không có trục tháng-quý-năm. Kịch bản là một lát cắt đã đóng băng; vẽ đường theo tháng thì phải đẻ số cho những tháng không ai ký. Đường duy nhất trên màn chạy theo sáu bậc phễu, và bậc phễu là số đã chốt.',
    'Không có ô delta trên thẻ số. Delta nghĩa là "so với kỳ trước", mà ở đây chỉ có một kỳ. Phần trăm ở dòng phụ của thẻ là so với bậc đầu của phễu, không phải so với thời gian.',
    'Không đo phản hồi BD trả ngược cho Marketing. Đó là thước thứ ba của vai BD trong bảng công trạng, nhưng sổ lead không ghi lần nào — ô để trống, không điền số gần đúng.',
    'Không đo buổi demo của Presales. Sổ cơ hội không có trường "ai đi cùng buổi demo", nên cả hai thước của vai này chưa có nguồn số.',
    'Không xếp hạng ba Sale thành bảng thứ tự. Ba người ba ngành, quy mô đơn khác nhau; xếp bằng một cột số là so nhầm thứ.',
  ]

  return (
    <GlassCard className="flex flex-col gap-3 p-5 lg:p-6">
      <h3 className="text-[13px] font-semibold">Cố tình không làm</h3>
      <ul className="flex flex-col gap-2">
        {items.map((t) => (
          <li key={t} className="text-muted-foreground text-[11.5px] leading-[1.5]">
            {t}
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

/** Một nhóm nút lọc. Bản sao của `FilterGroup` trong `pages/leads.tsx` — lượt
 *  này chỉ được đụng file của module 3, mà tách ra `@pv/ui` thì phải lên trang
 *  kit cùng lúc. Ghi nợ ở đây: màn thứ hai đã cần, tách khi được đụng cả hai. */
function FilterGroup({
  label,
  options,
  active,
  onPick,
}: {
  label: string
  options: { key: string; label: string }[]
  active: string
  onPick: (key: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      {options.map((o) => (
        <Button
          key={o.key}
          size="sm"
          variant={active === o.key ? 'default' : 'ghost'}
          onClick={() => onPick(o.key)}
          className={cn(active === o.key && 'shadow-primary')}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}

export default PerformancePage
