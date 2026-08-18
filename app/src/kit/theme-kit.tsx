import { AuroraField } from '@/components/layout/aurora-field'
import { ZoneAtoms } from '@/kit/zone-atoms'
import { ZoneFoundations } from '@/kit/zone-foundations'
import { ZoneMolecules } from '@/kit/zone-molecules'
import { ZoneOrganisms } from '@/kit/zone-organisms'
import { ZoneTemplates } from '@/kit/zone-templates'
import markLight from '@/assets/mark-light.png'
import wordmarkLight from '@/assets/wordmark-light.png'

/** Pebble Aurora — Theme Kit.
 *  Trang styleguide sống: mọi ví dụ dưới đây render bằng CHÍNH các component
 *  trong `src/components`, không phải bản sao tĩnh. Trang lệch nghĩa là thư
 *  viện lệch — đó là mục đích của nó.
 *
 *  Nguồn: project/Pebble Aurora - Theme Kit.dc.html (chốt 10/08). */

const ZONES = [
  { id: 'zone-00', number: '00', label: 'Foundations', count: 9 },
  { id: 'zone-01', number: '01', label: 'Atoms', count: 11 },
  { id: 'zone-02', number: '02', label: 'Molecules', count: 9 },
  { id: 'zone-03', number: '03', label: 'Organisms', count: 5 },
  { id: 'zone-04', number: '04', label: 'Templates', count: 3 },
]

const CHECKLIST = [
  '01 · Khung đúng kích thước tuyệt đối, lưới đúng T-01/02/03.',
  '02 · Mọi dữ liệu tra được về kịch bản Sao Đỏ — không bịa mã, tên, số mới.',
  '03 · Có ≥1 ContextRail bấm được và ≥1 AIAction kèm dòng “Căn cứ:”.',
  '04 · Azure đếm được: chỉ AI, nút chính, active. Không trang trí.',
  '05 · Bảng và danh sách dài nằm trên .glass-b.',
  '06 · Số dùng font-num hoặc font-mono, tabular; tiền chuẩn VN.',
  '07 · Có trạng thái phụ: hover, selected, và 1 dòng “Bị ẩn theo quyền”.',
  '08 · Tương phản chữ ≥ 4,5:1; nút tablet ≥48px; mobile chừa safe-area 34px.',
]

export function ThemeKit({ showChecklist = true }: { showChecklist?: boolean }) {
  return (
    <AuroraField className="min-w-[1536px] px-12 pt-14 pb-[110px]">
      <div className="relative z-[1] mx-auto max-w-[1440px] min-w-[1440px]">
        <header className="flex items-end justify-between gap-10 pb-10">
          <div className="max-w-[680px]">
            <div className="mb-5 flex items-center gap-4">
              <img src={wordmarkLight} alt="Pebble Vina" className="block h-[34px] w-auto" />
              <span className="h-5 w-px bg-white/16" />
              <span className="font-mono text-[11px] font-semibold tracking-[.18em] text-muted-foreground uppercase">
                Aurora · v2.0
              </span>
            </div>
            <h1 className="m-0 font-display text-[40px] leading-[1.15] font-semibold tracking-[-.8px]">
              Theme kit
            </h1>
            <p className="mt-4 text-[13.5px] leading-[1.75] text-pretty text-muted-foreground">
              Tổ chức theo atomic design:{' '}
              <b className="text-foreground">Foundations → Atoms → Molecules → Organisms → Templates</b>
              . Mỗi item có mã, tên component shadcn/ui và chuỗi class Tailwind để dev dựng đúng 1:1.
              Token nằm ở <span className="font-mono text-accent-foreground">theme/globals.css</span>.
            </p>
          </div>

          <nav className="flex shrink-0 flex-col gap-2" aria-label="Mục lục">
            {ZONES.map((zone) => (
              <a
                key={zone.id}
                href={`#${zone.id}`}
                className="motion-std flex w-[250px] items-center gap-3.5 rounded-md bg-white/5 px-4 py-[9px] hover:bg-white/10"
              >
                <span className="w-[22px] font-num text-[14px] font-semibold text-accent-foreground">
                  {zone.number}
                </span>
                <span className="flex-1 text-[12.5px] text-foreground">{zone.label}</span>
                <span className="font-mono text-[10.5px] text-muted-foreground">{zone.count}</span>
              </a>
            ))}
          </nav>
        </header>

        <ZoneFoundations />
        <ZoneAtoms />
        <ZoneMolecules />
        <ZoneOrganisms />
        <ZoneTemplates />

        {showChecklist && (
          <section className="pt-12">
            <div className="grid grid-cols-2 gap-4 border-t border-t-white/12 pt-9">
              <div className="glass-b-flat rounded-lg px-[26px] py-6">
                <div className="mb-4 font-display text-[17px] font-semibold">
                  Checklist nghiệm thu mỗi màn
                </div>
                <div className="text-[12.5px] leading-[2] text-muted-foreground">
                  {CHECKLIST.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </div>

              <div className="glass-b-flat rounded-lg px-[26px] py-6">
                <div className="mb-4 font-display text-[17px] font-semibold">Bàn giao cho dev</div>
                <div className="flex flex-col gap-4 text-[12.5px] leading-[1.9] text-muted-foreground">
                  <p>
                    Token nằm ở <span className="font-mono text-accent-foreground">theme/globals.css</span>{' '}
                    — Tailwind v4 <span className="font-mono text-foreground">@theme inline</span>, dán
                    thẳng vào dự án shadcn/ui.
                  </p>
                  <p>
                    Mỗi item trong kit ghi sẵn chuỗi class ở chân khối. Thứ tự dựng: Foundations → Atoms
                    → Molecules → Organisms.
                  </p>
                  <p>
                    Ba thứ đừng đổi: teal cũ đã bỏ hẳn, hệ borderless (
                    <span className="font-mono text-foreground">--border: transparent</span>), và luật AI
                    luôn chờ nút.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        <footer className="mt-12 flex items-center justify-between gap-6 border-t border-t-white/10 pt-6">
          <div className="text-[11.5px] leading-[1.8] text-muted-foreground">
            Pebble Vina · Aurora v2.0 · theme kit cho POC “Đơn hàng Sao Đỏ” — ngày đóng băng 10/08 ·
            07:58
            <br />
            Không emoji · không icon fill · không màu đặc ngoài bảng brand · không viền trừ biến thể
            tương phản cao.
          </div>
          <img src={markLight} alt="" className="size-10 object-contain opacity-70" />
        </footer>
      </div>
    </AuroraField>
  )
}
