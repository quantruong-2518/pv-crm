import { Injectable } from '@nestjs/common'
import {
  CampaignSourceResponse,
  CampaignTotals,
  SourceKind,
  type CampaignSource,
  type SourceWave,
} from '@pv/contracts'
import { MailRunRepository, type RunTally } from '@api/platform/mail/mail-run.repository'
import { SourceRepository } from './source.repository'

/** Module 1 · Chiến dịch & Sự kiện — chỗ DUY NHẤT biết cả repository lẫn hợp
 *  đồng của màn.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG MỘT TỈ LỆ NÀO RỜI KHỎI FILE NÀY
 *  ------------------------------------------------------------------
 *  `openRate`, `costPerGood`, dải Wilson, "đang chạy hay đã xong" — cả bốn đều
 *  tính được từ những con số dưới đây và cả bốn đều nằm ở tầng màn
 *  (`data/campaigns.ts` + `@pv/engines/stats`). Lý do đầy đủ ở docblock của
 *  `packages/contracts/src/sales/campaign.ts`; tóm lại là một tỉ lệ đi qua dây
 *  là một tỉ lệ người đọc không biết nó chia trên mẫu số nào.
 *
 *  ------------------------------------------------------------------
 *  KỲ BÁO CÁO SUY TỪ DỮ LIỆU, KHÔNG PHẢI TỪ MỘT HẰNG SỐ
 *  ------------------------------------------------------------------
 *  Bản fixture có `DAS_VINA_PERIOD` — hai mốc đóng băng ghi thẳng trong kịch
 *  bản. Với dữ liệu thật thì kỳ là khoảng mà dữ liệu đang trải ra: lead sớm
 *  nhất hoặc hoá đơn sớm nhất (mua dữ liệu xong mới chạy, nên tiền hay đi
 *  trước lead), tới mốc muộn nhất trong ba nguồn mốc. Database trắng thì cả ba
 *  đều rỗng và kỳ rút về đúng "bây giờ" — một câu trả lời thật cho một sổ
 *  trống, không phải một khoảng bịa. */
@Injectable()
export class SourceService {
  constructor(
    private readonly repo: SourceRepository,
    private readonly runs: MailRunRepository,
  ) {}

  async sources(): Promise<CampaignSourceResponse> {
    const [catalogue, followers, leads, ops, costs, events, waves] = await Promise.all([
      this.repo.catalogue(),
      this.repo.followers(),
      this.repo.leadTallies(),
      this.repo.opsTallies(),
      this.repo.costs(),
      this.repo.events(),
      this.repo.waves(),
    ])

    /* Số đếm của mọi lô trong MỘT lượt, không phải một lượt mỗi đợt: hai mươi
       đợt là hai mươi vòng mạng cho hai câu `GROUP BY` mà một vòng trả lời
       được cả. */
    const tallies = await this.runs.tallies(waves.map((w) => w.mailRunId))

    const leadBy = new Map(leads.map((r) => [r.sourceId ?? '', r]))
    const opsBy = new Map(ops.map((r) => [r.sourceId ?? '', r.ops]))

    const rows: CampaignSource[] = catalogue.map((s) => {
      const tally = leadBy.get(s.code)
      const mine = waves.filter((w) => w.sourceId === s.code)
      const event = events.find((e) => e.sourceId === s.code)

      const waveRows: SourceWave[] = mine.map((w) => {
        const t: RunTally | undefined = tallies.get(w.mailRunId)
        const at = w.startedAt ?? w.scheduledAt
        return {
          no: w.waveNo,
          label: w.label,
          mailRunId: w.mailRunId,
          sentAt: at ? at.toISOString() : undefined,
          audience: w.audience,
          sent: t?.sent ?? 0,
          delivered: t?.delivered ?? 0,
          opened: t?.opened ?? 0,
          clicked: t?.clicked ?? 0,
          bounced: t?.bounced ?? 0,
          expected: w.expected,
        }
      })

      const costRows = costs
        .filter((c) => c.sourceId === s.code)
        .map((c) => ({
          id: c.id,
          kind: c.kind,
          label: c.label,
          amount: c.amount,
          spentOn: c.spentOn,
        }))

      /* Mốc của MỘT nguồn: lead sớm nhất, đợt sớm nhất, hoá đơn sớm nhất —
         cùng ba nguồn mốc với kỳ của cả sổ, chỉ hẹp lại vào một dòng. */
      const marks = [
        tally?.firstAt ?? null,
        tally?.lastAt ?? null,
        ...waveRows.map((w) => (w.sentAt ? new Date(w.sentAt) : null)),
        ...costRows.map((c) => new Date(c.spentOn)),
      ].filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))

      return {
        code: s.code,
        name: s.name,
        /* `kind` là `text` tự do ở tầng bảng, nên một giá trị lạ là chuyện có
           thể xảy ra. Bỏ qua nó thay vì ném: một dòng cấu hình gõ sai loại
           không được phép làm chết cả màn, và `undefined` đã có nghĩa sẵn
           ("chưa ai gán loại") mà màn đang chịu được. */
        kind: SourceKind.safeParse(s.kind).data,
        active: s.active,
        ownerId: s.ownerId ?? undefined,
        ownerName: s.ownerName ?? undefined,
        followers: followers
          .filter((f) => f.sourceId === s.code)
          .map((f) => ({ id: f.actorId, name: f.name })),
        leads: tally?.leads ?? 0,
        goodLeads: tally?.good ?? 0,
        ops: opsBy.get(s.code) ?? 0,
        waves: waveRows,
        costs: costRows,
        event: event
          ? {
              venue: event.venue ?? undefined,
              registered: event.registered ?? undefined,
              checkedIn: event.checkedIn ?? undefined,
              heldOn: event.heldOn ?? undefined,
            }
          : undefined,
        firstAt: marks.length > 0 ? isoOf(min(marks)) : undefined,
        lastAt: marks.length > 0 ? isoOf(max(marks)) : undefined,
      }
    })

    /* Kiểm hình TRƯỚC khi gửi, cùng lý do `UsersService.list` nêu: một cột đổi
       kiểu và một mapper trôi theo nó đều biên dịch được, và không cái nào sống
       sót qua dòng này. */
    return CampaignSourceResponse.parse({ rows, period: await this.period() })
  }

  async totals(): Promise<CampaignTotals> {
    const [book, costWindow, catalogue, leads, ops, waves] = await Promise.all([
      this.repo.book(),
      this.repo.costWindow(),
      this.repo.catalogue(),
      this.repo.leadTallies(),
      this.repo.opsTallies(),
      this.repo.waves(),
    ])

    const tallies = await this.runs.tallies(waves.map((w) => w.mailRunId))
    const kindOf = new Map(catalogue.map((s) => [s.code, SourceKind.safeParse(s.kind).data]))

    /* Nguồn TỰ NHIÊN tách riêng vì không ai chạy chiến dịch nào cho chúng: gộp
       vào tổng thì mọi tỉ lệ của kỳ đọc như thể phòng đã chạy chiến dịch cho cả
       trăm lead, trong khi một phần lead tự đến. */
    const naturalCodes = new Set(
      catalogue.filter((s) => kindOf.get(s.code) === 'tu-nhien').map((s) => s.code),
    )

    const ran = leads.filter((r) => r.sourceId !== null && !naturalCodes.has(r.sourceId))
    const natural = leads.filter((r) => r.sourceId !== null && naturalCodes.has(r.sourceId))

    const add = (pick: (t: RunTally) => number) =>
      waves.reduce(
        (n, w) => n + (tallies.get(w.mailRunId) ? pick(tallies.get(w.mailRunId)!) : 0),
        0,
      )

    return CampaignTotals.parse({
      sources: catalogue.filter((s) => !naturalCodes.has(s.code)).length,
      natural: {
        count: naturalCodes.size,
        leads: natural.reduce((n, r) => n + r.leads, 0),
      },

      waves: waves.length,
      audience: waves.reduce((n, w) => n + w.audience, 0),
      sent: add((t) => t.sent),
      delivered: add((t) => t.delivered),
      opened: add((t) => t.opened),
      clicked: add((t) => t.clicked),
      bounced: add((t) => t.bounced),

      /* Lead và cơ hội của những nguồn CÓ người chạy. `book.leadsAll` và
         `book.opsBook` là cả sổ, nên chỗ chênh chính là phần không nguồn nào
         được ghi công — màn in nó ra chứ không để người xem tự trừ. */
      leads: ran.reduce((n, r) => n + r.leads, 0),
      goodLeads: ran.reduce((n, r) => n + r.good, 0),
      ops: ops
        .filter((r) => r.sourceId !== null && !naturalCodes.has(r.sourceId))
        .reduce((n, r) => n + r.ops, 0),
      opsBook: book.opsBook,

      cost: costWindow.total,
      period: await this.period(),
    })
  }

  /** Kỳ báo cáo — sớm nhất và muộn nhất trong ba nguồn mốc.
   *
   *  Sổ trắng thì cả ba rỗng và kỳ rút về "bây giờ → bây giờ". Đó là câu trả
   *  lời thật cho một sổ chưa có gì, và màn vẽ được nó thành một trục rỗng —
   *  khác hẳn một khoảng bịa ra để trục trông có nội dung. */
  private async period(): Promise<{ fromISO: string; toISO: string }> {
    const [book, cost, wave, latest] = await Promise.all([
      this.repo.book(),
      this.repo.costWindow(),
      this.repo.waveWindow(),
      this.repo.latestRunAt(),
    ])

    const marks = [
      book.firstAt,
      book.lastAt,
      cost.firstAt ? new Date(cost.firstAt) : null,
      cost.lastAt ? new Date(cost.lastAt) : null,
      wave.firstAt,
      wave.lastAt,
      latest,
    ].filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))

    if (marks.length === 0) {
      const now = new Date().toISOString()
      return { fromISO: now, toISO: now }
    }
    return { fromISO: isoOf(min(marks)), toISO: isoOf(max(marks)) }
  }
}

const min = (ds: readonly Date[]): Date => ds.reduce((a, b) => (b < a ? b : a))
const max = (ds: readonly Date[]): Date => ds.reduce((a, b) => (b > a ? b : a))
const isoOf = (d: Date): string => d.toISOString()
