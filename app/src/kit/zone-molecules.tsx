import { Bell, House, Inbox, SquareCheckBig } from 'lucide-react'
import { SpecCard } from '@/components/kit/spec-card'
import { ZoneBody, ZoneHeader } from '@/components/kit/zone'
import { AiAction } from '@/components/patterns/ai-action'
import { ApprovalChain } from '@/components/patterns/approval-chain'
import { ContextRail } from '@/components/patterns/context-rail'
import { DataTable } from '@/components/patterns/data-table'
import { EmptyState } from '@/components/patterns/empty-state'
import { NavItem } from '@/components/patterns/nav-item'
import { ScanField } from '@/components/patterns/scan-field'
import { SearchField } from '@/components/patterns/search-field'
import { StatCard } from '@/components/patterns/stat-card'
import { Badge } from '@/components/ui/badge'
import { millions } from '@/lib/format'

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

const TABLE_COLUMNS = [
  { header: 'Hóa đơn', width: '1fr' as const },
  { header: 'Khách hàng', width: '1.4fr' as const },
  { header: 'Số tiền', width: '.9fr' as const, align: 'right' as const },
  { header: 'Trạng thái', width: '1fr' as const, align: 'right' as const },
]

const mono = (text: string) => <span className="font-mono">{text}</span>
const amount = (dong: number) => <span className="tnum font-mono">{millions(dong)}</span>

export function ZoneMolecules() {
  return (
    <section id="zone-02" className="pt-12 pb-2">
      <div className="border-t border-t-white/12 pt-10">
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
          bodyClassName="p-4"
          footer={
            <>
              Card + font-num text-5xl + label text-xs + delta + Sparkline
              <br />
              bento 1×1 · h-[150px]
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
          <p className="text-[11.5px] leading-[1.7] text-muted-foreground">
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
          footer="h-[38px] rounded-md · active = bg-accent · badge số dùng bg-destructive"
        >
          <NavItem icon={House} label="Trang chủ" active />
          <NavItem icon={SquareCheckBig} label="Phê duyệt" count={7} />
          <div className="relative">
            <NavItem icon={Bell} label="Thông báo" className="bg-white/6" />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[9.5px] text-muted-foreground">
              hover
            </span>
          </div>
        </SpecCard>

        {/* M-07 */}
        <SpecCard
          className="col-span-2"
          code="M-07"
          name="TableRow"
          note="default · hover · selected · hidden-by-permission"
          bodyClassName="px-4 py-3.5"
          footer={
            <>
              h-11 · divide-white/6 · hover:bg-white/5 · selected =
              shadow-[inset_2px_0_0] shadow-primary + bg-primary/10
              <br />
              Bảng luôn nằm trên .glass-b, không bao giờ .glass-a
            </>
          }
        >
          <DataTable
            columns={TABLE_COLUMNS}
            rows={[
              {
                id: 'HD-2214',
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
                  <span className="text-[11px] text-muted-foreground">Bị ẩn theo quyền của bạn</span>,
                ],
              },
            ]}
          />
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
              Luật cứng: luôn có dòng “Căn cứ: …” và luôn chờ nút. AI không bao giờ tự thực hiện.
              <br />
              bg-gradient-to-r from-primary/22 to-primary/6 + hatch overlay · ring-0 ·
              shadow-[0_12px_30px_theme(primary/14)]
            </>
          }
        >
          <AiAction
            suggestion="Trợ lý đề xuất: duyệt PO-0455 hôm nay và chuyển 30% khối lượng WO-1180 sang CNC-05 → kịp giao 22/08, dư 1 ngày."
            basis="tồn kho K1-A2 · năng lực xưởng X1 · hợp đồng SO-0891."
            onConfirm={() => {}}
            onInspect={() => {}}
          />
        </SpecCard>
      </ZoneBody>
    </section>
  )
}
