import { Bell, Factory, FileText, House, Package, SquareCheckBig, Users } from 'lucide-react'
import { SpecCard } from './chrome/spec-card'
import { ZoneBody, ZoneHeader } from './chrome/zone'
import { ApprovalCard, AppHeader, BriefCard, KioskTile } from '@pv/ui'

/** Zone 03 · Organisms — khối hoàn chỉnh, đặt thẳng vào màn. */

const HEADER_CORE = [
  { icon: House, label: 'Trang chủ', active: true },
  { icon: SquareCheckBig, label: 'Phê duyệt', count: 7 },
  { icon: Bell, label: 'Thông báo' },
]

const HEADER_APPS = [
  {
    icon: Users,
    label: 'Kinh doanh',
    active: true,
    items: [
      { icon: Users, label: 'Lead', active: true },
      { icon: FileText, label: 'Báo giá' },
    ],
  },
  { icon: Package, label: 'Cung ứng', locked: true },
  { icon: Factory, label: 'Sản xuất', locked: true },
]

const CHAIN = [
  { label: 'Đức ✓ 08:40', state: 'ok' as const },
  { label: 'Anh — đang chờ', state: 'current' as const },
  { label: 'Kế toán Mai', state: 'next' as const },
]

export function ZoneOrganisms() {
  return (
    <section id="zone-03" className="pb-2 pt-12">
      <div className="border-t-white/12 border-t pt-10">
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
            code="O-06"
            name="AppHeader"
            note="tầng 1 h-16 · tầng 2 h-12"
            bodyClassName="p-4"
            footer="Tầng 1: thương hiệu + ô tìm toàn cục + việc chờ + Trợ lý + Avatar. Tầng 2: ứng dụng, mục có module con thì xổ dropdown (glass-overlay, đục hẳn)"
          >
            <AppHeader
              product="PV One"
              org="Thắng Lợi"
              core={HEADER_CORE}
              apps={HEADER_APPS}
              user={{ name: 'Nguyễn Văn Thắng' }}
              unread
              search={{ placeholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' }}
            />
          </SpecCard>

          <div className="flex flex-col gap-4">
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
