import {
  Bell,
  CircleCheck,
  Factory,
  FileText,
  House,
  Package,
  ScanLine,
  Search,
  SquareCheckBig,
  TriangleAlert,
  Users,
  Zap,
} from 'lucide-react'
import { SpecCard } from './chrome/spec-card'
import { ZoneBody, ZoneHeader } from './chrome/zone'
import { Icon } from '@pv/ui'
import { BRAND_PALETTE, RADIUS_SCALE, SEMANTIC_TOKENS, SPACING_SCALE } from '@pv/tokens'

/** Zone 00 · Foundations — token thô, không có component nào ở đây. */

const SHEENS = [
  { token: '--sheen-a', css: 'var(--sheen-a)' },
  { token: '--sheen-b', css: 'var(--sheen-b)' },
  { token: '--sheen-ai', css: 'var(--sheen-ai)' },
]

const TYPE_SCALE = [
  {
    token: 'text-5xl',
    sample: (
      <span className="tnum font-num text-[42px] font-semibold leading-none tracking-[-1.5px]">
        1,84 tỷ
      </span>
    ),
    spec: ['Space Grotesk', '42 / 600 / −1.5'],
  },
  {
    token: 'text-3xl',
    sample: (
      <span className="font-display text-[28px] font-semibold tracking-[-.4px]">
        Đơn hàng Sao Đỏ
      </span>
    ),
    spec: ['Archivo', '28 / 600'],
  },
  {
    token: 'text-2xl',
    sample: (
      <span className="font-display text-[22px] font-semibold">Chào buổi sáng, anh Thắng</span>
    ),
    spec: ['Archivo', '22 / 600'],
  },
  {
    token: 'text-lg',
    sample: (
      <span className="font-display text-[15px] font-semibold">
        Lệnh sản xuất WO-1180 chậm 2 ngày
      </span>
    ),
    spec: ['Archivo', '15 / 600'],
  },
  {
    token: 'text-base',
    sample: (
      <span className="text-[13px] leading-[1.6]">
        Kho K1-A2 hết thép Ø40 từ 08/08. Đề nghị mua 500 kg từ Thép Nam Việt.
      </span>
    ),
    spec: ['Plex Sans', '13 / 400 / 1.6'],
  },
  {
    token: 'text-sm',
    sample: (
      <span className="text-muted-foreground text-[12.5px] leading-[1.6]">
        Thiếu thép Ø40 tại K1-A2 · hạn giao khách 22/08 còn nguyên
      </span>
    ),
    spec: ['Plex Sans', '12.5 / 400'],
  },
  {
    token: 'text-xs',
    sample: (
      <span className="text-muted-foreground text-[11.5px]">
        Cập nhật 07:58 · hôm nay · nguồn ERP kho
      </span>
    ),
    spec: ['Plex Sans', '11.5 / 400'],
  },
  {
    token: 'font-mono',
    sample: (
      <span className="tnum font-mono text-[12.5px]">
        SO-0891 · WO-1180 · L-2608-042 · 128,5 tr
      </span>
    ),
    spec: ['Plex Mono', '12.5 · tabular'],
  },
]

const ICON_ROW = [
  { icon: House, className: 'text-foreground' },
  { icon: SquareCheckBig, className: 'text-foreground' },
  { icon: Bell, className: 'text-foreground' },
  { icon: Search, className: 'text-foreground' },
  { icon: Zap, className: 'text-accent-foreground' },
  { icon: ScanLine, className: 'text-foreground' },
  { icon: Package, className: 'text-foreground' },
  { icon: Factory, className: 'text-foreground' },
  { icon: FileText, className: 'text-foreground' },
  { icon: Users, className: 'text-foreground' },
  { icon: TriangleAlert, className: 'text-warning' },
  { icon: CircleCheck, className: 'text-success' },
]

export function ZoneFoundations() {
  return (
    <section id="zone-00" className="border-t-white/12 border-t pb-2 pt-10">
      <ZoneHeader
        number="00"
        kicker="Zone 00 · Foundations"
        title="Nền móng"
        description="Token thô. Không có component nào ở đây — chỉ màu, chữ, khoảng cách, bo góc, cao độ, chuyển động. Mọi thứ phía dưới chỉ được tiêu thụ token trong zone này."
      />

      <ZoneBody className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          {/* F-01 */}
          <SpecCard
            code="F-01"
            name="Brand palette"
            note="--brand-*"
            bodyClassName="grid grid-cols-4 gap-3 px-4 py-[18px]"
            footer="Slate Gray và Pebble Blue chỉ làm nền · kẻ · quầng sáng. Không bao giờ làm màu chữ trên nền tối."
          >
            {BRAND_PALETTE.map((swatch) => (
              <div key={swatch.name}>
                <div className="h-11 rounded-md" style={{ background: swatch.css }} />
                <div className="mt-[7px] text-[11px]">{swatch.name}</div>
                <div className="text-muted-foreground font-mono text-[10px]">{swatch.hex}</div>
              </div>
            ))}
          </SpecCard>

          {/* F-02 */}
          <SpecCard
            code="F-02"
            name="Semantic tokens"
            note="shadcn/ui"
            bodyClassName="flex flex-col gap-2 p-4"
            footer="bg-primary · text-accent-foreground · text-muted-foreground · bg-destructive/20"
          >
            {SEMANTIC_TOKENS.map((row) => (
              <div key={row.token} className="flex items-center gap-3">
                <span
                  className="h-5 w-[34px] shrink-0 rounded-sm"
                  style={{
                    background: row.css,
                    boxShadow:
                      row.token === '--border'
                        ? 'inset 0 0 0 1px rgb(255 255 255 / .18)'
                        : undefined,
                  }}
                />
                <span className="text-accent-foreground w-[180px] shrink-0 font-mono text-[11px]">
                  {row.token}
                </span>
                <span className="text-muted-foreground text-[11.5px]">{row.note}</span>
              </div>
            ))}
          </SpecCard>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* F-03 */}
          <SpecCard
            code="F-03"
            name="Surfaces"
            bodyClassName="flex flex-col gap-3 p-4"
            footer="Sheen chỉ là ánh sáng trong mép kính — không làm màu chữ hay nền đặc."
          >
            <div className="glass-a rounded-lg px-[15px] py-[13px]">
              <div className="text-[12.5px] font-semibold">.glass-a</div>
              <div className="text-muted-foreground mt-1 font-mono text-[10.5px] leading-[1.6]">
                white/8.5 · blur 24 · saturate 1.5
              </div>
              <div className="text-muted-foreground mt-1.5 text-[11px]">
                Thẻ thường · KPI · brief card
              </div>
            </div>
            <div className="glass-b rounded-lg px-[15px] py-[13px]">
              <div className="text-[12.5px] font-semibold">.glass-b</div>
              <div className="text-muted-foreground mt-1 font-mono text-[10.5px] leading-[1.6]">
                navy/84 · không blur
              </div>
              <div className="text-muted-foreground mt-1.5 text-[11px]">
                Bảng · danh sách dài · panel
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {SHEENS.map((sheen) => (
                <div key={sheen.token} className="flex items-center gap-[9px]">
                  <span className="h-[13px] w-6 rounded-[2px]" style={{ background: sheen.css }} />
                  <span className="text-muted-foreground font-mono text-[10px]">{sheen.token}</span>
                </div>
              ))}
            </div>
          </SpecCard>

          {/* F-04 */}
          <SpecCard
            className="col-span-2"
            code="F-04"
            name="Type scale"
            note="4 họ chữ · 8 bậc"
            bodyClassName="px-4 pt-2 pb-4"
            footer="font-display Archivo · font-sans IBM Plex Sans · font-num Space Grotesk · font-mono IBM Plex Mono — tất cả đủ dấu tiếng Việt."
          >
            {TYPE_SCALE.map((row, i) => (
              <div
                key={row.token}
                className={`grid grid-cols-[96px_1fr_128px] items-center gap-4 py-[11px] ${
                  i < TYPE_SCALE.length - 1 ? 'border-b border-b-white/[5.5%]' : ''
                }`}
              >
                <span className="text-accent-foreground font-mono text-[10.5px]">{row.token}</span>
                {row.sample}
                <span className="text-muted-foreground text-right font-mono text-[10px]">
                  {row.spec[0]}
                  <br />
                  {row.spec[1]}
                </span>
              </div>
            ))}
          </SpecCard>
        </div>

        <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-4">
          {/* F-05 */}
          <SpecCard
            code="F-05"
            name="Spacing"
            note="thang 4px"
            bodyClassName="flex flex-col gap-[9px] p-4"
            footer="Chỉ dùng 8 bậc này. Không có 6px, 14px, 18px, 22px."
          >
            {SPACING_SCALE.map((row) => (
              <div key={row.step} className="flex items-center gap-3.5">
                <span className="text-accent-foreground w-[34px] font-mono text-[10.5px]">
                  {row.step}
                </span>
                <span className="bg-primary h-3 rounded-[2px]" style={{ width: row.px }} />
                <span className="text-muted-foreground font-mono text-[10px]">{row.use}</span>
              </div>
            ))}
          </SpecCard>

          {/* F-06 */}
          <SpecCard
            code="F-06"
            name="Radius"
            bodyClassName="flex flex-col gap-3.5 px-4 py-[18px]"
            footer="--radius: 0.375rem"
          >
            {RADIUS_SCALE.map((row) => (
              <div key={row.token} className="flex items-center gap-3.5">
                <span
                  className={`bg-white/10 ${row.radius === '50%' ? 'mx-[18px]' : ''}`}
                  style={{ width: row.w, height: row.h, borderRadius: row.radius }}
                />
                <div>
                  <div className="text-accent-foreground font-mono text-[10.5px]">{row.token}</div>
                  <div className="text-muted-foreground mt-0.5 text-[11px]">{row.use}</div>
                </div>
              </div>
            ))}
          </SpecCard>

          {/* F-07 */}
          <SpecCard
            code="F-07"
            name="Elevation"
            bodyClassName="flex flex-col gap-4 px-4 py-[18px]"
            footer="Borderless: mép đọc bằng bóng + vệt sáng inset 1px."
          >
            <div className="text-accent-foreground flex h-10 items-center rounded-lg bg-white/[8.5%] px-3 font-mono text-[10.5px] shadow-[var(--shadow-card),inset_0_1px_0_rgb(255_255_255/.15)]">
              shadow-card
            </div>
            <div className="bg-popover text-accent-foreground flex h-10 items-center rounded-lg px-3 font-mono text-[10.5px] shadow-[var(--shadow-panel),inset_0_1px_0_rgb(255_255_255/.11)]">
              shadow-panel
            </div>
            <div className="text-accent-foreground shadow-frame flex h-10 items-center rounded-lg bg-[color-mix(in_srgb,var(--brand-navy)_92%,transparent)] px-3 font-mono text-[10.5px]">
              shadow-frame
            </div>
            <div className="bg-primary text-primary-foreground shadow-primary flex h-10 items-center rounded-md px-3 font-mono text-[10.5px]">
              shadow-primary
            </div>
          </SpecCard>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* F-08 */}
          <SpecCard
            code="F-08"
            name="Iconography"
            note="lucide-react"
            bodyClassName="flex flex-wrap items-center gap-5 px-4 py-[18px]"
            footer="size 16 trong nút · 20 trong nav · stroke-width 1.75 · không icon fill, không emoji"
          >
            {ICON_ROW.map((item, i) => (
              <Icon key={i} icon={item.icon} size={20} className={item.className} />
            ))}
          </SpecCard>

          {/* F-09 */}
          <SpecCard
            code="F-09"
            name="Motion & grid"
            bodyClassName="px-4 py-[18px] text-[12.5px] leading-[1.9] text-muted-foreground"
            footer="transition-all duration-180 ease-out"
          >
            Chuyển động <span className="text-foreground font-mono">180ms ease-out</span>, chỉ dành
            cho thứ bấm được: nút, hàng bảng, chip, nav. Thẻ kính không có hover — nó là mặt phẳng
            chứa nội dung, không phải nút. Tôn trọng{' '}
            <span className="text-foreground font-mono">prefers-reduced-motion</span>.
            <br />
            Nền màn TĨNH, 4 lớp cố định: quầng aurora (2 blob) → lưới 32px → lưới 160px → hạt nhiễu.
            Không thêm lớp thứ 5, không cho quầng trôi — nền động buộc mọi mặt kính bên trên tính
            lại backdrop-blur mỗi frame.
          </SpecCard>
        </div>
      </ZoneBody>
    </section>
  )
}
