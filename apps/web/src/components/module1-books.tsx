import { useLocation, useNavigate } from 'react-router-dom'
import { SegmentedControl } from '@pv/ui'

/** BA SỔ CỦA MODULE 1, VÀ CÁCH ĐI GIỮA CHÚNG.
 *
 *  Module 1 trả một câu hỏi có ba nửa, và mỗi nửa là một bảng khác:
 *
 *    Chiến dịch  `sales.campaign` (CP-nnnn) — đơn vị GỬI. Chọn tệp, hẹn giờ,
 *                bắn từng đợt. "CONSUMES LEADS, DOES NOT PRODUCE THEM".
 *    Nguồn dẫn   SOURCE (SR-nn) — nơi lead SINH RA. Hội thảo, landing page,
 *                danh sách mua. Đo bằng chi phí trên một lead tốt.
 *    Lô gửi      `platform.mail_run` — từng lô thư đã rời máy, và nó tới đâu.
 *
 *  Hai cái đầu là hai định nghĩa ĐỐI LẬP — quyết định D2 chốt 28/08 là tách
 *  riêng, không hợp nhất, vì gộp chúng thành một bảng thì phá một trong hai.
 *  Nhưng tách bảng không có nghĩa tách nav: người dùng vẫn hỏi cả ba trong
 *  cùng một buổi ("nguồn nào ra lead tốt → gom vào chiến dịch nào → lô nào đã
 *  đi"), nên ba sổ đứng cạnh nhau ở đây thay vì thành ba mục nav rời.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO CẢ BA NẰM DƯỚI `/sales/campaigns`
 *  ------------------------------------------------------------------
 *  `useAppChrome` sáng mục nav bằng `inModule()`, tức khớp theo TIỀN TỐ. Đặt
 *  Nguồn dẫn ở `/sales/sources` là một đường dẫn đẹp hơn và một mục nav tắt
 *  ngóm khi người dùng đang đứng trên nó — hoặc là phải đẻ module thứ 7 cho
 *  một sổ vốn thuộc module 1. Đường dẫn dài hơn vài ký tự rẻ hơn cả hai. */
const BOOKS = [
  { value: '/sales/campaigns', label: 'Chiến dịch' },
  { value: '/sales/campaigns/nguon-dan', label: 'Nguồn dẫn' },
  { value: '/sales/campaigns/lo-gui', label: 'Lô gửi' },
] as const

/** Sổ nào đang mở, tính theo đường dẫn ĐẦY ĐỦ chứ không theo tiền tố.
 *
 *  Tiền tố sẽ hỏng ở đúng một chỗ và đó là chỗ hay đi nhất: `/sales/campaigns`
 *  là tiền tố của cả ba, nên "khớp tiền tố" làm ô Chiến dịch sáng kể cả khi
 *  đang đứng ở Lô gửi. Hồ sơ (`/sales/campaigns/CP-0001`,
 *  `…/nguon-dan/SR-03`) thì so khớp từ dài tới ngắn: hồ sơ nguồn dẫn phải sáng
 *  ô Nguồn dẫn, không phải ô Chiến dịch. */
function currentBook(pathname: string): string {
  const nested = BOOKS.filter((b) => b.value !== '/sales/campaigns').find(
    (b) => pathname === b.value || pathname.startsWith(`${b.value}/`),
  )
  return nested?.value ?? '/sales/campaigns'
}

/** Đặt ngay dưới `ScreenHeader` của cả ba sổ. Không nhận prop nào: sổ đang mở
 *  đọc từ đường dẫn, nên không có cách nào để một màn khai sai chỗ nó đang
 *  đứng. */
export function Module1Books() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <SegmentedControl
      label="Sổ"
      hideLabel
      options={BOOKS.map((b) => ({ value: b.value, label: b.label }))}
      value={currentBook(pathname)}
      onChange={(value) => navigate(value)}
    />
  )
}
