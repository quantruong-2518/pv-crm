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

/** F-04 · Thang chữ — ĐÚNG 9 BẬC (§8.3 · docs/plans/so-gap-giao-dien.md).
 *
 *  Bậc nào không có ở đây thì không được dùng trên màn. Cỡ ngoài thang phải có
 *  comment ngay tại chỗ nêu lý do — đó là điều 14 của hợp đồng "mọi màn phải…".
 *
 *  Bảng này thay bản 8 bậc cũ. Ba thay đổi, ghi lại để không ai dựng lại bản cũ:
 *    · 28px BỎ — nó là bậc hero thứ hai, mà hero chỉ cần một cỡ. Số thẻ compact
 *      đã đứng ở 26px (patterns/stat-card.tsx) nên 28 gộp xuống 26.
 *    · 11px và 10,5px THÊM — hai cỡ này đã dùng thật gần 120 lượt (nhãn ô nhập,
 *      kicker, nhãn phụ trong bảng) mà bản cũ không thừa nhận.
 *    · bậc 3 có hai giá trị theo bề rộng: 20px ở base, 22px từ `lg:`. Đó là một
 *      bậc, không phải hai — tiêu đề màn viết `text-[20px] lg:text-[22px]`. */
const TYPE_SCALE = [
  {
    step: '1',
    token: 'text-[42px]',
    role: 'hero · số lớn nhất màn',
    sample: (
      <span className="tnum font-num text-[42px] font-semibold leading-none tracking-[-1.5px]">
        1,84 tỷ
      </span>
    ),
    spec: ['Space Grotesk', '42 / 600 / −1.5'],
  },
  {
    step: '2',
    token: 'text-[26px]',
    role: 'số thẻ compact',
    sample: (
      <span className="tnum font-num text-[26px] font-semibold leading-none tracking-[-.8px]">
        128,5 tr
      </span>
    ),
    spec: ['Space Grotesk', '26 / 600 / −.8'],
  },
  {
    step: '3',
    token: 'text-[20px] lg:text-[22px]',
    role: 'tiêu đề màn',
    sample: (
      <span className="font-display text-[20px] font-semibold lg:text-[22px]">
        Chào buổi sáng, anh Thắng
      </span>
    ),
    spec: ['Archivo', '20 → 22 / 600'],
  },
  {
    step: '4',
    token: 'text-[15px]',
    role: 'tiêu đề thẻ',
    sample: (
      <span className="font-display text-[15px] font-semibold">
        Lệnh sản xuất WO-1180 chậm 2 ngày
      </span>
    ),
    spec: ['Archivo', '15 / 600'],
  },
  {
    step: '5',
    token: 'text-[13px]',
    role: 'thân đậm · câu dẫn',
    sample: (
      <span className="text-[13px] font-medium leading-[1.6]">
        Kho K1-A2 hết thép Ø40 từ 08/08. Đề nghị mua 500 kg từ Thép Nam Việt.
      </span>
    ),
    spec: ['Plex Sans', '13 / 500 / 1.6'],
  },
  {
    step: '6',
    token: 'text-[12.5px]',
    role: 'thân',
    sample: (
      <span className="text-muted-foreground text-[12.5px] leading-[1.6]">
        Thiếu thép Ø40 tại K1-A2 · hạn giao khách 22/08 còn nguyên
      </span>
    ),
    spec: ['Plex Sans', '12.5 / 400'],
  },
  {
    step: '7',
    token: 'text-[11.5px]',
    role: 'phụ · chú thích dưới khối',
    sample: (
      <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
        Cập nhật 07:58 · hôm nay · nguồn ERP kho
      </span>
    ),
    spec: ['Plex Sans', '11.5 / 400'],
  },
  {
    step: '8',
    token: 'text-[11px]',
    role: 'nhãn ô nhập',
    sample: <span className="text-muted-foreground text-[11px]">Kho xuất hàng</span>,
    spec: ['Plex Sans', '11 / 400'],
  },
  {
    step: '9',
    token: 'text-[10.5px]',
    role: 'kicker · nhãn phụ trong bảng',
    sample: (
      <span className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-[.12em]">
        Đơn hàng · hôm nay
      </span>
    ),
    spec: ['Plex Mono', '10.5 / in hoa'],
  },
  {
    step: '6 mono',
    token: 'font-mono',
    role: 'mã và số trong ô bảng',
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
                <div className="text-muted-foreground font-mono text-[10.5px]">{swatch.hex}</div>
              </div>
            ))}
          </SpecCard>

          {/* F-02 */}
          <SpecCard
            code="F-02"
            name="Semantic tokens"
            note="shadcn/ui"
            bodyClassName="flex flex-col gap-2 p-4"
            footer="bg-primary · text-accent-foreground · text-muted-foreground · bg-destructive/20 · bg-surface-inset. Bốn mức --surface-* chồng tối đa hai lớp trắng trên một mặt kính; lớp thứ ba thì chữ phụ đổi sang --glass-foreground (luật 13)."
          >
            {SEMANTIC_TOKENS.map((row) => (
              <div key={row.token} className="flex items-center gap-3">
                <span
                  className="h-5 w-[34px] shrink-0 rounded-sm"
                  style={{
                    background: row.css,
                    /* Bốn mức --surface-* là trắng 5–16%, đặt lên mặt kính của
                       thẻ spec thì gần như không thấy — cùng cảnh với
                       --border. Viền mảnh để mắt bắt được ô, không phải để
                       trang trí. */
                    boxShadow:
                      row.token === '--border' || row.token.startsWith('--surface-')
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
                  <span className="text-muted-foreground font-mono text-[10.5px]">
                    {sheen.token}
                  </span>
                </div>
              ))}
            </div>
          </SpecCard>

          {/* F-04 */}
          <SpecCard
            className="col-span-2"
            code="F-04"
            name="Type scale"
            note="4 họ chữ · 9 bậc"
            bodyClassName="px-4 pt-2 pb-4"
            footer="Đúng 9 bậc này. Cỡ ngoài thang phải có comment nêu lý do ngay tại chỗ. Bậc 3 là một bậc hai giá trị: 20px ở base, 22px từ lg."
          >
            {TYPE_SCALE.map((row, i) => (
              <div
                key={row.step}
                className={`grid grid-cols-[46px_1fr_128px] items-center gap-4 py-[11px] ${
                  i < TYPE_SCALE.length - 1 ? 'border-b border-b-white/[5.5%]' : ''
                }`}
              >
                <span className="text-accent-foreground font-mono text-[10.5px]">{row.step}</span>
                <div className="min-w-0">
                  {row.sample}
                  <div className="text-muted-foreground mt-1 text-[11px]">{row.role}</div>
                </div>
                <span className="text-muted-foreground text-right font-mono text-[10.5px]">
                  {row.spec[0]}
                  <br />
                  {row.spec[1]}
                  <br />
                  <span className="text-accent-foreground">{row.token}</span>
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
                <span className="text-muted-foreground font-mono text-[10.5px]">{row.use}</span>
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
