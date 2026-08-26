import { useState } from 'react'
import {
  Bell,
  CalendarDays,
  Factory,
  Gauge,
  House,
  Inbox,
  Mail,
  MessageCircle,
  SquareCheckBig,
  Target,
  Users,
} from 'lucide-react'
import { SpecCard } from './chrome/spec-card'
import { ZoneBody, ZoneHeader } from './chrome/zone'
import {
  AiAction,
  ApprovalChain,
  Badge,
  BarChart,
  Button,
  ChannelTag,
  ColumnMap,
  type ColumnMapRow,
  type ColumnMapTarget,
  ContextRail,
  DataTable,
  Dropzone,
  EmptyState,
  GlassCard,
  Kicker,
  LoadingBlock,
  MetaPill,
  millions,
  NavItem,
  NotDoing,
  type NotDoingItem,
  Progress,
  RichText,
  RichTextView,
  ScanField,
  SearchField,
  SectionTitle,
  StatCard,
  StepStrip,
  type StepStripItem,
  type TableColumn,
  TableSkeleton,
  type TableSort,
  Timeline,
  type TimelineItem,
} from '@pv/ui'

/** Zone 02 · Molecules — tầng mang chữ ký của hệ: ContextRail và AIAction. */

const CHAIN = [
  { label: 'Đức ✓ 08:40', state: 'ok' as const },
  { label: 'Anh — đang chờ', state: 'current' as const },
  { label: 'Kế toán Mai', state: 'next' as const },
]

const RAIL = [
  { code: 'HĐ-2607' },
  { code: 'SO-0891' },
  { code: 'MES · WO-1180', source: true },
  { code: 'PO-0455' },
]

const TABLE_COLUMNS: TableColumn[] = [
  { header: 'Hóa đơn', width: '1fr', sortKey: 'code' },
  { header: 'Khách hàng', width: '1.4fr' },
  { header: 'Số tiền', width: '.9fr', align: 'right', sortKey: 'amount' },
  { header: 'Trạng thái', width: '1fr', align: 'right' },
]

const mono = (text: string) => <span className="font-mono">{text}</span>
const amount = (dong: number) => <span className="tnum font-mono">{millions(dong)}</span>

/** Thứ tự là trạng thái của MÀN, không của bảng — kit giữ nó bằng useState để
 *  chứng minh đúng hợp đồng đó: DataTable chỉ vẽ mũi tên và báo cột vừa bấm. */
function TableDemo() {
  const [sort, setSort] = useState<TableSort>({ key: 'amount', dir: 'desc' })
  const onSort = (key: string) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    )

  return (
    <DataTable
      columns={TABLE_COLUMNS}
      sort={sort}
      onSort={onSort}
      rows={[
        {
          id: 'HD-2214',
          onOpen: () => {},
          cells: [
            mono('HD-2214'),
            'Cơ khí Minh Quang',
            amount(520_000_000),
            <Badge tone="danger">Quá hạn 12 ngày</Badge>,
          ],
        },
        {
          id: 'HD-2231',
          state: 'hover',
          cells: [
            mono('HD-2231'),
            'Trường Thịnh',
            amount(370_000_000),
            <Badge tone="danger">Quá hạn 5 ngày</Badge>,
          ],
        },
        {
          id: 'HD-2280',
          state: 'selected',
          onOpen: () => {},
          cells: [
            mono('HD-2280'),
            'Cơ điện Sao Đỏ',
            amount(1_840_000_000),
            <Badge tone="draft">Nháp</Badge>,
          ],
        },
        {
          id: 'GV-0117',
          state: 'hidden',
          cells: [
            mono('GV-0117'),
            'Giá vốn lô hàng Sao Đỏ',
            <span className="font-mono">— — —</span>,
            <span className="text-muted-foreground text-[11px]">Bị ẩn theo quyền của bạn</span>,
          ],
        },
      ]}
    />
  )
}

const WAVES: TimelineItem[] = [
  {
    id: 'w1',
    state: 'ok',
    marker: 'Đợt 1',
    title: 'Thư mời hội thảo',
    meta: (
      <>
        <MetaPill icon={CalendarDays} mono>
          12/08
        </MetaPill>
        <ChannelTag icon={Mail} label="Gmail" />
      </>
    ),
    /* Đợt 1 đã xong (state ok) và chạm kỳ vọng — `success`. Dùng `primary` ở
       đây sẽ đọc thành "đang chạy", sai với chấm bên trái. */
    children: <Progress label="38 / 40 lead kỳ vọng" value={0.95} tone="success" />,
  },
  {
    id: 'w2',
    state: 'current',
    marker: 'Đợt 2',
    title: 'Nhắc lịch cho người đã đăng ký',
    meta: (
      <>
        <MetaPill icon={CalendarDays} mono>
          18/08
        </MetaPill>
        <ChannelTag icon={MessageCircle} label="Zalo OA" tone="accent" />
      </>
    ),
    children: <Progress label="21 / 60 lead kỳ vọng" value={0.35} />,
    actions: (
      <Button size="sm" variant="ghost">
        Xem nội dung đợt
      </Button>
    ),
  },
  {
    id: 'w3',
    state: 'next',
    marker: 'Đợt 3',
    title: 'Gửi tài liệu sau hội thảo',
    meta: (
      <>
        <MetaPill icon={CalendarDays} mono>
          26/08
        </MetaPill>
        <MetaPill icon={Target} tone="warning">
          Chưa soạn nội dung
        </MetaPill>
      </>
    ),
  },
]

/** Nội dung là HTML và người dùng gõ vào chính nó — kit phải giữ state thật,
 *  nếu không ô soạn không chứng minh được gì. */
function RichTextDemo() {
  const [html, setHtml] = useState('<p>Kính gửi anh Đức,</p>')
  return (
    <div className="flex flex-col gap-4">
      <RichText
        value={html}
        onChange={setHtml}
        label="Nội dung đợt 2"
        placeholder="Soạn nội dung gửi cho đợt này"
      />
      {/* Bản chỉ đọc của cùng nội dung — hai khối dùng chung một bộ kiểu, nên
          thứ hiện ra sau khi lưu đúng bằng thứ vừa gõ. */}
      <div className="flex flex-col gap-2">
        <Kicker tone="muted">RichTextView · bản chỉ đọc</Kicker>
        <RichTextView html={html} />
      </div>
    </div>
  )
}

/** Hai mục thật, chép từ khối "Cố tình không làm" của Hồ sơ nguồn — khối này
 *  chứa quyết định chứ không chứa số, nên không neo vào kịch bản nào. */
const NOT_DOING_DEMO: NotDoingItem[] = [
  {
    title: 'Không có bảng lead trên màn này',
    body: 'Lead thuộc module 2. Cùng một dòng lead mà thao tác được ở hai màn thì không màn nào là nơi đúng để tra.',
  },
  {
    title: 'Không có nút "Gửi ngay"',
    body: 'Nút cuối của form là gửi duyệt. Chuỗi duyệt do hệ giữ, và không đợt nào bung ra trước khi có người gật.',
  },
]

/** Năm bước của luồng nhập danh sách (module 1 · Chiến dịch & Sự kiện). */
const IMPORT_STEPS: StepStripItem[] = [
  { key: 'nguon', label: 'Chọn nguồn', hint: 'Apollo.io' },
  { key: 'file', label: 'Tải mẫu / Upload', hint: 'apollo-bacninh.csv' },
  { key: 'khop', label: 'Khớp cột' },
  { key: 'soat', label: 'Soát & khử trùng' },
  { key: 'nhap', label: 'Xác nhận nhập' },
]

/** Bước đang đứng là trạng thái của MÀN — kit giữ bằng useState để chứng minh
 *  đúng hợp đồng đó, và để bấm lùi được về bước đã qua. */
function StepStripDemo() {
  const [current, setCurrent] = useState(2)
  return <StepStrip steps={IMPORT_STEPS} current={current} onGo={setCurrent} />
}

function DropzoneDemo() {
  const [name, setName] = useState<string | undefined>('apollo-bacninh.csv')
  return (
    <>
      <Dropzone
        accept=".csv,.txt"
        fileName={name}
        fileMeta="148 KB · 1.254 dòng · dấu phân tách: chấm phẩy"
        onFile={(file) => setName(file.name)}
        onClear={() => setName(undefined)}
        hint="Kéo file CSV vào đây, hoặc bấm để chọn. Hệ đọc ngay tại máy, không gửi đi đâu."
      />
      <Dropzone
        accept=".csv,.txt"
        fileName="bao-cao-quy-3.xlsx"
        error="File này không phải UTF-8. Mở lại bằng Excel, Lưu thành → CSV UTF-8."
        onFile={() => {}}
      />
    </>
  )
}

const MAP_TARGETS: ColumnMapTarget[] = [
  { value: 'ten_cong_ty', label: 'Tên công ty' },
  { value: 'ma_so_thue', label: 'Mã số thuế' },
  { value: 'tinh', label: 'Tỉnh' },
  { value: 'email', label: 'Email' },
  { value: 'so_nguoi', label: 'Số người' },
  { value: 'bo-qua', label: 'Bỏ qua cột này' },
]

const MAP_ROWS: ColumnMapRow[] = [
  {
    source: 'Company',
    samples: ['DAS Vina', 'Linh kiện Trường Sơn', 'Bán dẫn Nam Sơn'],
    value: 'ten_cong_ty',
  },
  { source: 'State', samples: ['Bắc Ninh', 'Bắc Giang', 'Bắc Ninh'], value: '' },
  {
    source: 'Email',
    samples: ['(trống)', '(trống)', '(trống)'],
    value: 'email',
    warning: '0/3 mẫu có dấu “@” — kiểm lại cột này trước khi sang bước soát.',
  },
  {
    source: '# Employees',
    samples: ['1400', '620', '880'],
    value: 'ten_cong_ty',
    error: 'Ô “Tên công ty” đã có cột Company trỏ vào. Mỗi ô đích nhận đúng một cột.',
  },
]

/** Ánh xạ là trạng thái của màn; ColumnMap chỉ báo người dùng vừa đổi dòng nào. */
function ColumnMapDemo() {
  const [rows, setRows] = useState(MAP_ROWS)
  return (
    <ColumnMap
      rows={rows}
      targets={MAP_TARGETS}
      onChange={(source, value) =>
        setRows((current) => current.map((r) => (r.source === source ? { ...r, value } : r)))
      }
    />
  )
}

export function ZoneMolecules() {
  return (
    <section id="zone-02" className="pb-2 pt-12">
      <div className="border-t-white/12 border-t pt-10">
        <ZoneHeader
          number="02"
          kicker="Zone 02 · Molecules"
          title="Phân tử"
          description="Hai đến bốn atom ghép lại thành một đơn vị có nghĩa nghiệp vụ. Đây là tầng mang chữ ký của hệ — nhất là ContextRail và AIAction."
        />
      </div>

      <ZoneBody className="grid grid-cols-3 gap-4">
        {/* M-01 */}
        <SpecCard
          code="M-01"
          name="StatCard"
          note="hero · compact"
          bodyClassName="flex flex-col gap-3 p-4"
          footer={
            <>
              hero → font-num 42px, h-[150px] CHỈ khi có sparkline (sparkline được mt-auto ghim
              đáy); không có thì cao theo nội dung, không chừa khoảng trắng chết
              <br />
              compact → px-4 py-3, số 26px, thêm dòng hint 11px — cho bảng chỉ số dày
            </>
          }
        >
          <StatCard
            value="890 tr"
            label="Công nợ quá hạn"
            delta={{ direction: 'up', text: '2 hóa đơn', tone: 'danger' }}
            sparkline={{
              points: [20, 19, 16, 17, 11, 10, 6, 4],
              tone: 'danger',
              source: '30d · ERP',
            }}
          />
          <StatCard
            size="compact"
            icon={Target}
            value="34%"
            label="Tỉ lệ MQL"
            hint="21 / 61 lead của đợt đang chạy"
          />
        </SpecCard>

        {/* M-02 */}
        <SpecCard
          code="M-02"
          name="ContextRail"
          note="bắt buộc mọi màn"
          noteAccent
          bodyClassName="flex flex-col gap-3 px-4 py-5"
          footer="flex gap-2 flex-wrap · Chip[] · chip nguồn = bg-accent"
        >
          <ContextRail objects={RAIL.map((o) => ({ ...o, onOpen: () => {} }))} />
          <p className="text-muted-foreground text-[11.5px] leading-[1.7]">
            Dãy chip nối các object của cùng một câu chuyện. Mobile rút gọn còn ≤3 chip.
          </p>
        </SpecCard>

        {/* M-03 */}
        <SpecCard
          code="M-03"
          name="ApprovalChain"
          bodyClassName="px-4 pt-6 pb-5"
          footer="StatusDot[] + Separator + tên người · bước hiện tại luôn text-accent-foreground"
        >
          <ApprovalChain steps={CHAIN} />
        </SpecCard>

        {/* M-04 */}
        <SpecCard
          code="M-04"
          name="SearchField"
          bodyClassName="flex flex-col gap-2.5 px-4 py-[18px]"
          footer="topbar h-10 · màn tìm h-13 · tablet kiosk h-16 text-2xl"
        >
          <SearchField />
          <SearchField size="page" value="sao đỏ" meta="4 nguồn · 0,3 giây" />
        </SpecCard>

        {/* M-05 */}
        <SpecCard
          code="M-05"
          name="ScanField"
          note="tablet"
          bodyClassName="px-4 py-[18px]"
          footer="h-16 font-mono text-[22px] · nút quét 56px · đúng/sai = ring success/destructive + toast"
        >
          <ScanField
            code="L-2608-042"
            state="matched"
            message="✓ Khớp PO-0455 · vị trí đề xuất K1-A2"
          />
        </SpecCard>

        {/* M-06 */}
        <SpecCard
          code="M-06"
          name="NavItem"
          bodyClassName="flex flex-col gap-1 px-3.5 py-[18px]"
          footer="h-[38px] rounded-md · active = bg-accent · badge số dùng bg-destructive · locked = nút tắt + ổ khoá 14 · depth 1 = module trong nhánh, thụt 32px"
        >
          <NavItem icon={House} label="Trang chủ" active />
          <NavItem icon={SquareCheckBig} label="Phê duyệt" count={7} />
          <div className="relative">
            <NavItem icon={Bell} label="Thông báo" className="bg-white/6" />
            <span className="text-muted-foreground pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10.5px]">
              hover
            </span>
          </div>
          <NavItem icon={Factory} label="Factory" locked />
          {/* depth 1 — module NẰM TRONG nhánh ngay trên nó. Nhánh đồng cấp với
              nhánh, module thụt vào một bậc (docs/kien-truc-san-pham.md). */}
          <NavItem icon={Users} label="Kinh doanh" />
          <NavItem icon={Gauge} label="Performance" depth={1} />
        </SpecCard>

        {/* M-07 */}
        <SpecCard
          className="col-span-2"
          code="M-07"
          name="TableRow"
          note="dòng bấm được · header sắp xếp được"
          bodyClassName="px-4 py-3.5"
          footer={
            <>
              h-11 · divide-white/6 · hover:bg-white/5 · selected = shadow-[inset_2px_0_0]
              shadow-primary + bg-primary/10
              <br />
              row.onOpen → cả dòng mở object: cursor-pointer · hover:bg-white/8 + hover:shadow-card
              · tabIndex 0 · Enter và Space
              <br />
              col.sortKey → header thành nút, mũi tên ArrowUp/ArrowDown, mờ khi chưa sort theo cột
              đó
              <br />
              Bảng luôn nằm trên .glass-b, không bao giờ .glass-a
            </>
          }
        >
          <TableDemo />
        </SpecCard>

        {/* M-08 */}
        <SpecCard
          code="M-08"
          name="EmptyState"
          bodyClassName="px-4 py-6"
          footer="Luôn 1 icon + 1 câu hướng dẫn + 1 nút. Không bao giờ chỉ có chữ “Không có dữ liệu”."
        >
          <EmptyState
            icon={Inbox}
            message="Chưa có yêu cầu nào chờ anh. Việc mới sẽ hiện tại đây kèm thông báo Zalo."
            action={{ label: 'Xem lịch sử duyệt' }}
          />
        </SpecCard>

        {/* M-09 */}
        <SpecCard
          className="col-span-2"
          code="M-09"
          name="AIAction"
          note="chữ ký của hệ"
          noteAccent
          bodyClassName="p-4"
          footer={
            <>
              Luật cứng: luôn có dòng “Căn cứ: …”, luôn chờ nút, và luôn có “Chưa tạo gì cả” ngay
              dưới nút. AI không bao giờ tự thực hiện.
              <br />
              `empty` là prop BẮT BUỘC — dòng đó không phải việc của màn, nếu không màn nào cũng
              chép lại và có màn quên.
              <br />
              bg-gradient-to-r from-primary/22 to-primary/6 + hatch overlay · ring-0 ·
              shadow-[0_12px_30px_theme(primary/14)]
            </>
          }
        >
          <AiAction
            suggestion="Trợ lý đề xuất: duyệt PO-0455 hôm nay và chuyển 30% khối lượng WO-1180 sang CNC-05 → kịp giao 22/08, dư 1 ngày."
            basis="tồn kho K1-A2 · năng lực xưởng X1 · hợp đồng SO-0891."
            empty="Chưa tạo gì cả. Trợ lý chỉ chuyển khối lượng khi có người bấm, và lệnh chuyển vẫn phải qua chuỗi duyệt."
            onConfirm={() => {}}
            onInspect={() => {}}
          />
        </SpecCard>

        {/* M-10 */}
        <SpecCard
          code="M-10"
          name="Timeline"
          note="chuỗi đợt"
          bodyClassName="px-4 py-5"
          footer={
            <>
              Cùng ngôn ngữ với ApprovalChain (chấm + đường nối) nhưng chạy dọc và mỗi mốc mang được
              meta, số liệu, nút.
              <br />
              Đường nối bg-white/8 rộng 1px — không border (luật 4) · mốc cuối không kéo đường xuống
              <br />
              Marker (&ldquo;Đợt 2&rdquo;) là NHÃN nên dùng thẳng Kicker tone muted, không tô azure:
              trạng thái đã do StatusDot nói, và azure chỉ dành cho AI · nút chính · trạng thái
              active (luật 3)
            </>
          }
        >
          <Timeline items={WAVES} />
        </SpecCard>

        {/* M-11 */}
        <SpecCard
          className="col-span-2"
          code="M-11"
          name="RichText"
          note="mức POC"
          bodyClassName="px-4 py-5"
          footer={
            <>
              contentEditable + document.execCommand — không thêm dependency. Chỗ để thay bằng
              editor thật, giữ nguyên hợp đồng props.
              <br />
              Đậm · nghiêng · gạch đầu dòng · chèn ảnh (data URL) · xem và sửa HTML thô. Chỉ đồng bộ
              innerHTML khi ô không focus, nếu không con trỏ nhảy về đầu mỗi ký tự.
              <br />
              Placeholder dùng text-glass-foreground chứ không phải màu chữ phụ — ô soạn nằm trên ba
              lớp trắng chồng nhau, muted-foreground trên nền đó chỉ còn 3,87:1 (luật 13)
            </>
          }
        >
          <RichTextDemo />
        </SpecCard>

        {/* M-12 */}
        <SpecCard
          className="col-span-2"
          code="M-12"
          name="BarChart"
          note="cột dọc · thanh ngang"
          bodyClassName="grid grid-cols-2 gap-6 px-4 py-5"
          footer={
            <>
              Sparkline (A-11) vẽ hình dáng một chuỗi trong 86px và không đọc được từng mốc. Khi mỗi
              mốc là một con số phải so với nhau thì cần cột, và cột mang theo số của nó.
              <br />
              Hai hướng vì hai loại nhãn: nhãn thời gian ngắn xếp dưới cột dọc, nhãn bậc dài phải
              nằm ngang. `onSelect` biến cột thành nút — đồ thị kiêm luôn bộ chọn kỳ. Nhãn nguồn dữ
              liệu bắt buộc, cùng luật với Sparkline.
            </>
          }
        >
          <BarChart
            height={96}
            source="Lead vào sổ theo tháng · bấm một cột để xem tháng đó"
            data={[
              { key: 't5', label: 'T5', value: 43, display: '43' },
              { key: 't6', label: 'T6', value: 41, display: '41' },
              { key: 't7', label: 'T7', value: 12, display: '12', active: true },
              { key: 't8', label: 'T8', value: 4, display: '4' },
            ].map((d) => ({ ...d, onSelect: () => {} }))}
          />
          <BarChart
            orientation="bar"
            max={100}
            source="Mốc đời lead · Sổ lead 100 dòng"
            data={[
              { key: 'a', label: 'Lead vào sổ', value: 100, display: '100', note: 'đầu phễu' },
              {
                key: 'b',
                label: 'MQL — công ty thật',
                value: 44,
                display: '44',
                note: '44% của bậc trên',
              },
              {
                key: 'c',
                label: 'SQL — vào sổ cơ hội',
                value: 30,
                display: '30',
                note: '68% của bậc trên',
              },
              {
                key: 'd',
                label: 'Hợp đồng',
                value: 6,
                display: '6',
                note: '20% của bậc trên',
                tone: 'success' as const,
              },
            ]}
          />
        </SpecCard>

        {/* M-13 */}
        <SpecCard
          className="col-span-3"
          code="M-13"
          name="StepStrip"
          note="đi lùi được · đi tới phải qua cửa"
          noteAccent
          bodyClassName="px-4 py-5"
          footer={
            <>
              Dải bước ở đầu màn của một luồng nhiều bước. Bước đã qua là nút bấm lùi được; bước
              chưa tới render bằng span, KHÔNG phải nút tắt — nút tắt vẫn hứa “sắp bấm được”.
              <br />
              Ô bấm min-h-12 (48px) cho ngưỡng chạm tablet · bước đang đứng bg-primary/16 +
              text-accent-foreground + aria-current=&ldquo;step&rdquo;
              <br />
              Component không giữ bước đang đứng — `current` là trạng thái của màn.
            </>
          }
        >
          <StepStripDemo />
        </SpecCard>

        {/* M-14 */}
        <SpecCard
          code="M-14"
          name="Dropzone"
          note="4 trạng thái"
          bodyClassName="flex flex-col gap-4 px-4 py-5"
          footer={
            <>
              trống · đang kéo vào · đã có file · lỗi. Trạng thái “đang kéo vào” do component tự giữ
              (chuyện của con trỏ), ba cái kia do màn truyền. Lỗi thắng mọi trạng thái khác.
              <br />
              POC không upload: component chỉ đưa File ra, màn tự đọc bằng FileReader tại máy.
              <br />
              Control thật là input file trong label (sr-only) — mặt nút là span aria-hidden, vì một
              button thật nằm trong label sẽ nuốt cú bấm và hộp chọn file không mở.
              <br />
              Chữ phụ dùng text-glass-foreground chứ không phải màu chữ phụ — cả bốn mặt đều là nền
              đã nhuộm trong glass-a, muted-foreground trên đó chỉ còn 3,82–4,46:1 (luật 13)
            </>
          }
        >
          <DropzoneDemo />
        </SpecCard>

        {/* M-15 */}
        <SpecCard
          className="col-span-2"
          code="M-15"
          name="ColumnMap"
          note="cột file → ô hệ"
          bodyClassName="px-4 py-5"
          footer={
            <>
              Trái là cột như nó nằm trong file người dùng + ba giá trị mẫu thật; phải là Select
              (A-15) trỏ vào ô đích của hệ. Danh mục ô đích do MÀN truyền — thư viện không biết 15
              cột chuẩn của module nào.
              <br />
              “Chưa chọn” khác “Bỏ qua cột này”: ô rỗng là chưa ai quyết, bỏ qua là một lựa chọn.
              <br />
              Không chứa khối AI. Đề nghị ánh xạ cả bộ là một AiAction (M-09) đặt phía trên bảng, ở
              đó “Căn cứ:” và nút xác nhận đã bị cưỡng chế ở tầng kiểu (luật 9).
              <br />
              Bảng nằm trên .glass-b, component không tự vẽ mặt kính — cùng hợp đồng với TableRow.
            </>
          }
        >
          <ColumnMapDemo />
        </SpecCard>

        {/* M-16 */}
        <SpecCard
          code="M-16"
          name="LoadingBlock"
          note="cao bằng nội dung thật"
          noteAccent
          bodyClassName="flex flex-col gap-4 px-4 py-5"
          footer={
            <>
              `height` BẮT BUỘC, không có mặc định: không con số nào đoán đúng cho mọi khối, mà
              khung chờ lệch chiều cao thì màn giật một nhịp lúc dữ liệu về.
              <br />
              `height` là cao của MỘT dải · `lines` xếp thêm dải cùng cỡ, cách nhau 12px. Hai khối
              cao khác nhau là hai LoadingBlock.
              <br />
              Lệch pha 200ms mỗi dải — A-08 hứa nhịp đó từ bản chốt 10/08 mà chưa chỗ nào dùng: ba
              dải nhấp nháy đồng loạt đọc như một khối chết.
              <br />
              role=&ldquo;status&rdquo; + một câu ẩn: dải là aria-hidden, không có câu đó thì lúc
              chờ trình đọc màn hình ra im lặng, không phân biệt được với màn rỗng.
            </>
          }
        >
          <div className="flex flex-col gap-2">
            <Kicker>một dải · height 96</Kicker>
            <LoadingBlock height={96} />
          </div>
          <div className="flex flex-col gap-2">
            <Kicker>hai dải · height 40</Kicker>
            <LoadingBlock height={40} lines={2} />
          </div>
          <div className="flex flex-col gap-2">
            <Kicker>khung chờ của một tiêu đề · width 256px</Kicker>
            <LoadingBlock height={44} width="256px" />
          </div>
        </SpecCard>

        {/* M-17 */}
        <SpecCard
          className="col-span-2"
          code="M-17"
          name="TableSkeleton"
          note="rows × 44 + 19"
          bodyClassName="px-4 py-5"
          footer={
            <>
              Ba màn đang gõ tay ba `Skeleton h-11` trong một flex-col gap-3 — cao hơn bảng thật
              24px, và cả dòng tô kín đọc thành biểu đồ cột nằm ngang. Ở đây một dòng là hộp cao
              `rowHeight` chứa một vạch chữ 11px, đúng cách DataTable đặt chữ trong ô `h-11`.
              <br />
              Tổng cao = rows × rowHeight, cộng 19px nếu có dải tiêu đề (vạch 11 + đệm 8, đúng
              `pb-2` của header thật). Bảng nào đổi chiều cao dòng thì truyền `rowHeight` —
              component không đọc được bảng đứng cạnh nó.
              <br />
              Không tự vẽ mặt kính: bảng và khung chờ của bảng đều nằm trong GlassCard
              variant=&ldquo;b&rdquo; của màn (luật 8).
            </>
          }
        >
          <GlassCard variant="b" className="flex flex-col gap-4 p-5">
            <SectionTitle size="sm" kicker="Đang chờ" hint="Khung chờ đúng chỗ bảng sẽ mọc lên.">
              Sổ nguồn
            </SectionTitle>
            <TableSkeleton header rows={3} />
          </GlassCard>
        </SpecCard>

        {/* M-18 */}
        <SpecCard
          code="M-18"
          name="NotDoing"
          note="nền quyết màu chữ"
          noteAccent
          bodyClassName="flex flex-col gap-4 px-4 py-5"
          footer={
            <>
              Khối &ldquo;Cố tình không làm&rdquo;: một mục là một quyết định, kèm lý do. Không nói
              ra thì người soát đọc chúng thành nợ, và lần sau có người sửa đúng cái vừa được quyết.
              <br />
              `surface` quyết luôn màu chữ phụ, màn không chọn được. Trong InsetPanel là LỚP TRẮNG
              THỨ HAI, ở đó --muted-foreground chỉ còn ~4,19:1 nên phải là --glass-foreground — luật
              13, không phải gu. Đi trần hoặc trên GlassCard thì --muted-foreground đủ.
              <br />
              Quá 3 mục thì tự xếp hai cột từ lg. Gom từ ba bản rời trên màn: Hồ sơ nguồn 3 mục ·
              Kho danh sách 6 mục · Kế hoạch 4 mục.
            </>
          }
        >
          <div className="flex flex-col gap-2">
            <Kicker>surface=&ldquo;inset&rdquo; · trong một thẻ</Kicker>
            <GlassCard className="p-4">
              <NotDoing surface="inset" items={NOT_DOING_DEMO} />
            </GlassCard>
          </div>
          <div className="flex flex-col gap-2">
            <Kicker>surface=&ldquo;card&rdquo; · khối cuối màn</Kicker>
            <NotDoing surface="card" items={NOT_DOING_DEMO} />
          </div>
        </SpecCard>
      </ZoneBody>
    </section>
  )
}
