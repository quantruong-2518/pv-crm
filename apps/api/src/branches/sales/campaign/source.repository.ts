import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { REQUIRED_SLOTS } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { mailRun } from '@api/platform/mail/mail-run.schema'
import { configEntry } from '../config/config.schema'
import { lead } from '../lead/lead.schema'
import { opportunity } from '../opportunity/opportunity.schema'
import { campaign, campaignRun } from './campaign.schema'
import { sourceCost, sourceEvent, sourceFollower } from './source.schema'

/** SQL của module 1 · Chiến dịch & Sự kiện. Quyết định KHÔNG có gì ở đây.
 *
 *  ------------------------------------------------------------------
 *  SÁU CÂU ĐỌC, KHÔNG PHẢI MỘT CÂU TO
 *  ------------------------------------------------------------------
 *  Một `SELECT` gộp cả lead, cơ hội, hoá đơn, đợt gửi và người theo dõi vào một
 *  hàng cho mỗi nguồn là một tích Descartes: một nguồn có 3 đợt · 5 dòng chi ·
 *  2 người theo dõi cho ra 30 hàng, và mọi `count()` trên đó đều sai theo một
 *  cách không ai kiểm bằng mắt được. Sáu câu, mỗi câu một hạt (`GROUP BY` đúng
 *  một chiều), rồi service ghép lại theo mã nguồn.
 *
 *  Sáu lượt đi lại xuống Postgres cho một màn — con số đó chấp nhận được vì
 *  danh mục nguồn của một phòng kinh doanh là hàng chục dòng, không phải hàng
 *  chục nghìn. Ngày nó không còn chấp nhận được thì thứ phải đổi là gộp bằng
 *  `LATERAL`, không phải gộp bằng `JOIN`.
 *
 *  ------------------------------------------------------------------
 *  "LEAD TỐT" ĐẾM Ở SQL, KHÔNG ĐẾM Ở JAVASCRIPT
 *  ------------------------------------------------------------------
 *  `required_filled` là cột SINH — Postgres giữ nó đúng theo sáu ô của cổng
 *  init data, và một câu `count(*) FILTER (WHERE required_filled >= N)` đọc
 *  đúng thứ cổng đọc. Kéo cả sổ lead về rồi đếm bằng JS là kéo vài nghìn dòng
 *  để trả lời một con số, và là một bản chép thứ hai của luật cổng. */
@Injectable()
export class SourceRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Danh mục nguồn — mọi dòng `SOURCE`, kể cả dòng đã tắt.
   *
   *  Dòng tắt vẫn về, và đó là chủ ý: nguồn đã tắt vẫn giữ lead nó kéo về và
   *  tiền nó đã tiêu, nên bỏ nó khỏi báo cáo là làm tổng chi của kỳ hụt đi.
   *  Màn nhận cờ `active` và tự quyết hiện nó ở đâu. */
  async catalogue() {
    return this.db
      .select({
        code: configEntry.id,
        name: configEntry.name,
        kind: configEntry.kind,
        active: configEntry.active,
        ord: configEntry.ord,
        ownerId: configEntry.ownerId,
        ownerName: actor.name,
      })
      .from(configEntry)
      .leftJoin(actor, eq(actor.id, configEntry.ownerId))
      .where(eq(configEntry.list, 'SOURCE'))
      .orderBy(asc(configEntry.ord), asc(configEntry.id))
  }

  /** Người theo dõi thêm, kèm tên. Chủ nguồn KHÔNG nằm trong bảng này. */
  async followers() {
    return this.db
      .select({
        sourceId: sourceFollower.sourceId,
        actorId: sourceFollower.actorId,
        name: actor.name,
      })
      .from(sourceFollower)
      .innerJoin(actor, eq(actor.id, sourceFollower.actorId))
      .orderBy(asc(actor.name))
  }

  /** Lead theo nguồn: tổng, số qua cổng, và hai mốc đầu–cuối.
   *
   *  `campaign_id IS NOT NULL` cắt sạch lead không thuộc nguồn nào — lead gõ
   *  tay và lead khách tự bấm từ landing page. Chúng KHÔNG mất: `totals()` đếm
   *  cả sổ, nên chỗ chênh giữa hai con số chính là nhóm "không nguồn", thứ màn
   *  phải nói ra chứ không được lặng lẽ nuốt. */
  async leadTallies() {
    return this.db
      .select({
        sourceId: lead.campaignId,
        leads: sql<number>`count(*)::int`,
        good: sql<number>`count(*) FILTER (WHERE ${lead.requiredFilled} >= ${REQUIRED_SLOTS})::int`,
        firstAt: sql<Date | null>`min(${lead.createdAt})`,
        lastAt: sql<Date | null>`max(${lead.createdAt})`,
      })
      .from(lead)
      .where(isNotNull(lead.campaignId))
      .groupBy(lead.campaignId)
  }

  /** Cơ hội theo nguồn, đi vòng qua lead vì cơ hội không mang mã nguồn.
   *
   *  `count(DISTINCT code)` chứ không `count(*)`: một lead mở được nhiều cơ hội
   *  (đó là lý do `opportunity.lead_code` tồn tại thay cho một quan hệ 1-1), và
   *  đếm thô ở đây vẫn đúng — nhưng `DISTINCT` nói rõ đơn vị đang đếm là ĐƠN,
   *  và giữ câu này đúng vào ngày ai đó thêm một `JOIN` nữa vào nó. */
  async opsTallies() {
    return this.db
      .select({
        sourceId: lead.campaignId,
        ops: sql<number>`count(DISTINCT ${opportunity.code})::int`,
      })
      .from(opportunity)
      .innerJoin(lead, eq(lead.code, opportunity.leadCode))
      .where(isNotNull(lead.campaignId))
      .groupBy(lead.campaignId)
  }

  /** Mọi dòng chi, xếp theo ngày tiêu. Service gom theo nguồn. */
  async costs() {
    return this.db.select().from(sourceCost).orderBy(asc(sourceCost.spentOn), asc(sourceCost.id))
  }

  /** Khối sự kiện của những nguồn có một khối. */
  async events() {
    return this.db.select().from(sourceEvent)
  }

  /** Chuỗi đợt của mọi nguồn: `campaign_run` → `sales.campaign` (lấy nguồn) →
   *  `platform.mail_run` (lấy nhãn và mốc chạy).
   *
   *  Hướng JOIN là hướng DUY NHẤT được phép: nhánh Sales đọc sang bảng của
   *  platform. Câu ngược lại — platform tự tìm chiến dịch của một lô — là thứ
   *  `MailRunRepository.list()` từ chối làm và ném lỗi nếu bị ép.
   *
   *  Số đếm (gửi · nhận · mở · bấm · dội) KHÔNG lấy ở đây: chúng là aggregate
   *  trên `email_delivery`/`mail_event` và `MailRunRepository.tallies()` là chỗ
   *  duy nhất biết đếm chúng đúng. */
  async waves() {
    return this.db
      .select({
        sourceId: campaign.sourceId,
        campaignCode: campaignRun.campaignCode,
        waveNo: campaignRun.waveNo,
        expected: campaignRun.expected,
        mailRunId: campaignRun.mailRunId,
        label: mailRun.label,
        state: mailRun.state,
        startedAt: mailRun.startedAt,
        scheduledAt: mailRun.scheduledAt,
        audience: mailRun.audienceCount,
      })
      .from(campaignRun)
      .innerJoin(campaign, eq(campaign.code, campaignRun.campaignCode))
      .innerJoin(mailRun, eq(mailRun.id, campaignRun.mailRunId))
      .where(isNotNull(campaign.sourceId))
      .orderBy(asc(campaign.sourceId), asc(campaignRun.waveNo))
  }

  /** Hai con số của cả sổ mà bảng nguồn không trả lời được.
   *
   *  `leadsAll` gồm cả lead không nguồn; `opsBook` là toàn bộ sổ cơ hội. Chỗ
   *  chênh giữa chúng và tổng cộng của các nguồn LÀ nội dung — nó đo phần
   *  khách tự tìm tới, thứ không nguồn nào được ghi công. */
  async book() {
    const [row] = await this.db
      .select({
        leadsAll: sql<number>`count(*)::int`,
        goodAll: sql<number>`count(*) FILTER (WHERE ${lead.requiredFilled} >= ${REQUIRED_SLOTS})::int`,
        firstAt: sql<Date | null>`min(${lead.createdAt})`,
        lastAt: sql<Date | null>`max(${lead.createdAt})`,
      })
      .from(lead)

    const [ops] = await this.db.select({ n: sql<number>`count(*)::int` }).from(opportunity)

    return {
      leadsAll: row?.leadsAll ?? 0,
      goodAll: row?.goodAll ?? 0,
      firstAt: row?.firstAt ?? null,
      lastAt: row?.lastAt ?? null,
      opsBook: ops?.n ?? 0,
    }
  }

  /** Mốc chi sớm nhất và muộn nhất — nửa còn lại của kỳ báo cáo.
   *
   *  Kỳ KHÔNG lấy từ một hằng số đóng băng nữa: nó là khoảng thời gian dữ liệu
   *  thật đang trải ra. Tiền tiêu trước khi lead đầu tiên về là chuyện thường
   *  (mua dữ liệu rồi mới chạy), nên mốc đầu của kỳ phải xét cả bảng này. */
  async costWindow() {
    const [row] = await this.db
      .select({
        firstAt: sql<string | null>`min(${sourceCost.spentOn})`,
        lastAt: sql<string | null>`max(${sourceCost.spentOn})`,
        total: sql<number>`coalesce(sum(${sourceCost.amount}), 0)::bigint`,
      })
      .from(sourceCost)

    return {
      firstAt: row?.firstAt ?? null,
      lastAt: row?.lastAt ?? null,
      /** `sum(bigint)` về dạng chuỗi qua driver `pg` — `numeric` không lọt vừa
       *  `number` nên node-postgres trả chuỗi cho an toàn. Ép ở ĐÂY, một lần,
       *  thay vì để một `Number(...)` lạc chỗ nào đó trong service. */
      total: Number(row?.total ?? 0),
    }
  }

  /** Mốc chạy sớm/muộn của mọi lô thuộc một nguồn nào đó — nửa thứ ba của kỳ. */
  async waveWindow() {
    const [row] = await this.db
      .select({
        firstAt: sql<Date | null>`min(coalesce(${mailRun.startedAt}, ${mailRun.scheduledAt}))`,
        lastAt: sql<Date | null>`max(coalesce(${mailRun.startedAt}, ${mailRun.scheduledAt}))`,
      })
      .from(campaignRun)
      .innerJoin(campaign, eq(campaign.code, campaignRun.campaignCode))
      .innerJoin(mailRun, eq(mailRun.id, campaignRun.mailRunId))
      .where(and(isNotNull(campaign.sourceId), isNotNull(mailRun.startedAt)))

    return { firstAt: row?.firstAt ?? null, lastAt: row?.lastAt ?? null }
  }

  /** Lô mới nhất của cả sổ — dùng khi không nguồn nào có mốc nào cả, để kỳ
   *  không rơi về "hôm nay tới hôm nay" trên một database vừa dựng. */
  async latestRunAt() {
    const [row] = await this.db
      .select({ at: mailRun.createdAt })
      .from(mailRun)
      .orderBy(desc(mailRun.createdAt))
      .limit(1)
    return row?.at ?? null
  }
}
