import {
  bigint,
  check,
  date,
  index,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type {
  CurrencyCode,
  OpportunityCreateState,
  OpportunityFile,
  OpportunityOwnerRole,
  StageKey,
} from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { lead } from '../lead/lead.schema'
import { sales } from '../sales.schema'

/** Cơ hội — module 3 (Ops) của nhánh Sales.
 *
 *  ------------------------------------------------------------------
 *  MỘT LEAD SINH ĐƯỢC NHIỀU CƠ HỘI
 *  ------------------------------------------------------------------
 *  Quan hệ nằm ở ĐÂY (`lead_code`), không nằm ở `lead.deal_code` như bản
 *  trước. Một cột `deal_code` trên lead ngầm định 1-1, tức khách mua lần thứ
 *  hai phải tạo một lead mới trùng công ty trùng email — và từ đó mọi con số
 *  "bao nhiêu khách" đếm sai.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG CÓ TRẠNG THÁI 'won'
 *  ------------------------------------------------------------------
 *  "Đã thắng" = có một dòng trong `contract`, suy ra chứ không lưu. Thêm một
 *  `state = 'won'` ở đây là dựng nguồn sự thật thứ hai cho cùng một câu, và
 *  hai nguồn thì có ngày lệch — cơ hội ghi 'won' mà không có hợp đồng nào, hoặc
 *  ngược lại. `closed_at` + `lost_reason` đủ kể ba trạng thái:
 *
 *      đang mở  · closed_at IS NULL
 *      đã thua  · closed_at NOT NULL AND lost_reason NOT NULL
 *      đã thắng · EXISTS (SELECT 1 FROM contract WHERE lead_code = …)
 *
 *  ------------------------------------------------------------------
 *  BỒI CỘT 28/08 — bảng thôi tối thiểu, vì phiếu đã có người điền
 *  ------------------------------------------------------------------
 *  Bản đầu dựng TỐI THIỂU, đủ để `running` của sổ lead có nghĩa và để
 *  `contract` có đích khoá ngoại. Cửa `POST /sales/opportunities` là lúc phải
 *  bồi: phiếu đổi lead → cơ hội hỏi 14 ô, và mọi ô không có cột là một ô người
 *  dùng gõ xong rồi mất. Ba thứ đáng đọc trong đợt bồi này:
 *
 *   · `state` LÀ MỘT CỘT MỚI, ĐỨNG CẠNH `stage` chứ không thay nó. Trước đây
 *     bảng chỉ giữ `stage`, và thế là mất thông tin: năm trạng thái chỉ ánh xạ
 *     xuống ba trong năm cột, nên một dòng ở "Chờ ký" không nói được nó đang
 *     Nego hay vừa bị kéo tay sang.
 *
 *     Hai cột KHÔNG phải hai nguồn cho một câu — chúng trả lời hai câu:
 *     `state` là NGƯỜI BÁN ĐANG LÀM GÌ, `stage` là ĐƠN NẰM CỘT NÀO. Lúc tạo,
 *     cột suy từ trạng thái (`stageOfState` của hợp đồng, một bảng dùng chung
 *     cho cả hai đầu). Sau đó chúng RỜI nhau một cách hợp lệ: kéo một đơn từ
 *     "Mới" sang "Đã demo" là đổi cột mà không đổi việc đang làm, và hai cột
 *     'moi'/'da-demo' không có trạng thái nào ánh xạ tới — đó chính là chỗ một
 *     cột sinh sẽ xoá mất dữ liệu của mười đơn đang mở trong sổ đóng băng.
 *
 *     `state` chỉ có BỐN giá trị — 'won' vẫn không phải trạng thái, đúng như
 *     mục trên.
 *
 *   · NGƯỜI ĐỨNG ĐƠN chuyển sang bảng nối `opportunity_owner`. Cột `owner_id`
 *     cũ chở đúng một người, mà hoa hồng chia theo DANH SÁCH và danh sách đó có
 *     hai vai (Sale chốt · BD mở cửa). Nhồi vào `text[]` thì rẻ hơn một bảng,
 *     và đổi lại không khoá ngoại được về `actor` — tức sổ chịu được một id
 *     không phải người nào, thứ chỉ lộ ra khi màn in ra một ô trống.
 *
 *   · `attachments` là `jsonb`, không phải bảng. POC giữ đúng tên và cỡ tệp,
 *     không giữ byte nào; một bảng cho hai trường không khoá ngoại đi đâu là
 *     một JOIN trả phí cho quan hệ chưa tồn tại. Ngày có chỗ chứa byte thật thì
 *     mảng này thành bảng, và đó là lúc nó có gì để trỏ tới. */
export const opportunity = sales.table(
  'opportunity',
  {
    code: text('code').primaryKey(),
    leadCode: text('lead_code')
      .notNull()
      .references(() => lead.code),

    /** Người bán ĐANG LÀM GÌ với đơn. Bốn giá trị, KHÔNG có 'close-won' —
     *  `OpportunityCreateState` của hợp đồng là đúng bộ này, không phải một
     *  bản chép hẹp hơn. */
    state: text('state').$type<OpportunityCreateState>().notNull(),

    /** Cột đơn đang đứng. NULL = đã ra khỏi bảng năm cột (thắng hoặc thua).
     *
     *  Cửa `POST /sales/opportunities` ghi cột này bằng `stageOfState(state)` —
     *  mở phiếu ra chọn trạng thái là đủ, không ai phải chọn cột. Sau đó hai cột rời
     *  nhau được, và đó là tính năng chứ không phải rò rỉ: xem mục "BỒI CỘT" ở
     *  docblock trên. */
    stage: text('stage').$type<StageKey>(),

    /** Đơn vào cột hiện tại từ lúc nào.
     *
     *  ------------------------------------------------------------------
     *  MỘT CỘT, VÌ "ĐƠN NÀY ĐANG MỤC" KHÔNG SUY ĐƯỢC TỪ THỨ GÌ KHÁC
     *  ------------------------------------------------------------------
     *  Sổ cơ hội tô cảnh báo lên đơn nằm trong một cột lâu hơn hạn của cột đó.
     *  `created_at` không trả lời được câu ấy: một đơn mở từ tháng trước mà hôm
     *  qua mới sang "Chờ ký" thì nó mới ở cột đó một ngày. Không có cột này thì
     *  tín hiệu mục hoặc phải bỏ, hoặc phải đoán — và một cảnh báo đoán sai còn
     *  tệ hơn không có cảnh báo.
     *
     *  Đối xứng với `lead.stage_since`, và đó là chủ ý: hai sổ của cùng một
     *  phòng đo "nằm đây bao lâu rồi" theo đúng một cách.
     *
     *  Ai ghi: mọi lượt ĐỔI CỘT, và chỉ lượt đổi cột. Sửa tên đơn hay thêm một
     *  người đứng đơn KHÔNG được chạm vào nó — đồng hồ đó đo thời gian đơn đứng
     *  yên, không đo thời gian từ lần sửa cuối. `opportunity.mapper.ts#stageMove`
     *  là chỗ duy nhất quyết định điều đó.
     *
     *  NULL = đơn đã ra khỏi năm cột (thắng hoặc thua), không còn cột nào để
     *  đếm. Cùng lúc với `stage`, luôn luôn — CHECK dưới đây ép cặp đó. */
    stageSince: timestamp('stage_since', { withTimezone: true }),

    /** Tên đơn — "công ty · thứ đang chào". Cột này KHÔNG suy ra được từ lead:
     *  một khách mua hai lần có hai đơn khác tên trên cùng một dòng lead. */
    name: text('name').notNull(),

    /** Mã object account trong đồ thị E1, nếu lead đã có. Chưa khoá ngoại về
     *  `platform.object` — cùng khoản nợ với `lead.campaign_id`, ghi ra ở đây
     *  để không ai tưởng là đã có hàng rào. */
    accountCode: text('account_code'),

    amount: bigint('amount', { mode: 'number' }),
    currency: text('currency').$type<CurrencyCode>(),

    expectedClose: date('expected_close'),

    description: text('description'),

    /** Tên và cỡ tệp, không có byte nào. Mặc định `[]` chứ không NULL: "chưa
     *  đính kèm gì" và "không biết có đính kèm gì không" là một câu ở đây, và
     *  một mảng rỗng đọc ra đúng câu đó mà không cần ai kiểm NULL trước. */
    attachments: jsonb('attachments')
      .$type<OpportunityFile[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    /** Có giá trị = cơ hội đã đóng, theo hướng nào thì `lost_reason` nói. */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    lostReason: text('lost_reason'),
    /** Câu của riêng đơn này — tên đối thủ, con số họ chào, ai đổi ý. Tách khỏi
     *  `lost_reason` vì lý do thật thường là "một lý do dựng sẵn CỘNG một câu",
     *  không phải một trong hai. */
    lostNote: text('lost_note'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('opportunity_lead_idx').on(t.leadCode),
    /** Đích của khoá ngoại GHÉP bên `contract`. `code` đã là khoá chính nên
     *  cặp này thừa về mặt duy nhất — nó tồn tại chỉ để Postgres có chỗ neo
     *  khoá ngoại hai cột, và đó chính là thứ làm việc lệch trở thành bất khả
     *  thi thay vì chỉ "đừng làm thế". */
    unique('opportunity_code_lead_key').on(t.code, t.leadCode),
    check('opportunity_money_pair', sql`("amount" IS NULL) = ("currency" IS NULL)`),
    /** Thua thì phải đóng. Một cơ hội có lý do thua mà vẫn đang mở là một dòng
     *  không ai đọc được. */
    check('opportunity_lost_closed', sql`"lost_reason" IS NULL OR "closed_at" IS NOT NULL`),
    /** Và chiều còn lại của cùng một luật: `state = 'close-lost'` mà chưa đóng
     *  thì `stage` (suy ra ở trên) sẽ trả về NULL cho một đơn bảng vẫn coi là
     *  đang mở — một dòng không nằm cột nào mà cũng chưa đóng sổ. */
    check('opportunity_lost_state_closed', sql`"state" <> 'close-lost' OR "closed_at" IS NOT NULL`),
    /** Cột và đồng hồ của cột đi cùng nhau hoặc cùng vắng. Một `stage` không có
     *  `stage_since` là một đơn đứng trong cột từ "không biết bao giờ" — và màn
     *  sẽ vẽ nó là không mục, tức im lặng nói dối. Chiều ngược lại là một đồng
     *  hồ chạy cho một cột không tồn tại. */
    check('opportunity_stage_clock', sql`("stage" IS NULL) = ("stage_since" IS NULL)`),
    check(
      'opportunity_state_known',
      sql`"state" IN ('gui-quotation', 'nego', 'close-lost', 'pending')`,
    ),
  ],
)

/** Dãy cấp mã cơ hội.
 *
 *  Cùng hình với `lead_code_seq`, và ở đây cũng vì đúng lý do đó: `SELECT
 *  max(code) + 1` phát cùng một mã cho hai người bấm "Đổi thành cơ hội" cùng
 *  lúc, và người thứ hai thua khoá chính. Đây là thứ thay cho
 *  `nextOpportunityCode` của fixture — hàm đó đếm trên MẢNG trong trình duyệt,
 *  nên hai tab mở phiếu cùng lúc ra cùng một mã.
 *
 *  ------------------------------------------------------------------
 *  BẮT ĐẦU Ở 5001, VÀ CON SỐ ĐÓ KHÔNG PHẢI CHỌN BỪA
 *  ------------------------------------------------------------------
 *  Fixture DAS Vina rải mã cơ hội ở BA khoảng rời nhau, không phải một:
 *
 *      OP-0201…02xx   20 đơn đã đóng, `CLOSED_CODE_FROM` cấp lúc chạy
 *      OP-0248…0305   10 đơn đang mở, khai tay ở `OPEN_DEALS`
 *      OP-2711…2716    6 đơn đã ký, suy từ `contractCode` (`HĐ-27NN`)
 *
 *  Khoảng thứ ba là chỗ một dãy bắt đầu ở 401 sẽ chết: nó không đụng gì trong
 *  hai nghìn đơn đầu, rồi đơn thứ ~2310 nhận đúng `OP-2711` và thua khoá chính
 *  của một dòng seed. Một lỗi ngủ hai nghìn đơn rồi mới dậy là loại tệ nhất, và
 *  nó tránh được bằng một con số.
 *
 *  5001 nằm trên cả ba khoảng, và chỗ trống ở giữa không tốn gì: mã không phải
 *  bộ đếm, thủng bao nhiêu cũng được (xem `nextCode`). */
export const opportunityCodeSeq = sales.sequence('opportunity_code_seq', {
  startWith: 5001,
  increment: 1,
  minValue: 1,
  cache: 1,
})

/** Ai đứng đơn, và đứng ở nửa nào của nó.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO LÀ BẢNG CHỨ KHÔNG PHẢI HAI CỘT `text[]`
 *  ------------------------------------------------------------------
 *  Hai `text[]` là một migration và không có bảng nào thêm vào sơ đồ — đổi lại
 *  mất đúng ba thứ, và cả ba đều là thứ chỉ lộ ra muộn:
 *
 *   · KHOÁ NGOẠI. Một id gõ sai vào mảng thì bảng nhận, và nó lộ ra ở màn dưới
 *     dạng một ô trống không ai truy được về đâu. Ở đây Postgres từ chối ngay.
 *   · "ĐƠN CỦA TÔI". Với mảng thì câu đó là một phép quét; với bảng nó là một
 *     index, và đó là câu sổ cơ hội hỏi mỗi lần mở.
 *   · VAI. `role` ở đây là một cột có thể lọc và đếm — phần chốt của hoa hồng
 *     đi theo `SALE`, công trạng mở cửa đi theo `BD`, và không ai phải nhớ
 *     "mảng thứ nhất là Sale".
 *
 *  Khoá chính ba cột cho phép MỘT người đứng cả hai vai trên cùng một đơn —
 *  phòng bảy người thì chuyện đó có thật, và khoá hai cột sẽ cấm nó. */
export const opportunityOwner = sales.table(
  'opportunity_owner',
  {
    opportunityCode: text('opportunity_code')
      .notNull()
      .references(() => opportunity.code, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),
    role: text('role').$type<OpportunityOwnerRole>().notNull(),
  },
  (t) => [
    primaryKey({
      name: 'opportunity_owner_pk',
      columns: [t.opportunityCode, t.actorId, t.role],
    }),
    /** "Đơn của tôi" — xem docblock trên. */
    index('opportunity_owner_actor_idx').on(t.actorId),
    check('opportunity_owner_role_known', sql`"role" IN ('SALE', 'BD')`),
  ],
)

export type OpportunityRowDb = typeof opportunity.$inferSelect
export type OpportunityOwnerRowDb = typeof opportunityOwner.$inferSelect
