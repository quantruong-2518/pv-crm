import { CalendarDays, Hash, Linkedin, Mail, MessageCircle, Send } from 'lucide-react'
import { SpecCard } from './chrome/spec-card'
import { ZoneBody, ZoneHeader } from './chrome/zone'
import {
  Avatar,
  Badge,
  type BadgeProps,
  Button,
  ChannelTag,
  Chip,
  Input,
  Kicker,
  MetaPill,
  Money,
  Progress,
  SectionTitle,
  Separator,
  Skeleton,
  Sparkline,
  StatusDot,
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

export function ZoneAtoms() {
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
          footer="h-2 rounded-sm bg-white/10 · số luôn font-num"
        >
          <Progress label="WO-1180" value={0.68} />
          <Progress label="Giao đúng hạn" value={0.86} tone="warning" />
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
      </ZoneBody>
    </section>
  )
}
