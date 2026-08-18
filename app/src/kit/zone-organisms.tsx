import { Bell, Factory, FileText, House, Package, SquareCheckBig, Users } from 'lucide-react'
import { SpecCard } from '@/components/kit/spec-card'
import { ZoneBody, ZoneHeader } from '@/components/kit/zone'
import { AppSidebar } from '@/components/organisms/app-sidebar'
import { ApprovalCard } from '@/components/organisms/approval-card'
import { BriefCard } from '@/components/organisms/brief-card'
import { KioskTile } from '@/components/organisms/kiosk-tile'
import { TopBar } from '@/components/organisms/top-bar'

/** Zone 03 · Organisms — khối hoàn chỉnh, đặt thẳng vào màn. */

const SIDEBAR_GROUPS = [
  {
    items: [
      { icon: House, label: 'Trang chủ', active: true },
      { icon: SquareCheckBig, label: 'Phê duyệt', count: 7 },
      { icon: Bell, label: 'Thông báo' },
    ],
  },
  {
    kicker: 'Ứng dụng',
    items: [
      { icon: FileText, label: 'Docs' },
      { icon: Users, label: 'CRM' },
      { icon: SquareCheckBig, label: 'Work' },
      { icon: Package, label: 'ERP · Kho' },
      { icon: Factory, label: 'MES' },
    ],
  },
]

const CHAIN = [
  { label: 'Đức ✓ 08:40', state: 'ok' as const },
  { label: 'Anh — đang chờ', state: 'current' as const },
  { label: 'Kế toán Mai', state: 'next' as const },
]

export function ZoneOrganisms() {
  return (
    <section id="zone-03" className="pt-12 pb-2">
      <div className="border-t border-t-white/12 pt-10">
        <ZoneHeader
          number="03"
          kicker="Zone 03 · Organisms"
          title="Sinh vật"
          description="Khối hoàn chỉnh, đặt thẳng vào màn. Mỗi organism tự mang đủ ngữ cảnh: tiêu đề, dữ liệu, context rail, hành động."
        />
      </div>

      <ZoneBody className="flex flex-col gap-4">
        <div className="grid grid-cols-[300px_1fr] items-start gap-4">
          {/* O-01 */}
          <SpecCard
            code="O-01"
            name="AppSidebar"
            note="w-[232px]"
            bodyClassName="p-4"
            footer="Logo 32 · NavItem[] · Kicker nhóm “Ứng dụng”"
          >
            <AppSidebar product="PV One" org="Thắng Lợi" groups={SIDEBAR_GROUPS} />
          </SpecCard>

          <div className="flex flex-col gap-4">
            {/* O-02 */}
            <SpecCard
              code="O-02"
              name="TopBar"
              note="h-16"
              bodyClassName="p-4"
              footer="SearchField + nút Trợ lý + chuông (chấm 7px destructive) + Avatar"
            >
              <TopBar user={{ name: 'Nguyễn Văn Thắng' }} unread />
            </SpecCard>

            {/* O-03 */}
            <SpecCard
              code="O-03"
              name="BriefCard"
              note="bento 2×1"
              bodyClassName="grid grid-cols-2 gap-4 p-4"
              footer="StatusDot + tiêu đề text-lg + mô tả text-sm + ContextRail + Badge góc phải"
            >
              <BriefCard
                state="bad"
                title="WO-1180 chậm 2 ngày"
                badge={{ label: 'Quá hạn', tone: 'danger' }}
                description="Thiếu thép Ø40 tại K1-A2 từ 08/08. Hạn giao khách 22/08 còn nguyên."
                objects={[
                  { code: 'SO-0891', onOpen: () => {} },
                  { code: 'MES · WO-1180', source: true, onOpen: () => {} },
                  { code: 'K1-A2', onOpen: () => {} },
                ]}
              />
              <BriefCard
                state="warning"
                title="CNC-03 dừng lần 3"
                badge={{ label: 'Dừng 37′', tone: 'warning' }}
                description="Lỗi E-214 lặp lần thứ 3 trong tuần. Lệnh bảo trì BT-0310 đã giao anh Hải."
                objects={[
                  { code: 'MES · CNC-03', source: true, onOpen: () => {} },
                  { code: 'BT-0310', onOpen: () => {} },
                ]}
              />
            </SpecCard>
          </div>
        </div>

        <div className="grid grid-cols-2 items-start gap-4">
          {/* O-04 */}
          <SpecCard
            code="O-04"
            name="ApprovalCard"
            bodyClassName="p-4"
            footer="Tiêu đề + Money góc phải + ApprovalChain + 3 Button. Nút chính luôn nói rõ số tiền."
          >
            <ApprovalCard
              title="Mua thép Ø40 — PO-0455"
              subtitle="Thép Nam Việt · giao 2 ngày"
              amount={128_500_000}
              chain={CHAIN}
              onApprove={() => {}}
              onReject={() => {}}
              onAskAi={() => {}}
            />
          </SpecCard>

          {/* O-05 */}
          <SpecCard
            code="O-05"
            name="KioskTile"
            note="tablet · đọc xa 3m"
            bodyClassName="grid grid-cols-2 gap-4 p-4"
            footer={
              <>
                Biến thể tương phản cao là NGOẠI LỆ DUY NHẤT được dùng viền — 2px, cho kiosk ngoài
                sáng.
                <br />
                Số ≥34px · chữ phụ ≥14px · nút ≥48px.
              </>
            }
          >
            <KioskTile
              value="68%"
              lines={
                <>
                  WO-1180 · chậm 2 ngày
                  <br />
                  hạn giao 22/08
                </>
              }
              source="MES"
            />
            <KioskTile
              highContrast
              value="68%"
              lines={
                <>
                  WO-1180 · chậm 2 ngày
                  <br />
                  hạn giao 22/08
                </>
              }
              action={{ label: 'Xem lệnh' }}
            />
          </SpecCard>
        </div>
      </ZoneBody>
    </section>
  )
}
