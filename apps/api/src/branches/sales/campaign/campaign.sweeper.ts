import { Injectable, Logger } from '@nestjs/common'
import { CampaignRepository } from './campaign.repository'

/** LƯỢT QUÉT TẦNG TRÊN CÙNG — anh em của `MailRelay` và `MailRunSweeper`, và
 *  là bậc thứ ba của cùng một câu hỏi.
 *
 *      MailRelay        một LÁ THƯ đến hạn chưa → thành job chưa
 *      MailRunSweeper   một LÔ còn thư nào chờ không → đóng hay ngắt cầu dao
 *      CampaignSweeper  một CHIẾN DỊCH còn đợt nào chưa ngã ngũ không → XONG
 *
 *  Ba tầng vì ba vị ngữ trên ba bảng khác nhau, và không tầng nào trả lời được
 *  câu của tầng trên: `mail_run` không biết chiến dịch nào đang chờ nó — dây
 *  nối `sales.campaign_run` chạy một chiều từ nhánh sang nền, đúng như quyết
 *  định #1 và #2 của `ban-giao-mas-mail.md` chốt. Nên câu hỏi cuối cùng phải
 *  hỏi từ phía nhánh, và file này là chỗ duy nhất hỏi được.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO NÓ KHÔNG THỂ SỐNG TRONG TIẾN TRÌNH HTTP
 *  ------------------------------------------------------------------
 *  Giống hệt lý lẽ ở đầu `mail-run.sweeper.ts`: request gọi `/start` kết thúc
 *  sau vài giây, còn "mọi đợt đã ngã ngũ" chỉ đúng sau vài phút tới vài NGÀY —
 *  một chiến dịch ba đợt cách nhau một tuần thì lượt đóng nằm cách lượt bắn
 *  đúng một tuần. Không có request nào sống lâu đến thế, nên chỗ duy nhất còn
 *  lại là cái đồng hồ của worker.
 *
 *  Đi chung nhịp `PV_QUEUE_POLL_SECONDS` với hai lượt kia, vì cùng một lý do
 *  đã ghi ở đó: thêm một đồng hồ là thêm một con số phải giải thích, và ở đây
 *  không có gì để đổi lấy — trễ vài giây trên một mốc tính bằng ngày thì
 *  không ai đo được.
 *
 *  ------------------------------------------------------------------
 *  GHI Ở MỨC `log`, KHÔNG PHẢI `warn`
 *  ------------------------------------------------------------------
 *  Khác `MailRunSweeper`: cầu dao ngắt là SỰ CỐ, còn chiến dịch chạy xong là
 *  chuyện bình thường nhất trong ngày. Một dòng cho cả lượt, kèm danh sách mã
 *  — mã chiến dịch không phải dữ liệu người nhận, đưa vào log được. */
@Injectable()
export class CampaignSweeper {
  private readonly log = new Logger('sales.campaign')

  constructor(private readonly repo: CampaignRepository) {}

  /** Một lượt. Trả về mã những chiến dịch vừa đóng, cho người gọi muốn khẳng
   *  định trên nó.
   *
   *  Không bọc try/catch: vòng lặp của worker đã nuốt một lượt hỏng
   *  (`void … .catch`), và một lượt chết không để lại gì dở dang — câu UPDATE
   *  hoặc chạy trọn hoặc không chạy — nên nhịp sau làm lại từ đầu. */
  async sweep(): Promise<string[]> {
    const closed = await this.repo.closeFinished()

    if (closed.length > 0) {
      this.log.log(`Chiến dịch đã chạy xong mọi đợt, chuyển XONG: ${closed.join(' · ')}`)
    }

    return closed
  }
}
