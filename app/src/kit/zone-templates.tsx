import { SpecCard } from '@/components/kit/spec-card'
import { ZoneBody, ZoneHeader } from '@/components/kit/zone'
import { cn } from '@/lib/cn'

/** Zone 04 · Templates — ba thiết bị là ba vai, không phải một layout co giãn.
 *  Ba sơ đồ dưới đây là bản vẽ khung, không phải component sản phẩm. */

const frame = 'h-[270px] rounded-md bg-[color-mix(in_srgb,var(--background)_70%,transparent)] shadow-[inset_0_0_0_1px_rgb(255_255_255/.07)]'
const slot = 'rounded-[2px] bg-white/7'
const accentSlot = 'flex items-center justify-center rounded-[2px] bg-primary/20 font-mono text-[9.5px] text-accent-foreground'

/** Kích thước khung trong Zone 04 là bản vẽ tỉ lệ, cố ý không thuộc thang 8 bậc. */
export function ZoneTemplates() {
  return (
    <section id="zone-04" className="pt-12 pb-2">
      <div className="border-t border-t-white/12 pt-10">
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
          note={<span className="font-num text-[14px] font-semibold tracking-[-.3px]">1440 × 900</span>}
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
            <div className="flex w-[70px] items-end justify-center bg-primary/16 pb-2 font-mono text-[9.5px] text-accent-foreground">
              232
            </div>
            <div className="flex flex-1 flex-col p-2.5">
              <div className="flex h-5 items-center justify-end rounded-[2px] bg-white/7 pr-1.5 font-mono text-[9px] text-muted-foreground">
                topbar 64
              </div>
              <div className="mt-2 grid flex-1 grid-cols-4 grid-rows-2 gap-1.5">
                <div className={cn(accentSlot, 'col-span-2 row-span-2 bg-primary/22')}>hero 2×2</div>
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
          note={<span className="font-num text-[14px] font-semibold tracking-[-.3px]">1024 × 768</span>}
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
            <div className="flex h-[26px] items-center rounded-[2px] bg-white/7 px-2 font-mono text-[9px] text-muted-foreground">
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
          note={<span className="font-num text-[14px] font-semibold tracking-[-.3px]">390 × 844</span>}
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
            <div className="flex h-3 items-center justify-center font-mono text-[7.5px] text-muted-foreground">
              status 44
            </div>
            <div className="mt-1 flex flex-1 flex-col gap-1.5">
              <div className="h-[52px] rounded-[2px] bg-primary/22" />
              <div className={cn(slot, 'h-10')} />
              <div className={cn(slot, 'h-10')} />
            </div>
            <div className="flex h-[26px] items-center justify-center rounded-[2px] bg-white/9 font-mono text-[7.5px] text-muted-foreground">
              bottom nav 84
            </div>
            <div className="h-2" />
          </div>
        </SpecCard>
      </ZoneBody>
    </section>
  )
}
