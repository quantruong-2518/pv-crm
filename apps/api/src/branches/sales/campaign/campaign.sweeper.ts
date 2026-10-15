import { Injectable, Logger } from '@nestjs/common'
import { CAMPAIGN_FINISHED, LEAD_NURTURED } from '@pv/engines'
import { NOTIFICATION_DETAIL_COUNT } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { LEAD_NOTE } from '../lead/lead-write.mapper'
import { LeadStateWriter } from '../lead/lead-state'
import { CampaignParkRepository, type SilentMember } from './campaign-park.repository'
import { CampaignRepository } from './campaign.repository'

/** The machine's park reason, "no reply to the campaign" (flow C5), named by
 *  id because migration 0111 inserts it under this id and fails if the id holds
 *  any other reason; the desk may rename it, the id never moves. */
export const CAMPAIGN_SILENT_REASON = 'EX-07'

/** LƯỢT QUÉT TẦNG TRÊN CÙNG — anh em của `MailRelay` và `MailRunSweeper`, và
 *  là bậc thứ ba của cùng một câu hỏi.
 *
 *      MailRelay        một LÁ THƯ đến hạn chưa → thành job chưa
 *      MailRunSweeper   một LÔ còn thư nào chờ không → đóng hay ngắt cầu dao
 *      CampaignSweeper  một CHIẾN DỊCH còn đợt nào chưa ngã ngũ không → XONG
 *
 *  Ba tầng vì ba vị ngữ trên ba bảng khác nhau, và không tầng nào trả lời được
 *  câu của tầng trên: `mail_run` không biết chiến dịch nào đang chờ nó — dây
 *  nối `sales.mail_sequence_run` chạy một chiều từ nhánh sang nền, đúng như quyết
 *  định #1 và #2 của
 *  `docs/decisions/0040-mas-mail-data-model-decisions.md` chốt.
 *  Nên câu hỏi cuối cùng phải
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

  constructor(
    private readonly repo: CampaignRepository,
    private readonly hub: NotificationHub,
    private readonly parks: CampaignParkRepository,
    private readonly states: LeadStateWriter,
  ) {}

  /** Một lượt. Trả về mã những chiến dịch vừa đóng, cho người gọi muốn khẳng
   *  định trên nó.
   *
   *  Không bọc try/catch: vòng lặp của worker đã nuốt một lượt hỏng
   *  (`void … .catch`), và một lượt chết không để lại gì dở dang — câu UPDATE
   *  hoặc chạy trọn hoặc không chạy — nên nhịp sau làm lại từ đầu. */
  async sweep(): Promise<string[]> {
    /* Close, the owner's bell and C5 in ONE transaction (ADR 0093, 0097 §6): a
       campaign is never DONE while its silent leads stay in `working`, and a
       failed park retries all three. No actor, so even the owner hears it. */
    const { closed, parked } = await this.repo.run(async (tx) => {
      const rows = await this.repo.closeFinished(tx)
      for (const row of rows) {
        await this.hub.announce(tx, {
          event: {
            name: CAMPAIGN_FINISHED,
            ref: { code: row.code },
            audiences: { owner: row.ownerId ? [row.ownerId] : [] },
            occurrence: String(row.updatedAt.getTime()),
          },
          subject: { kind: 'campaign', code: row.code, label: row.name },
        })
      }
      const closed = rows.map((row) => row.code)
      const silent = await this.parks.silentMembers(tx, closed)
      const note = LEAD_NOTE.nurtured(CAMPAIGN_SILENT_REASON, undefined)
      for (const { code } of silent) {
        const park = { by: null, reasonId: CAMPAIGN_SILENT_REASON, note }
        await this.states.parked(tx, code, park, false)
      }
      await this.ringParks(tx, rows, silent)
      return { closed, parked: silent.map((m) => m.code) }
    })

    if (closed.length > 0) {
      this.log.log(`Chiến dịch đã chạy xong mọi đợt, chuyển XONG: ${closed.join(' · ')}`)
    }
    if (parked.length > 0) {
      this.log.log(`Campaign close parked ${parked.length} silent lead(s): ${parked.join(' · ')}`)
    }

    return closed
  }

  /** C5's bell (ADR 0093): ONE `lead-nurtured` line per holder per campaign,
   *  on the campaign as a `lead-batch` and counted — a Sale reads the leads
   *  through the book, where `campaign` would need `campaign.view`. */
  private async ringParks(
    tx: Db,
    campaigns: readonly { code: string; name: string; updatedAt: Date }[],
    silent: readonly SilentMember[],
  ): Promise<void> {
    for (const c of campaigns) {
      const mine = silent.filter((m) => m.campaignCode === c.code)
      for (const holder of new Set(mine.map((m) => m.ownerId))) {
        await this.hub.announce(tx, {
          event: {
            name: LEAD_NURTURED,
            ref: { code: c.code },
            audiences: { holder: [holder] },
            occurrence: String(c.updatedAt.getTime()),
          },
          subject: { kind: 'lead-batch', code: c.code, label: c.name },
          detail: { [NOTIFICATION_DETAIL_COUNT]: mine.filter((m) => m.ownerId === holder).length },
        })
      }
    }
  }
}
