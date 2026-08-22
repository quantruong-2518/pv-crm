import { useState } from 'react'
import { CalendarDays, Hash, Linkedin, Mail, MessageCircle, Send } from 'lucide-react'
import { SpecCard } from './chrome/spec-card'
import { ZoneBody, ZoneHeader } from './chrome/zone'
import {
  AssistantFab,
  Avatar,
  AvatarGroup,
  Badge,
  type BadgeProps,
  Button,
  ChannelTag,
  Checkbox,
  Chip,
  CostBand,
  type CostBandProps,
  Input,
  Kicker,
  MetaPill,
  Money,
  Progress,
  RadialGauge,
  SectionTitle,
  SegmentedControl,
  Select,
  Separator,
  Skeleton,
  Sparkline,
  StatusDot,
  Textarea,
} from '@pv/ui'

/** Zone 01 · Atoms — không chia nhỏ được nữa, mỗi atom map 1:1 với shadcn/ui. */

const BADGES: Array<{ label: string; tone: BadgeProps['tone'] }> = [
  { label: 'Nháp', tone: 'draft' },
  { label: 'Chờ duyệt', tone: 'warning' },
  { label: 'Đã duyệt', tone: 'success' },
  { label: 'Đang chạy', tone: 'running' },
  { label: 'Hoàn thành', tone: 'success' },
  { label: 'Quá hạn', tone: 'danger' },
  { label: 'Dừng', tone: 'danger' },
]

const STATUS_DOTS = [
  { state: 'ok', text: 'ok — đã xong' },
  { state: 'current', text: 'current — đang chờ anh' },
  { state: 'next', text: 'next — chưa tới' },
  { state: 'bad', text: 'bad — dừng / quá hạn' },
] as const

const TEAM = ['Trần Thu Hà', 'Đỗ Quang Huy', 'Lê Hoàng Nam', 'Vũ Minh Châu', 'Phạm Diệu Anh']

/** Bốn trạng thái của A-21. Số lấy từ ví dụ tính tay — không phải fixture, và
 *  cũng không được là fixture: trang kit là tài liệu của component, không phải
 *  một màn. */
const COST_BANDS: Array<{
  code: string
  caption: string
  band: Pick<CostBandProps, 'point' | 'lo' | 'hi' | 'enough'>
}> = [
  {
    code: 'SK-0103',
    caption: 'bình thường — điểm đứng trên, dải đọc kèm',
    band: { point: 14_000_000, lo: 8_560_000, hi: 28_410_000 },
  },
  {
    code: 'SK-0106',
    caption: 'enough=false — 3 lead tốt, dải lên trước, điểm tụt xuống',
    band: { point: 48_333_333, lo: 23_303_830, hi: 135_264_000, enough: false },
  },
  {
    code: 'CD-0107',
    caption: 'point=null — 0 lead tốt, KHÔNG in 0 ₫',
    band: { point: null, lo: 7_000_000, hi: null, enough: false },
  },
  {
    code: 'CD-0101',
    caption: 'hi=null — dải hở đầu trên',
    band: { point: 6_000_000, lo: 3_518_220, hi: null },
  },
]

export function ZoneAtoms() {
  /* Ba atom cuối là control có trạng thái — bày một bản chết thì không kiểm được
     hai thứ quan trọng nhất của chúng: ô lọc có sáng lên khi khác mặc định
     không, và ô tick có đổi nền không. */
  const [tier, setTier] = useState('all')
  const [picked, setPicked] = useState<string[]>(['Đỗ Quang Huy'])
  const [grain, setGrain] = useState('quy')
  const [fn, setFn] = useState('all')

  return (
    <section id="zone-01" className="pb-2 pt-12">
      <div className="border-t-white/12 border-t pt-10">
        <ZoneHeader
          number="01"
          kicker="Zone 01 · Atoms"
          title="Nguyên tử"
          description="Không chia nhỏ được nữa. Mỗi atom map 1:1 với một component shadcn/ui."
        />
      </div>

      <ZoneBody className="grid grid-cols-3 gap-4">
        {/* A-01 */}
        <SpecCard
          className="col-span-2"
          code="A-01"
          name="Button"
          note="4 variant · 3 size"
          bodyClassName="flex flex-col gap-4 px-4 py-5"
          footer={
            <>
              default → h-10 px-4 rounded-md bg-primary text-primary-foreground shadow-primary
              <br />
              ghost → bg-white/10 · destructive → bg-destructive/20 text-destructive-foreground ·
              nút tablet luôn size lg (≥48px)
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button>Duyệt 128,5 tr</Button>
            <Button variant="secondary">Gửi lại</Button>
            <Button variant="ghost">Xem căn cứ</Button>
            <Button variant="destructive">Từ chối</Button>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm">sm · 32</Button>
            <Button size="md">md · 40</Button>
            <Button size="lg">lg · 48 (tablet)</Button>
            <Button disabled>disabled</Button>
          </div>
        </SpecCard>

        {/* A-02 */}
        <SpecCard
          code="A-02"
          name="Badge"
          note="7 trạng thái"
          bodyClassName="flex flex-wrap gap-2 px-4 py-[18px]"
          footer="text-xs font-semibold px-3 py-1 rounded-sm bg-{state}/20"
        >
          {BADGES.map((badge) => (
            <Badge key={badge.label} tone={badge.tone}>
              {badge.label}
            </Badge>
          ))}
        </SpecCard>

        {/* A-03 */}
        <SpecCard
          code="A-03"
          name="Chip"
          bodyClassName="flex flex-wrap gap-2 px-4 py-[18px]"
          footer="chip nguồn hệ thống dùng bg-accent — bấm được, mở object"
        >
          <Chip>SO-0891</Chip>
          <Chip>K1-A2</Chip>
          <Chip variant="source" onOpen={() => {}}>
            MES · WO-1180
          </Chip>
          <Chip variant="source" onOpen={() => {}}>
            CRM
          </Chip>
        </SpecCard>

        {/* A-04 */}
        <SpecCard
          code="A-04"
          name="Input"
          bodyClassName="flex flex-col gap-2.5 px-4 py-[18px]"
          footer="bg-input h-10 rounded-md focus:ring-2 ring-ring"
        >
          <Input placeholder="Tên khách hàng" readOnly />
          <Input
            defaultValue="Cơ điện Sao Đỏ"
            className="shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]"
            readOnly
          />
          <Input invalid defaultValue="Thiếu mã số thuế" readOnly />
        </SpecCard>

        {/* A-05 */}
        <SpecCard
          code="A-05"
          name="Avatar"
          bodyClassName="flex items-center gap-3 px-4 py-[18px]"
          footer="rounded-md — không rounded-full, hệ này góc sắc"
        >
          <Avatar name="Nguyễn Văn Thắng" size="lg" />
          <Avatar name="Trần Thu Hà" size="md" />
          <Avatar name="Lê Minh Đức" initials="LĐ" size="sm" />
          <div className="text-muted-foreground ml-1 text-[11.5px] leading-[1.6]">
            38 · 30 · 24
            <br />
            viết tắt tên, không ảnh
          </div>
        </SpecCard>

        {/* A-06 */}
        <SpecCard
          code="A-06"
          name="StatusDot"
          bodyClassName="flex flex-col gap-[11px] px-4 py-[18px]"
          footer="size-2 rounded-full · current thêm ring-4 ring-primary/24"
        >
          {STATUS_DOTS.map((dot) => (
            <div key={dot.state} className="flex items-center gap-2.5">
              <StatusDot state={dot.state} />
              <span className="text-muted-foreground text-[12px]">{dot.text}</span>
            </div>
          ))}
        </SpecCard>

        {/* A-07 */}
        <SpecCard
          code="A-07"
          name="Progress"
          bodyClassName="flex flex-col gap-3.5 px-4 py-5"
          footer="h-2 rounded-sm bg-white/10 · số luôn font-num · azure = đang chạy (gradient, tả chuyển động) · warning = dưới đích · success = đã đạt đích (hai tone sau nền phẳng: chỉ số đã đo xong)"
        >
          <Progress label="WO-1180" value={0.68} />
          <Progress label="Giao đúng hạn" value={0.86} tone="warning" />
          <Progress label="38 / 40 lead kỳ vọng" value={0.95} tone="success" />
        </SpecCard>

        {/* A-08 */}
        <SpecCard
          code="A-08"
          name="Skeleton"
          bodyClassName="flex flex-col gap-2.5 px-4 py-5"
          footer="animate-pulse bg-white/10 rounded-sm"
        >
          <Skeleton width="58%" height={11} />
          <Skeleton width="76%" height={30} delay={200} />
          <Skeleton width="42%" height={11} delay={400} />
        </SpecCard>

        {/* A-09 */}
        <SpecCard
          code="A-09"
          name="Separator & Kicker"
          bodyClassName="flex flex-col gap-3.5 px-4 py-5"
          footer="h-px bg-white/8 · kicker: font-mono text-[10.5px] tracking-[.2em] uppercase"
        >
          <Separator />
          <Separator fade />
          <Kicker>Ứng dụng</Kicker>
          <Kicker tone="muted">Hôm nay · 10/08</Kicker>
        </SpecCard>

        {/* A-10 */}
        <SpecCard
          code="A-10"
          name="Money"
          bodyClassName="flex flex-col gap-2.5 px-4 py-[18px]"
          footer="Chuẩn VN: phẩy thập phân, chấm ngăn nghìn · luôn tabular-nums"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground text-[12px]">KPI hero</span>
            <Money value={1_840_000_000} scale="hero" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground text-[12px]">Trong thẻ</span>
            <Money value={128_500_000} />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground text-[12px]">Trong bảng</span>
            <Money value={1_840_000_000} scale="table" />
          </div>
        </SpecCard>

        {/* A-11 */}
        <SpecCard
          code="A-11"
          name="Sparkline"
          bodyClassName="flex flex-col gap-3.5 px-4 py-5"
          footer="86×26 · stroke 1.5 · luôn kèm nhãn nguồn dữ liệu"
        >
          <Sparkline points={[22, 18, 20, 13, 15, 8, 9, 3]} tone="success" source="T8 · CRM" />
          <Sparkline points={[6, 5, 8, 7, 6, 14, 19, 11]} tone="warning" source="24h · MES" />
        </SpecCard>

        {/* A-12 */}
        <SpecCard
          code="A-12"
          name="MetaPill"
          note="ngày · mã · người"
          bodyClassName="flex flex-wrap items-center gap-2 px-4 py-4"
          footer="rounded-sm px-2 py-1 text-[11px] bg-white/9 · mono cho ngày và mã · không bấm được, cần bấm thì dùng Chip"
        >
          <MetaPill icon={CalendarDays} mono>
            18/08 · 09:10
          </MetaPill>
          <MetaPill icon={Hash} mono tone="accent">
            CD-0412
          </MetaPill>
          <MetaPill avatar="Trần Thu Hà">Trần Thu Hà</MetaPill>
          <MetaPill tone="warning">Còn 3 ngày</MetaPill>
          <MetaPill tone="success">Đạt kỳ vọng</MetaPill>
        </SpecCard>

        {/* A-13 */}
        <SpecCard
          code="A-13"
          name="ChannelTag"
          note="icon do app truyền vào"
          bodyClassName="flex flex-col gap-3 px-4 py-4"
          footer="Thư viện không biết Gmail là gì — ánh xạ kênh → icon là bảng của app · iconOnly vẫn phải có title + aria-label"
        >
          <div className="flex flex-wrap items-center gap-2">
            <ChannelTag icon={Mail} label="Gmail" />
            <ChannelTag icon={MessageCircle} label="Zalo OA" tone="accent" />
            <ChannelTag icon={Linkedin} label="LinkedIn" tone="warning" />
          </div>
          <div className="flex items-center gap-2">
            <ChannelTag icon={Mail} label="Gmail" iconOnly />
            <ChannelTag icon={MessageCircle} label="Zalo OA" tone="accent" iconOnly />
            <ChannelTag icon={Send} label="Telegram — chưa nối đường gửi" tone="warning" iconOnly />
            <span className="text-muted-foreground text-[11.5px]">iconOnly · cho ô bảng hẹp</span>
          </div>
        </SpecCard>

        {/* A-14 */}
        <SpecCard
          code="A-14"
          name="SectionTitle"
          note="3 cỡ"
          bodyClassName="flex flex-col gap-5 px-4 py-4"
          footer="lg → font-display 18px (section của form) · md → 14px · sm → 12.5px (tiêu đề thẻ)"
        >
          <SectionTitle
            size="lg"
            kicker="Bước 2"
            hint="Mỗi đợt một nội dung. Ô có dấu sao là bắt buộc."
            actions={<Button size="sm">Thêm đợt</Button>}
          >
            Kế hoạch từng đợt
          </SectionTitle>
          <SectionTitle size="md">Người duyệt</SectionTitle>
          <SectionTitle size="sm">Chỉ số của sự kiện</SectionTitle>
        </SpecCard>

        {/* A-15 */}
        <SpecCard
          code="A-15"
          name="Select"
          note="ô lọc một dòng"
          noteAccent
          bodyClassName="flex flex-wrap items-center gap-3 px-4 py-4"
          footer="select gốc — bàn phím, chạm, tìm theo chữ cái là của trình duyệt · popup lấy màu từ color-scheme: dark · khác mặc định thì ô SÁNG lên"
        >
          <Select
            label="Bậc"
            value={tier}
            onChange={setTier}
            options={[
              { value: 'all', label: 'Tất cả' },
              { value: 'dau-moi', label: 'Đầu mối · 56' },
              { value: 'mql', label: 'MQL · 14' },
              { value: 'sql', label: 'SQL · 30' },
            ]}
          />
          <Select
            label="Ngành"
            size="sm"
            value="chip"
            onChange={() => {}}
            options={[
              { value: 'all', label: 'Tất cả' },
              { value: 'chip', label: 'Chip' },
            ]}
          />
          <span className="text-muted-foreground text-[11.5px]">
            ô bên phải đang lọc khác mặc định
          </span>
        </SpecCard>

        {/* A-16 */}
        <SpecCard
          code="A-16"
          name="Checkbox"
          note="chọn nhiều"
          bodyClassName="flex flex-col gap-1 px-4 py-4"
          footer="input thật nằm dưới sr-only — Space, focus và trình đọc màn hình là của trình duyệt · borderless: chưa tick đọc bằng nền white/12"
        >
          {TEAM.slice(0, 3).map((name) => (
            <Checkbox
              key={name}
              checked={picked.includes(name)}
              onChange={() =>
                setPicked((xs) =>
                  xs.includes(name) ? xs.filter((x) => x !== name) : [...xs, name],
                )
              }
              label={name}
              hint="Sale · chip — ngành khớp với lead"
              trailing={<Avatar name={name} size="sm" />}
            />
          ))}
        </SpecCard>

        {/* A-17 */}
        <SpecCard
          code="A-17"
          name="AvatarGroup"
          note="cụm người trong ô bảng"
          bodyClassName="flex flex-col gap-4 px-4 py-4"
          footer="chồng -ml-2 · tràn thì gộp thành +N và tooltip liệt kê nốt · rê chuột ra tên · danh sách rỗng nói thẳng chứ không để ô trắng"
        >
          <div className="flex items-center gap-4">
            <AvatarGroup names={TEAM.slice(0, 2)} />
            <AvatarGroup names={TEAM} />
            <AvatarGroup names={TEAM} size="md" max={2} />
          </div>
          <AvatarGroup names={[]} />
        </SpecCard>

        {/* A-18 */}
        <SpecCard
          code="A-18"
          name="RadialGauge"
          note="đồng hồ KPI"
          bodyClassName="flex flex-wrap items-center gap-6 px-4 py-5"
          footer="Progress (A-07) là tiến độ NẰM TRONG một dòng; cái này là ô đứng giữa một khối, số lớn ở tâm · vượt mục tiêu vẫn nhận, vòng chạy trọn và phần vượt đọc ở chữ · empty = chưa đo được, không phải 0%"
        >
          <RadialGauge
            size={132}
            tone="success"
            value={1}
            center="100%"
            caption="của mục tiêu kỳ"
            label="Đơn chốt của Đỗ Quang Huy"
          />
          <RadialGauge
            size={132}
            tone="warning"
            value={0.46}
            center="46%"
            caption="của mục tiêu kỳ"
            label="Ô bắt buộc moi được"
          />
          <RadialGauge
            size={132}
            value={0}
            center=""
            empty="chưa đo được"
            label="Buổi demo đi cùng"
          />
        </SpecCard>

        {/* A-19 */}
        <SpecCard
          code="A-19"
          name="SegmentedControl"
          note="2–6 lựa chọn ngang hàng"
          bodyClassName="flex flex-col gap-4 px-4 py-4"
          footer="Select (A-15) giấu lựa chọn cho tới lúc bấm, hợp danh sách dài; cái này để lộ hết, hợp bộ chọn kỳ và bộ lọc vai — thứ người dùng đổi qua đổi lại liên tục · nền chung của nhóm là một tấm mờ để cả nhóm đọc ra như MỘT control"
        >
          <SegmentedControl
            label="Mức kỳ"
            value={grain}
            onChange={setGrain}
            options={[
              { value: 'thang', label: 'Tháng' },
              { value: 'quy', label: 'Quý' },
              { value: 'nam', label: 'Năm' },
            ]}
          />
          <SegmentedControl
            label="Chức năng"
            size="sm"
            value={fn}
            onChange={setFn}
            options={[
              { value: 'all', label: 'Tất cả', count: 7 },
              { value: 'mkt', label: 'Marketing', count: 1 },
              { value: 'bd', label: 'BD', count: 1 },
              { value: 'sale', label: 'Sale', count: 3 },
              { value: 'cs', label: 'CS', count: 0, disabled: true },
            ]}
          />
        </SpecCard>

        {/* A-20 */}
        <SpecCard
          code="A-20"
          name="AssistantFab"
          note="60px · rounded-full"
          bodyClassName="flex items-center justify-center px-4 py-6"
          footer={
            <>
              Một trong hai chỗ duy nhất được dùng rounded-full (luật 5) · icon `orbit`, không
              `sparkles`, không `bot` (luật 15).
              <br />
              AppShell chỉ vẽ nút này khi màn có truyền `onOpenAssistant`. Một nút nổi bấm không ra
              gì thì tệ hơn không có nút — nó hứa một màn chưa tồn tại, trên mọi màn.
            </>
          }
        >
          {/* `static` đè `fixed` của component: ở đây nó là mẫu vật trong thẻ,
              không phải nút thật neo vào góc cửa sổ. */}
          <AssistantFab className="static" />
        </SpecCard>

        {/* A-21 */}
        <SpecCard
          className="col-span-3"
          code="A-21"
          name="CostBand"
          note="không tính gì cả — nhận số đã tính"
          noteAccent
          bodyClassName="grid grid-cols-2 gap-8 px-4 py-5"
          footer={
            <>
              Đúng hai dòng: ô của DataTable cao h-11 (44px), dòng thứ ba là tràn. Thứ tự hai dòng
              nói ai là phần đọc chính — `enough=false` thì ĐẢO, dải lên trên, điểm tụt xuống sau
              nhãn "chưa đủ để so". Không giấu số, chỉ đổi thứ tự nhấn.
              <br />
              `point=null` là 0 lead tốt, không phải 0 đồng — in "0 ₫ mỗi lead tốt" cho một nguồn
              chưa có lead tốt nào là khẳng định nó rẻ nhất sổ. `hi=null` là dải hở đầu trên, đọc
              thành "từ X trở lên".
              <br />
              Hai cận luôn ghi bằng triệu kể cả trong bảng nơi điểm ghi đủ đồng: cận là số ước
              lượng, ghi tới hàng đồng là giả vờ chính xác. Wilson · χ² · cổng đủ mẫu nằm ở
              @pv/engines/stats — thư viện không biết engine.
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <div className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-[.1em]">
              variant table · trong ô DataTable
            </div>
            {COST_BANDS.map((row) => (
              <div key={row.code} className="flex h-11 items-center gap-4">
                <span className="text-muted-foreground w-20 shrink-0 font-mono text-[11px]">
                  {row.code}
                </span>
                <span className="w-48 shrink-0">
                  <CostBand variant="table" {...row.band} />
                </span>
                <span className="text-muted-foreground text-[11px] leading-[1.5]">
                  {row.caption}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-[.1em]">
              variant card · dòng số của StatCard
            </div>
            <div className="grid grid-cols-2 gap-3">
              {COST_BANDS.map((row) => (
                <div key={row.code} className="flex flex-col gap-2 rounded-lg bg-white/5 px-4 py-4">
                  <CostBand variant="card" {...row.band} />
                  <span className="text-muted-foreground text-[12px]">
                    Giá mỗi lead tốt · {row.code}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </SpecCard>

        {/* A-22 */}
        <SpecCard
          code="A-22"
          name="Textarea"
          note="chữ THUẦN — không phải RichText"
          noteAccent
          bodyClassName="flex flex-col gap-3 px-4 py-5"
          footer={
            <>
              Cùng nền, cùng vòng focus, cùng 12,5px với Input (A-04) — ô một dòng và ô nhiều dòng
              phải là một họ, không phải hai kiểu gần giống nhau.
              <br />
              `autoGrow` cao dần theo nội dung: ô nhập phải cuộn trong lúc gõ là ô nhập giấu mất câu
              vừa viết. Cần định dạng (đậm, gạch đầu dòng, ảnh) thì dùng RichText · M-11 — đừng nhét
              HTML vào một ô đáng lẽ là chữ thuần.
            </>
          }
        >
          <Textarea
            readOnly
            rows={3}
            placeholder="Đau ở đâu — việc khách muốn giải…"
            aria-label="Textarea rỗng"
          />
          <Textarea
            readOnly
            autoGrow
            aria-label="Textarea có nội dung"
            value={
              'Không biết một lô chip đang nằm ở đâu cho tới lúc hết ca.\nMuốn nhìn được tiến độ ngay trong ca, không phải sau ca.'
            }
          />
          <Textarea invalid readOnly rows={2} value="Thiếu lý do thua" aria-label="Textarea lỗi" />
        </SpecCard>
      </ZoneBody>
    </section>
  )
}
