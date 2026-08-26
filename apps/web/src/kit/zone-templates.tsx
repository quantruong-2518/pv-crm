import { useState } from 'react'
import { Bell, CalendarDays, House, Megaphone, Package, SquareCheckBig, Users } from 'lucide-react'
import { SpecCard } from './chrome/spec-card'
import { ZoneBody, ZoneHeader } from './chrome/zone'
import {
  AppShell,
  Badge,
  Button,
  ContextRail,
  Drawer,
  GlassCard,
  MetaPill,
  PageHeader,
  cn,
} from '@pv/ui'

/** Zone 04 · Templates — ba thiết bị là ba vai, không phải một layout co giãn.
 *  T-01/02/03 là bản vẽ khung; T-04 và T-05 là component SỐNG. */

/** Nav mẫu cho T-05 — đủ để thấy hai tầng, không phải bộ mục thật của app. */
const SHELL_HEADER = {
  product: 'PV One',
  org: 'Thắng Lợi',
  user: { name: 'Nguyễn Văn Thắng' },
  search: { placeholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' },
  core: [
    { icon: House, label: 'Trang chủ', active: true },
    { icon: SquareCheckBig, label: 'Phê duyệt', count: 7 },
    { icon: Bell, label: 'Thông báo', locked: true },
  ],
  apps: [
    { icon: Users, label: 'Kinh doanh', active: true },
    { icon: Package, label: 'Cung ứng', locked: true },
  ],
}

/** Rail mẫu cho T-06 — chuỗi object của một câu chuyện, dựng thẳng từ E1 khi ở
 *  màn thật. Ở đây là mã tĩnh, đủ để thấy rail đứng thành hàng riêng. */
const RAIL_DEMO = [{ code: 'CD-0101', source: true }, { code: 'DS-0108' }, { code: 'L-2608-042' }]
const RAIL_DETAIL = [{ code: 'CD-0101', source: true }, { code: 'Đợt 3' }, { code: 'DS-0108' }]

/* T-01/02/03 là BẢN VẼ TỈ LỆ của ba khung màn, không phải màn thật. Chú thích
   bên trong khung ("232", "topbar 64", "status 44") in ở 7,5 · 9 · 9,5px —
   ngoài thang 9 bậc, và cố ý: đây là "cỡ ngoài thang có lý do" của §8.1 điều 14.
   Lý do: chúng là số đo ghi trên một bản vẽ đã thu nhỏ, cùng vai với con số
   ghi cạnh đường kích thước trong bản vẽ kỹ thuật. Kéo chúng lên bậc 9 (10,5px)
   thì chữ to hơn cái ô nó đang chú thích, và bản vẽ hết đọc được.
   Mọi chữ THẬT của trang này — tên thẻ, note, footer, nhãn — vẫn trong thang. */
const frame =
  'h-[270px] rounded-md bg-[color-mix(in_srgb,var(--background)_70%,transparent)] shadow-[inset_0_0_0_1px_rgb(255_255_255/.07)]'
const slot = 'rounded-[2px] bg-white/7'
const accentSlot =
  'flex items-center justify-center rounded-[2px] bg-primary/20 font-mono text-[9.5px] text-accent-foreground'

/** Kích thước khung trong Zone 04 là bản vẽ tỉ lệ, cố ý không thuộc thang 8 bậc. */
export function ZoneTemplates() {
  /* T-04 là component SỐNG, không phải bản vẽ khung như ba cái trên: panel đóng
     thì không có gì để nhìn, nên nó phải mở được ngay trên trang kit. */
  const [open, setOpen] = useState(false)

  return (
    <section id="zone-04" className="pb-2 pt-12">
      <div className="border-t-white/12 border-t pt-10">
        <ZoneHeader
          number="04"
          kicker="Zone 04 · Templates"
          title="Khung màn"
          description="Ba thiết bị là ba vai, không phải một layout co giãn. Vẽ đúng kích thước tuyệt đối này."
        />
      </div>

      <ZoneBody className="grid grid-cols-[1.6fr_1.2fr_.8fr] items-start gap-4">
        {/* T-01 */}
        <SpecCard
          code="T-01"
          name="Desktop"
          note={
            <span className="font-num text-[13px] font-semibold tracking-[-.3px]">1440 × 900</span>
          }
          bodyClassName="px-4 py-5"
          footer={
            <>
              12 cột · gutter 24 · margin 32 · sidebar 232 · topbar 64
              <br />
              Bento 4 cột, gap 16, ô cao 150 — mỗi dashboard đúng 1 ô hero 2×2
            </>
          }
        >
          <div className={cn(frame, 'relative flex overflow-hidden')}>
            <div className="bg-primary/16 text-accent-foreground flex w-[70px] items-end justify-center pb-2 font-mono text-[9.5px]">
              232
            </div>
            <div className="flex flex-1 flex-col p-2.5">
              <div className="bg-white/7 text-muted-foreground flex h-5 items-center justify-end rounded-[2px] pr-1.5 font-mono text-[9px]">
                topbar 64
              </div>
              <div className="mt-2 grid flex-1 grid-cols-4 grid-rows-2 gap-1.5">
                <div className={cn(accentSlot, 'bg-primary/22 col-span-2 row-span-2')}>
                  hero 2×2
                </div>
                <div className={slot} />
                <div className={slot} />
                <div className={slot} />
                <div className={slot} />
              </div>
              <div className={cn(accentSlot, 'mt-2 h-6')}>AIAction</div>
            </div>
          </div>
        </SpecCard>

        {/* T-02 */}
        <SpecCard
          code="T-02"
          name="Tablet"
          note={
            <span className="font-num text-[13px] font-semibold tracking-[-.3px]">1024 × 768</span>
          }
          bodyClassName="px-4 py-5"
          footer={
            <>
              8 cột · gutter 20 · margin 28 · header 72
              <br />
              Kiosk full màn · nút ≥48 · có nút “Tương phản cao”
            </>
          }
        >
          <div className={cn(frame, 'flex flex-col p-3')}>
            <div className="bg-white/7 text-muted-foreground flex h-[26px] items-center rounded-[2px] px-2 font-mono text-[9px]">
              header 72 · không sidebar
            </div>
            <div className="mt-2.5 grid flex-1 grid-cols-2 grid-rows-2 gap-2">
              <div className={slot} />
              <div className={slot} />
              <div className={slot} />
              <div className={slot} />
            </div>
            <div className={cn(accentSlot, 'mt-2.5 h-6')}>ticker trợ lý</div>
          </div>
        </SpecCard>

        {/* T-03 */}
        <SpecCard
          code="T-03"
          name="Mobile"
          note={
            <span className="font-num text-[13px] font-semibold tracking-[-.3px]">390 × 844</span>
          }
          bodyClassName="flex justify-center px-4 py-5"
          footer={
            <>
              4 cột · gutter 16 · margin 16
              <br />
              Nav 4 mục: Trang chủ · Duyệt · Tìm · Trợ lý
              <br />
              Safe-area dưới 34
            </>
          }
        >
          <div className={cn(frame, 'flex w-[132px] flex-col rounded-lg p-2')}>
            <div className="text-muted-foreground flex h-3 items-center justify-center font-mono text-[7.5px]">
              status 44
            </div>
            <div className="mt-1 flex flex-1 flex-col gap-1.5">
              <div className="bg-primary/22 h-[52px] rounded-[2px]" />
              <div className={cn(slot, 'h-10')} />
              <div className={cn(slot, 'h-10')} />
            </div>
            <div className="bg-white/9 text-muted-foreground flex h-[26px] items-center justify-center rounded-[2px] font-mono text-[7.5px]">
              bottom nav 84
            </div>
            <div className="h-2" />
          </div>
        </SpecCard>

        {/* T-04 */}
        <SpecCard
          className="col-span-3"
          code="T-04"
          name="Drawer"
          note="panel phải · md 560 / lg 760"
          bodyClassName="flex flex-wrap items-center gap-4 px-4 py-5"
          footer={
            <>
              Cùng hình dạng với màn 04 · Trợ lý AI: panel phải, tấm che `--scrim`. Dưới `sm` panel
              chiếm cả bề ngang — 560px trên màn 390px là panel bị cắt.
              <br />
              Đóng bằng Escape, bằng nút X, hoặc bấm ra tấm che. Mở thì tiêu điểm nhảy vào panel,
              nếu không Tab kế tiếp đi thẳng vào phần đang bị che. Đóng thì KHÔNG render gì — panel
              đóng còn nằm trong cây DOM là trình đọc màn hình vẫn đọc thấy.
            </>
          }
        >
          <Button onClick={() => setOpen(true)}>Mở panel chi tiết</Button>
          <span className="text-muted-foreground text-[11.5px]">
            Dùng cho chi tiết một dòng bảng: danh sách là chỗ so sánh người này với người kia, điều
            hướng sang màn riêng thì mất bảng.
          </span>

          <Drawer
            open={open}
            width="lg"
            onClose={() => setOpen(false)}
            title="Đỗ Quang Huy"
            subtitle="Sale · chip · Quý 3 · 2026 · 01/07 → 17/08"
            meta={<Badge tone="success">Đạt</Badge>}
          >
            <div className="flex flex-col gap-4">
              <GlassCard className="p-5">
                <div className="text-muted-foreground text-[11px]">Đã đạt trong kỳ</div>
                <div className="tnum font-num mt-1 text-[26px] font-semibold tracking-[-.8px]">
                  2 / 2
                </div>
              </GlassCard>
              <GlassCard variant="b" className="p-4">
                <p className="text-muted-foreground text-[11.5px] leading-[1.6]">
                  Thân panel tự cuộn, đầu và chân đứng yên. Bảng bên trong vẫn phải nằm trên
                  `.glass-b` như mọi bảng khác (luật 8).
                </p>
              </GlassCard>
            </div>
          </Drawer>
        </SpecCard>

        {/* T-05 */}
        <SpecCard
          className="col-span-3"
          code="T-05"
          name="AppShell"
          note="khung của MỌI màn"
          bodyClassName="p-4"
          footer={
            <>
              Nhịp khung nằm ở một chỗ: lề `p-4 lg:p-6` · khoảng nav↔nội dung `gap-4 lg:gap-6` ·
              chừa chỗ BottomNav dưới `lg`. Màn tự gõ `p-8` là màn đó tự tách khỏi hệ.
              <br />
              `AssistantFab` CHỈ hiện khi màn truyền `onOpenAssistant`; `lockedNav` khoá mục
              BottomNav chưa có màn. Cả hai vì cùng một lý do: không hứa màn chưa tồn tại.
              <br />Ở đây thu 50% trong một hộp cắt — `scale` cũng là thứ giữ `fixed` của FAB nằm
              trong khung mẫu thay vì bay ra góc cửa sổ thật.
            </>
          }
        >
          <div className="h-[420px] overflow-hidden rounded-md">
            <div className="h-[840px] w-[1900px] origin-top-left scale-50">
              <AppShell
                activeNav="home"
                approvalsCount={7}
                lockedNav={['search']}
                header={SHELL_HEADER}
                onNavigate={() => {}}
                onOpenAssistant={() => {}}
              >
                <div className="grid grid-cols-4 gap-4">
                  <GlassCard className="col-span-2 row-span-2 h-[280px] p-5">
                    <div className="text-muted-foreground text-[11px]">hero 2×2</div>
                  </GlassCard>
                  <GlassCard className="h-[132px] p-5" />
                  <GlassCard className="h-[132px] p-5" />
                  <GlassCard className="h-[132px] p-5" />
                  <GlassCard className="h-[132px] p-5" />
                </div>
              </AppShell>
            </div>
          </div>
        </SpecCard>

        {/* T-06 */}
        <SpecCard
          className="col-span-3"
          code="T-06"
          name="PageHeader"
          note="đầu màn — không nhận size"
          noteAccent
          bodyClassName="flex flex-col gap-6 p-4"
          footer={
            <>
              Chín màn đang chép tay cùng một khối tiêu đề, màn thứ mười dùng SectionTitle
              size=&ldquo;lg&rdquo; 18px làm tiêu đề màn — đầu màn có hai cỡ chữ cho cùng một vai.
              Cỡ ở đây render CỨNG 20px, `lg` 22px, và component KHÔNG nhận `size`: đó là thứ giữ
              cho chỗ lệch không quay lại. Cần cỡ khác thì đó là tiêu đề của một khối, dùng
              SectionTitle.
              <br />
              `rail` xuống HÀNG RIÊNG ngay dưới tiêu đề (luật 10). Trước đây rail bị nhét chung cụm
              với nút bên phải nên ở màn nhiều nút nó trôi mất chỗ, ở chế độ sửa thì biến mất hẳn.
              <br />
              `back` đứng TRÊN tiêu đề, đúng quy ước “màn con của một sổ luôn có lối về sổ”. Nút
              size=&ldquo;md&rdquo; (40px) — ngưỡng chạm 48px của luật 13 đang chờ người quyết (nâng
              ở `md:` thì desktop 1440 cũng thành nút 48px), chưa tự sửa.
              <br />
              Thẻ tiêu đề là h1: mỗi màn đúng một tiêu đề cấp một, để h2 của SectionTitle nằm đúng
              một bậc dưới. Không vẽ mặt kính, không bọc GlassCard — nó nằm trên nền màn, là lớp 3
              của luật 12.
            </>
          }
        >
          <div className="rounded-md bg-black/20 p-5">
            <PageHeader
              title="Chiến dịch &amp; Sự kiện"
              subtitle={
                <>
                  DAS Vina · kỳ <span className="font-mono">01/05 → 17/08</span> · chủ màn Marketing
                  · người gật TP Kinh doanh
                </>
              }
              rail={<ContextRail objects={RAIL_DEMO} />}
              actions={
                <>
                  <Button size="md" variant="ghost">
                    Kho danh sách
                  </Button>
                  <Button size="md">Chiến dịch mới</Button>
                </>
              }
            />
          </div>

          <div className="rounded-md bg-black/20 p-5">
            <PageHeader
              back={{ label: 'Sổ nguồn', onBack: () => {} }}
              icon={Megaphone}
              title="Hội thảo nhà máy thông minh"
              meta={
                <>
                  <Badge tone="running">Đang chạy</Badge>
                  <Badge tone="draft">Sự kiện</Badge>
                </>
              }
              subtitle="Màn con của sổ nguồn — lối về sổ đứng trên tiêu đề."
              tags={
                <>
                  <MetaPill mono>CD-0101</MetaPill>
                  <MetaPill mono icon={CalendarDays}>
                    04/05 → 17/08
                  </MetaPill>
                </>
              }
              rail={<ContextRail objects={RAIL_DETAIL} />}
            />
          </div>
        </SpecCard>
      </ZoneBody>
    </section>
  )
}
