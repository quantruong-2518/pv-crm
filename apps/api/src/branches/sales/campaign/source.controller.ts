import { Controller, Get } from '@nestjs/common'
import { Need } from '@api/platform/access/need.decorator'
import { SourceService } from './source.service'

/** Module 1 · Chiến dịch & Sự kiện — hai cửa ĐỌC của bảng nguồn.
 *
 *  ------------------------------------------------------------------
 *  `chiến-dịch.xem`, VÀ KHÔNG `scoped`
 *  ------------------------------------------------------------------
 *  Hai cửa này trả về SỐ CỦA CẢ PHÒNG, không trả dòng dữ liệu của ai. Một Sale
 *  `ownOnly` vẫn phải đọc được "nguồn nào đang ra lead tốt" — đó là thứ họ dùng
 *  để chọn việc, và cắt nó theo phạm vi thì con số còn lại không nói lên điều
 *  gì (một phần tám chiến dịch, tính trên một phần ba sổ lead).
 *
 *  Cắt theo phạm vi ở đây cũng không CÓ NGHĨA gì: không dòng nào trong hai câu
 *  trả lời đứng tên một người. Khai `scoped: true` cho chúng là hứa một lần cắt
 *  mà máy chủ không thực hiện, và một lời hứa như thế đọc y hệt một lỗ hổng.
 *
 *  ------------------------------------------------------------------
 *  HAI CỬA CHỨ KHÔNG MỘT
 *  ------------------------------------------------------------------
 *  Bảng và hàng score card đổi nhịp khác nhau: bảng đọc lại mỗi lần người dùng
 *  lọc, hàng tổng thì không đổi cho tới khi có lô mới hoặc hoá đơn mới. Gộp
 *  chúng là bắt hàng tổng đi lại cùng nhịp với bảng, và bắt bảng chở theo mười
 *  con số nó không vẽ. Hai `queryKey` riêng ở tầng màn cũng cần đúng hai cửa. */
@Controller('sales/campaigns')
export class SourceController {
  constructor(private readonly sources: SourceService) {}

  /** Bảng nguồn — một dòng một nguồn, kèm đợt · hoá đơn · sự kiện của nó. */
  @Get('sources')
  @Need({ branch: 'Sales', permission: 'chiến-dịch.xem' })
  list() {
    return this.sources.sources()
  }

  /** Hàng score card. Khai SAU `sources` để hai đường của cùng một tài nguyên
   *  nằm cạnh nhau, đọc bảng trước rồi tới tổng — cùng nếp với
   *  `MasController`. Không segment nào nuốt segment nào ở đây; nếp vẫn là
   *  nếp, đúng lý do đã ghi ở `UsersController.directory`. */
  @Get('totals')
  @Need({ branch: 'Sales', permission: 'chiến-dịch.xem' })
  totals() {
    return this.sources.totals()
  }
}
