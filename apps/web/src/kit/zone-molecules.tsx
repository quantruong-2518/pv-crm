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
} from '@pv/ui'
import { SpecCard } from './chrome/spec-card'
import { ZoneBody, ZoneHeader } from './chrome/zone'
import {
  AiAction,
  ApprovalChain,
  Badge,
  BarChart,
  Button,
  ChannelTag,
  ContextRail,
  DataTable,
  EmptyState,
  FileDrop,
  Kicker,
  MetaPill,
  millions,
  NavItem,
  Progress,
  RichText,
  RichTextView,
  ScanField,
  SearchField,
  StatCard,
  Stepper,
  type TableColumn,
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

  /* Which row is open is the SCREEN's state too — `details` is present or it is
     not, and the table has no `expanded` flag of its own to disagree with. */
  const [open, setOpen] = useState<string | null>('HD-2214')

  return (
    <DataTable
      columns={TABLE_COLUMNS}
      sort={sort}
      onSort={onSort}
      rows={[
        {
          id: 'HD-2214',
          onOpen: () => setOpen((cur) => (cur === 'HD-2214' ? null : 'HD-2214')),
          ...(open === 'HD-2214'
            ? {
                details: (
                  <p className="text-muted-foreground px-1 text-[12px] leading-[1.65]">
                    Khối bung ra chiếm trọn bề ngang bảng, nằm ngoài lưới cột — chỗ cho một danh
                    sách con, một đoạn giải thích, hay bảng người nhận của một đợt gửi.
                  </p>
                ),
              }
            : {}),
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

/** Bấm một chip đã qua để lùi lại — chứng minh `onGo` đổi state của MÀN,
 *  Stepper chỉ vẽ lại theo `current` nó nhận vào.
 *
 *  Two pieces of state, not one, and the second is the whole point of the demo:
 *  press back to step 2 and step 3 stays clickable, because `reached` remembers
 *  that it was opened. Holding only `current` here would reproduce on the kit
 *  page the exact dead end the prop exists to end — see `StepperProps.reached`. */
function StepperDemo() {
  const [current, setCurrent] = useState(2)
  const [reached, setReached] = useState(2)
  const go = (next: number) => {
    setCurrent(next)
    setReached((furthest) => Math.max(furthest, next))
  }

  return (
    <Stepper
      steps={[
        { key: 'info', label: 'Thông tin' },
        { key: 'contact', label: 'Liên hệ' },
        { key: 'content', label: 'Nội dung' },
        { key: 'confirm', label: 'Xác nhận' },
      ]}
      current={current}
      reached={reached}
      onGo={go}
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
              compact → nhãn uppercase · số 30px · nguồn, icon 64px chìm dưới nền
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
            source="21 / 61 lead · Sổ lead đợt đang chạy"
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
            <span className="text-muted-foreground pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9.5px]">
              hover
            </span>
          </div>
          <NavItem icon={Factory} label="Factory" locked />
          {/* depth 1 — module NẰM TRONG nhánh ngay trên nó. Nhánh đồng cấp với
              nhánh, module thụt vào một bậc. */}
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
          className="col-span-2"
          code="M-13"
          name="FileDrop"
          note="sáu đường vào, không phải một"
          noteAccent
          bodyClassName="px-4 py-5"
          footer={
            <>
              Kéo-thả · bấm cả tấm · nút thật (tab tới được) · Ctrl+V dán bảng từ Excel · slot
              `hint` cho link tải tệp mẫu · trình duyệt không có kéo-thả thì bốn đường sau vẫn chạy.
              Một vùng chỉ nhận kéo-thả là vùng chết với bàn phím, trình đọc màn hình và iPad.
              <br />
              KHÔNG viền đứt — luật 4. Nghỉ là mặt tối phẳng, đang kéo vào thì đổi sang mặt azure
              của khối AI (`.glass-ai`). Lỗi đuôi/cỡ/nhiều tệp hiện TRONG khung, không bắn toast:
              chỗ sửa nằm ngay đây.
            </>
          }
        >
          <FileDrop
            accept={['.csv', '.tsv', '.xlsx']}
            maxBytes={5 * 1024 * 1024}
            onPick={() => {}}
            onPasteText={() => {}}
            hint="Tải tệp mẫu — một dòng tiêu đề, một dòng ví dụ"
          />
        </SpecCard>

        {/* M-14 */}
        <SpecCard
          className="col-span-2"
          code="M-14"
          name="Stepper"
          note="điều hướng form nhiều bước"
          bodyClassName="px-4 py-5"
          footer={
            <>
              Khác ApprovalChain (M-03): chuỗi đó đọc trạng thái duyệt do E3 giữ, còn Stepper điều
              hướng — bước đã qua bấm được (tick success), bước đang mở nền accent, bước chưa tới
              không bao giờ bấm được.
              <br />
              Dưới 640px rút gọn còn một dòng &ldquo;Bước n/N · nhãn&rdquo;, không bấm lùi được ở
              dạng rút gọn.
            </>
          }
        >
          <StepperDemo />
        </SpecCard>
      </ZoneBody>
    </section>
  )
}
