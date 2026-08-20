import { useState } from 'react'
import { AiAction, AppShell, BriefCard, ContextRail, OrderLifecycleCard, StatCard } from '@pv/ui'
import { saoDo } from '@pv/engines/fixtures/sao-do'
import { useAppChrome } from '@/app/chrome'

/** Màn 01 · Trang chủ / Morning brief (docs/luat-thiet-ke.md §7).
 *  Kịch bản 1 · Sao Đỏ, đóng băng 10/08 · 07:58.
 *
 *  Nav KHÔNG khai ở đây: cả gói props của khung lấy từ `app/chrome.tsx` bằng
 *  `{...chrome.shell}`, nên thêm màn mới là nav của mọi màn biết ngay và không
 *  màn nào nối thiếu dây điều hướng.
 *
 *  TIẾNG VIỆT từ 20/08. Bản vẽ gốc của màn này là bản EN và thân màn giữ nguyên
 *  tiếng Anh suốt trong khi tám màn kia đã tiếng Việt — luật 14. Bản vẽ đã xoá
 *  nên không còn gì để trung thành với nữa; hai chỗ dịch KHÔNG theo chữ:
 *   · "Equipment effectiveness" → "Hiệu suất thiết bị" (luật 14 cấm viết tắt
 *     OEE trên giao diện, và fixture đã gọi đúng tên đó);
 *   · "contract SO-0891" → "đơn bán SO-0891" — SO-0891 là đơn bán bên Supply,
 *     hợp đồng của câu chuyện này là HĐ-2607 (`fixtures/sao-do.ts`).
 *
 *  CÒN NỢ: bốn ô KPI và dải sparkline vẫn gõ số thẳng vào JSX, trong khi
 *  `SAO_DO_KPI` đã giữ đúng bộ số đó. Trả nợ ở vòng dọn dữ liệu, không lẫn vào
 *  lượt dịch này. */

/** Mỏ neo của ContextRail — chính là đơn ô hero đang nói tới. `E1.story()` leo
 *  từ nó ra cả chuỗi (LD-0334 → HĐ-2607 → SO-0891 → WO-1180 → PO-0455 →
 *  L-2608-042), nên màn không gõ một mã nào bằng tay. */
const HOME_ANCHOR = 'SO-0891'

export function HomePage() {
  const chrome = useAppChrome({
    searchPlaceholder: 'Tìm khách hàng, đơn hàng, lệnh sản xuất, hồ sơ…',
  })

  /* Luật 9 · trợ lý chờ nút. Chưa bấm thì khối AI nói ra hệ quả của việc chưa
     bấm; bấm rồi thì nó nói "Đã thực hiện" và thôi nhắc. */
  const [done, setDone] = useState(false)

  /* Luật 10 · ContextRail dựng thẳng từ E1, một hàng riêng ngay dưới tiêu đề
     màn. `source` bật cho ĐÚNG object đang mở — chip azure phải đếm được
     (luật 3), không phải cả chuỗi cùng sáng. */
  const story = saoDo.graph.story(HOME_ANCHOR)
  const rail =
    story.length > 0
      ? story.map((o) => ({ code: o.code, source: o.code === HOME_ANCHOR }))
      : [{ code: HOME_ANCHOR, source: true }]

  return (
    <AppShell {...chrome.shell}>
      <div className="flex flex-col gap-5 lg:gap-6">
        <div>
          <h2 className="font-display text-[20px] font-semibold lg:text-[22px]">
            Chào buổi sáng, anh Thắng
          </h2>
          <p className="text-muted-foreground mt-1.5 text-[12px]">
            Thứ Hai 10/08 · gộp Sales, Supply, Factory, Finance · cập nhật{' '}
            <span className="font-mono">07:58</span> · 4 việc cần anh nhìn
          </p>
        </div>

        <ContextRail objects={rail} />

        <div className="grid grid-cols-2 gap-3 lg:auto-rows-[150px] lg:grid-cols-4 lg:gap-4">
          <OrderLifecycleCard
            className="col-span-2 lg:row-span-2"
            state="bad"
            title="Đơn Sao Đỏ — SO-0891"
            amount="1,84 tỷ"
            description="trễ 2 ngày · thiếu thép Ø40 · khách chốt hạn 22/08"
            progress={{ label: 'Lệnh sản xuất WO-1180', value: 0.68 }}
            milestones={['ok', 'ok', 'ok', 'ok', 'ok', 'current', 'next', 'next', 'next', 'next']}
            milestoneLabels={['08/07 đầu mối', 'hôm nay 10/08', '25/08 xuất hoá đơn']}
            objects={[
              { code: 'HĐ-2607' },
              { code: 'Supply · SO-0891', source: true },
              { code: 'Factory · WO-1180', source: true },
              { code: 'Supply · PO-0455', source: true },
            ]}
          />

          <StatCard
            value="4,2 tỷ"
            label="Doanh thu tháng 8"
            delta={{ direction: 'up', text: 'vượt kế hoạch 12%', tone: 'success' }}
            sparkline={{
              points: [22, 18, 20, 13, 15, 8, 9, 3],
              source: 'tháng 8 · Sales',
              tone: 'success',
            }}
          />
          <StatCard
            value="86%"
            label="Giao đúng hạn"
            delta={{ direction: 'flat', text: 'đi ngang · mục tiêu 90%', tone: 'warning' }}
            sparkline={{
              points: [12, 11, 13, 12, 12, 13, 11, 12],
              source: '90 ngày · Supply',
              tone: 'warning',
            }}
          />
          <StatCard
            value="890 tr"
            label="Công nợ quá hạn"
            delta={{ direction: 'up', text: '2 hoá đơn · quá hạn 12 ngày', tone: 'danger' }}
            sparkline={{
              points: [20, 19, 16, 17, 11, 10, 6, 4],
              source: '30 ngày · Finance',
              tone: 'danger',
            }}
          />
          <StatCard
            value="91,4%"
            label="Hiệu suất thiết bị · xưởng X1"
            delta={{ direction: 'down', text: 'CNC-03 dừng 37 phút', tone: 'warning' }}
            sparkline={{
              points: [6, 5, 8, 7, 6, 14, 19, 11],
              source: '24 giờ · Factory',
              tone: 'warning',
            }}
          />

          <BriefCard
            className="col-span-2"
            state="warning"
            title="3 cơ hội đang rủi ro"
            badge={{ label: 'Sales', tone: 'warning' }}
            description="Sao Đỏ im 6 ngày với báo giá gia hạn BG-0512 · Trường Thịnh xin giảm 8% · Hoà Phong ngưng trả lời."
            objects={[{ code: 'Sales · BG-0512', source: true }, { code: 'LD-0334' }]}
          />
          <BriefCard
            className="col-span-2"
            state="bad"
            title="CNC-03 dừng lần thứ ba trong tuần"
            badge={{ label: 'Factory', tone: 'danger' }}
            description="Lỗi E-214, tổng 37 phút sáng nay. Lệnh bảo trì BT-0310 đã giao anh Hải, chưa thấy nhận."
            objects={[{ code: 'Factory · CNC-03', source: true }, { code: 'BT-0310' }]}
          />
        </div>

        <AiAction
          suggestion="Trợ lý đề xuất: duyệt PO-0455 hôm nay và chuyển 30% WO-1180 sang CNC-05 → giao hàng vẫn kịp 22/08, còn dư một ngày."
          basis="tồn kho K1-A2 · công suất xưởng X1 · đơn bán SO-0891 · lịch bảo trì CNC-03."
          /* Luật 9 · state "Chưa tạo gì cả" phải nói ra HỆ QUẢ, không nói suông:
             ba object đứng im và một cái hạn trượt. */
          empty="Chưa tạo gì cả. Chưa bấm thì PO-0455 nằm nguyên ở chờ duyệt, WO-1180 chạy trọn trên CNC-03, và SO-0891 giữ nguyên mức trễ 2 ngày — hạn 22/08 hết phần dư."
          done={done}
          onConfirm={() => setDone(true)}
        />
      </div>
    </AppShell>
  )
}

export default HomePage
