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

  /** One tick. Returns the codes of the campaigns it closed, so a caller can
   *  assert on them.
   *
   *  One transaction per campaign: a campaign that fails is logged, the others
   *  still commit, and the next tick retries that one alone. An error while
   *  listing candidates is not caught here; it reaches the worker loop
   *  (`void … .catch`), which swallows it. */
  async sweep(): Promise<string[]> {
    const closed: string[] = []
    for (const code of await this.repo.finishableCodes()) {
      try {
        if (await this.close(code)) closed.push(code)
      } catch (err) {
        this.log.error(`Campaign ${code} not closed; retrying next tick`, err)
      }
    }

    if (closed.length > 0) {
      this.log.log(`Chiến dịch đã chạy xong mọi đợt, chuyển XONG: ${closed.join(' · ')}`)
    }
    return closed
  }

  /** Close, the owner's bell and C5 in ONE transaction (ADR 0093, 0097 §6): a
   *  campaign is never DONE while its silent leads stay in `working`, and a
   *  failed park retries all three. No actor, so even the owner hears it.
   *  `false` when another tick closed it between the listing and here. */
  private async close(code: string): Promise<boolean> {
    const { row, parked } = await this.repo.run(async (tx) => {
      const [row] = await this.repo.closeFinished(tx, code)
      if (!row) return { row: undefined, parked: [] }
      const silent = await this.parks.silentMembers(tx, [code])
      /* The owner's one line counts every lead this close parks (owner, 15/10/2026). */
      await this.hub.announce(tx, {
        event: {
          name: CAMPAIGN_FINISHED,
          ref: { code },
          audiences: { owner: row.ownerId ? [row.ownerId] : [] },
          occurrence: String(row.updatedAt.getTime()),
        },
        subject: { kind: 'campaign', code, label: row.name },
        detail: silent.length > 0 ? { [NOTIFICATION_DETAIL_COUNT]: silent.length } : null,
      })
      const note = LEAD_NOTE.nurtured(CAMPAIGN_SILENT_REASON, undefined)
      const park = { by: null, reasonId: CAMPAIGN_SILENT_REASON, note }
      await this.states.parkedMany(
        tx,
        silent.map((m) => m.code),
        park,
      )
      await this.ringParks(tx, row, silent)
      return { row, parked: silent.map((m) => m.code) }
    })

    if (parked.length > 0) {
      this.log.log(
        `Campaign ${code} close parked ${parked.length} silent lead(s): ${parked.join(' · ')}`,
      )
    }
    return row !== undefined
  }

  /** C5's bell (ADR 0093): ONE `lead-nurtured` line per holder per campaign,
   *  on the campaign as a `lead-batch` and counted — a Sale reads the leads
   *  through the book, where `campaign` would need `campaign.view`. The
   *  campaign's owner is skipped: their `campaign-finished` line counts them. */
  private async ringParks(
    tx: Db,
    c: { code: string; name: string; updatedAt: Date; ownerId: string | null },
    silent: readonly SilentMember[],
  ): Promise<void> {
    for (const holder of new Set(silent.map((m) => m.ownerId))) {
      if (holder === c.ownerId) continue
      await this.hub.announce(tx, {
        event: {
          name: LEAD_NURTURED,
          ref: { code: c.code },
          audiences: { holder: [holder] },
          occurrence: String(c.updatedAt.getTime()),
        },
        subject: { kind: 'lead-batch', code: c.code, label: c.name },
        detail: { [NOTIFICATION_DETAIL_COUNT]: silent.filter((m) => m.ownerId === holder).length },
      })
    }
  }
}
