import {
  bigint,
  check,
  date,
  index,
  integer,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'
import type {
  ContactChannel,
  CurrencyCode,
  ExitReason,
  LeadCategory,
  LeadMotion,
  LeadSourceKind,
  LeadTier,
  StageKey,
} from '@pv/contracts'
import { actor, objectRef } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'

/** Chuỗi rỗng KHÔNG phải một giá trị — nợ số 5 của `docs/ban-giao-backend.md`.
 *
 *  Ba tầng đang có ba quy ước cho "trống": `Lead` dùng `undefined`,
 *  `LeadProfile` dùng `''`, `Opportunity` trộn cả hai. Đổ vào một bảng mà không
 *  chốt thì có dòng `''` có dòng `NULL`, và từ đó `WHERE email IS NULL` bỏ sót
 *  đúng một nửa số dòng cần tìm.
 *
 *  Ở bảng chỉ có MỘT quy ước: `NULL`. CHECK dưới đây là thứ ép nó — CHECK chỉ
 *  chặn khi biểu thức ra FALSE, mà `NULL <> ''` ra NULL, nên cột vẫn trống
 *  được, chỉ không rỗng được. Mapper chuẩn hoá một chiều lúc ghi; đây là lưới
 *  thứ hai cho ngày mapper quên. */
const noBlank = (...cols: string[]): SQL => sql.raw(cols.map((c) => `"${c}" <> ''`).join(' AND '))

/** Lead code generator — the counter half of it.
 *
 *  ------------------------------------------------------------------
 *  WHY A SEQUENCE EXISTS AT ALL
 *  ------------------------------------------------------------------
 *  `code` is a `text` primary key with no DEFAULT, so until now nothing could
 *  create a lead unless it already knew a free code — blocker #1 of the four
 *  in `docs/ban-giao-db.md`. A sequence is the only counter that stays correct
 *  with two writers at once: `SELECT max(code) + 1` hands the same code to
 *  both of them, and the second one loses to the primary key.
 *
 *  ------------------------------------------------------------------
 *  WHY IT STARTS AT 201
 *  ------------------------------------------------------------------
 *  The frozen DAS Vina fixture OWNS `LD-0101` … `LD-0200`, and `pnpm db:seed`
 *  writes those codes literally. Starting the counter past that block is what
 *  keeps a seeded database and real intake from ever colliding on a key —
 *  the sequence never hands out a code the fixture already claims.
 *
 *  ------------------------------------------------------------------
 *  WHY THE FORMAT IS **NOT** A COLUMN DEFAULT
 *  ------------------------------------------------------------------
 *  `DEFAULT 'LD-' || lpad(nextval(…)::text, 4, '0')` reads well, and it is the
 *  wrong shape here — because of the foreign key on `code` below. The mirror
 *  row in `platform.object` has to exist BEFORE the lead row does. A column
 *  default only reveals the code AFTER the insert (through `RETURNING`), by
 *  which point the row that had to come first is already too late; the only
 *  way to keep the default would be to make the foreign key `DEFERRABLE`,
 *  i.e. weaken a constraint to work around a convenience.
 *
 *  So the counter lives here and the format lives one layer up, in
 *  `LeadRepository.nextCode()`: take a number, format it, write
 *  `platform.object` and then `sales.lead` in one transaction. Same division
 *  `config_entry.id` already uses — codes there are built by the repository
 *  too.
 *
 *  `LD-%04d` PADS to four digits, it does not cap: lead 10 000 is `LD-10000`,
 *  five digits, still unique. Text order stops matching numeric order at that
 *  point, which costs nothing as long as nothing sorts the book by `code` —
 *  the book sorts by `created_at`. */
export const leadCodeSeq = sales.sequence('lead_code_seq', {
  startWith: 201,
  increment: 1,
  minValue: 1,
  cache: 1,
})

/** Sổ lead — module 2 của nhánh Sales.
 *
 *  ------------------------------------------------------------------
 *  SÁU NHÓM, VÀ NHÓM LÀ THÔNG TIN CHỨ KHÔNG PHẢI TRANG TRÍ
 *  ------------------------------------------------------------------
 *  `info` · `contact` · `need` là ba cụm của cổng init data (mười ô, sáu bắt
 *  buộc) — đọc theo cụm là đọc đúng thứ tự người cầm lead cần biết. `owner` ·
 *  `pipeline` · `exit` là thứ HỆ tự ghi, không moi từ khách. Ranh giới đó có
 *  thật: hai cột đếm ô ở cuối file chỉ nhìn ba cụm đầu.
 *
 *  ------------------------------------------------------------------
 *  BA CỘT BẮT BUỘC, NGOÀI KHOÁ VÀ FK
 *  ------------------------------------------------------------------
 *  `company` · `contact_name` · `email`. Lý do: luồng chính của hệ là MAS mail
 *  — chọn lead từ sổ rồi bắn nhiều đợt — và một lead không có email là một
 *  lead không tham gia được luồng đó. Bắt ở tầng cột chứ không ở tầng form:
 *  form thì mỗi cửa vào (landing · BD · import) phải nhớ một lần.
 *
 *  Hệ quả đã biết, ghi ra để không ai tưởng là lỗi: fixture DAS Vina có 62/100
 *  dòng chưa moi được email và 58/100 chưa có tên người liên hệ. Chúng vẫn nạp
 *  được vì `seed.ts` dựng hai trường đó bằng CHÍNH bộ sinh tất định của
 *  fixture (`leadContact`), không bịa mẫu mới. Xem tiếp ghi chú ở hai cột đếm
 *  ô — đó là chỗ quyết định này đụng vào luật cổng. */
export const lead = sales.table(
  'lead',
  {
    // ── key ────────────────────────────────────────────────────────────────
    /** Primary key, and at the same time a foreign key into `platform.object`.
     *
     *  ------------------------------------------------------------------
     *  THE MIRROR ROW IS FORCED, NOT REMEMBERED
     *  ------------------------------------------------------------------
     *  E1's object graph lives in `platform.object`, and `story()` can only
     *  see a lead that has a row there. Without this key the two tables are
     *  simply unrelated: an endpoint that writes the lead and forgets the
     *  mirror row produces a lead that is valid, queryable, listed in the
     *  book — and INVISIBLE to the graph. ContextRail comes up empty (luật
     *  10) and nothing anywhere turns red. A rule that breaks silently is the
     *  expensive kind, because it breaks for weeks before anyone looks.
     *
     *  So Postgres refuses the insert instead of the author of the next
     *  intake endpoint having to remember. The price is an ordering
     *  obligation that is now permanent, and it applies to every writer
     *  including `seed.ts`: write `platform.object` FIRST, `sales.lead`
     *  second, both in one transaction.
     *
     *  Not `ON DELETE CASCADE` on purpose. Removing an object row must not
     *  silently take a lead with it; leads leave the funnel through
     *  `exit_reason`, they are not deleted. */
    code: text('code')
      .primaryKey()
      .references(() => objectRef.code),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    // ── info · khách là ai ─────────────────────────── ô 1 · 2 · 3 ─────────
    company: text('company').notNull(),
    /** Tên trên giấy tờ, khác tên gọi trong sổ. */
    legalName: text('legal_name'),
    taxCode: text('tax_code'),
    address: text('address'),
    province: text('province'),
    category: text('category').$type<LeadCategory>(),
    /** Ô 2 chỉ đo cột này. `category` có sẵn từ lúc lead vào sổ nên không phải
     *  thứ moi được — đúng như `SLOT_FIELDS` bên engine đã khai. */
    mainProduct: text('main_product'),
    headcount: integer('headcount'),
    plants: integer('plants'),

    // ── contact · nói chuyện với ai ────────────────── ô 4 · 5 ─────────────
    contactName: text('contact_name').notNull(),
    contactTitle: text('contact_title'),
    /** Đích của MAS mail. Lưu chữ thường đã `trim()`, cùng quy ước với
     *  `Actor.email`, để không chỗ nào phải nhớ so sánh không phân biệt hoa
     *  thường lần thứ hai. */
    email: text('email').notNull(),
    phone: text('phone'),
    contactChannel: text('contact_channel').$type<ContactChannel>(),
    /** The customer's page on that channel. DELIBERATELY out of slot 5 of
     *  `required_filled`: a link is not a way to call somebody back, and
     *  counting it would open the MQL gate for a lead holding only a URL. */
    contactChannelUrl: text('contact_channel_url'),

    // ── need · việc khách muốn giải ────────────────── ô 6…10 ──────────────
    /** Ô 6 — câu quan trọng nhất của cả hồ sơ. */
    pain: text('pain'),
    currentStack: text('current_stack'),
    decisionMaker: text('decision_maker'),
    approver: text('approver'),
    /** Khoảng tiền KHÁCH nói, không phải giá mình chào. `bigint` cùng lý do
     *  với `platform.object.amount`: vài tỷ đồng đã vượt `int4`. */
    budget: bigint('budget', { mode: 'number' }),
    currency: text('currency').$type<CurrencyCode>(),
    deadline: date('deadline'),

    // ── owner · ai giữ ─────────────────────────────────────────────────────
    /** TRỤC PHẠM VI của E2 lọc bằng ĐÚNG cột này. Hai cột dưới KHÔNG tính vào
     *  trục đó — xem ghi chú cuối file. */
    ownerId: text('owner_id').references(() => actor.id),
    /** Công trạng đã ghi, không phải người giữ: BD có tên khi BD đã đặt tay
     *  vào lead. Hoa hồng đọc hai cột này (`CREDIT_RULES`). */
    bdOwnerId: text('bd_owner_id').references(() => actor.id),
    marketingOwnerId: text('marketing_owner_id').references(() => actor.id),

    // ── pipeline · đang ở đâu ──────────────────────────────────────────────
    tier: text('tier').$type<LeadTier>(),
    /** NULL = không còn ở cột nào của phễu (chưa vào, đã ký, hoặc đã rơi). */
    stage: text('stage').$type<StageKey>(),
    /** Lead vào chỗ hiện tại từ lúc nào. THAY cho cột `days_here` cũ.
     *
     *  `days_here` là một con số đổi theo thời gian mà không ai chạm vào dòng
     *  dữ liệu — lưu thành cột thì phải có một job quét cả bảng mỗi đêm, và
     *  giữa hai lần quét con số trên màn là sai. Lưu mốc, tính lúc đọc:
     *
     *      EXTRACT(day FROM COALESCE(exited_at, now()) - stage_since)
     *
     *  Lead rơi khỏi luồng thì cột này KHÔNG đặt lại, nên `days_here` của một
     *  lead đã rơi là số ngày nó nằm ở cột cuối trước khi rơi. */
    stageSince: timestamp('stage_since', { withTimezone: true }).notNull().defaultNow(),
    sourceKind: text('source_kind').$type<LeadSourceKind>(),
    /** Who made the first move — one of the six `LeadMotion` values.
     *
     *  A different axis from `source_kind`, and both are needed: that column
     *  says WHERE the row came from, this says who moved first. An `EVENT`
     *  lead can arrive by `IMPORT` or by `MANUAL` — same event, different
     *  trust in the row.
     *
     *  Nullable, and it stays nullable. The frozen fixture predates the idea
     *  of an intake door entirely, so its 100 rows carry NULL here; guessing
     *  a value for them would put invented data on the Performance screen
     *  (debt #5, `docs/ban-giao-db.md`). Real doors fill it: the file-import
     *  panel in `apps/web` already asks the user to pick one motion for a
     *  whole batch, and until this column existed there was nowhere to put
     *  the answer.
     *
     *  Stored `UPPER_SNAKE`. `packages/engines` spells the same six values in
     *  lower case and `apps/web` reads that spelling — known debt, and
     *  `lead.mapper.ts` is the ONE place the two forms meet. See the docblock
     *  on `LeadMotion` in `packages/contracts/src/sales/enums.ts`. */
    motion: text('motion').$type<LeadMotion>(),
    /** Chiến dịch được quy công — dây nối module 1 ↔ module 2. Giá trị là `id`
     *  của một dòng `sales.config_entry` trong danh mục `SOURCE`.
     *
     *  NULLABLE có chủ ý: lead gõ tay hoặc gõ thẳng từ landing page không
     *  thuộc chiến dịch nào, và bịa ra một mã để lấp cột là dựng một chiến
     *  dịch không có trong sổ. Màn Performance phải có nhóm "Không chiến dịch".
     *
     *  Tên cũ là `source`, đổi cùng lượt tách nguồn thành hai nửa: cột này giữ
     *  nửa MỞ (chiến dịch nào — danh mục người dùng tự thêm), `source_kind`
     *  giữ nửa ĐÓNG (loại xuất xứ — enum có migration). Một cột tên `source`
     *  cạnh một cột tên `source_kind` thì không đọc ra được nửa nào là nửa
     *  nào. */
    campaignId: text('campaign_id'),
    /** Điểm khả quan. Tính ở ENGINE rồi ghi cùng transaction với `touch`,
     *  KHÔNG tính bằng trigger SQL: điểm là luật nghiệp vụ, mà luật nằm trong
     *  trigger là luật `@pv/engines` không với tới, và từ đó web với máy chủ
     *  chấm điểm theo hai bảng khác nhau. */
    score: integer('score').notNull().default(0),
    lastTouchAt: timestamp('last_touch_at', { withTimezone: true }),

    // ── đếm ô · máy tính, không ai ghi ─────────────────────────────────────
    /** Số ô BẮT BUỘC đã moi được, 0…6. Cổng MQL → SQL nhìn con số này.
     *
     *  `GENERATED … STORED` chứ không phải cột thường: khi hai mươi trường hồ
     *  sơ đã là cột thật thì con số này SUY RA được, và một cột đếm ghi tay
     *  chỉ là một đường để nó lệch khỏi dữ liệu nó đang đếm. Vẫn lọc và đánh
     *  chỉ mục được như cột thường, nhưng không ai ghi sai được nữa.
     *
     *  Luật đếm chép đúng `filledSlots()` bên engine: MỘT Ô CÓ GÌ LÀ ĐÃ MOI
     *  ĐƯỢC — ô 1 chở ba trường, có một trường là ô tính.
     *
     *  KHÁC engine đúng hai chỗ, và cả hai là hệ quả của việc `email` và
     *  `contact_name` thành cột bắt buộc: ô 4 ở đây đo `contact_title` chứ
     *  không đo `contact_name`, ô 5 đo `phone`/`contact_channel` chứ không đo
     *  `email`. Nếu vẫn đo hai cột bắt buộc thì hai ô đó luôn đầy cho MỌI
     *  lead, cổng sáu ô thành cổng bốn ô, và phân bố hiện tại của fixture
     *  (`{0:10, 1:21, 2:15, 3:12, 4:4, 5:4, 6:34}`) biến mất.
     *
     *  Đây là chỗ bảng và `SLOT_FIELDS` bên engine đang LỆCH NHAU. Với dữ liệu
     *  hôm nay hai bên vẫn ra cùng con số (fixture chỉ sinh `title` khi có
     *  `name`, chỉ sinh `phone` khi có `email`), nhưng một lead landing page —
     *  có email, chưa có điện thoại — sẽ tách chúng ra. Chốt luật cổng rồi sửa
     *  `SLOT_FIELDS` cho khớp; đừng sửa một bên. */
    requiredFilled: smallint('required_filled')
      .notNull()
      .generatedAlwaysAs(
        sql`((
        ("legal_name" IS NOT NULL OR "tax_code" IS NOT NULL OR "address" IS NOT NULL)::int
      + ("main_product" IS NOT NULL)::int
      + ("headcount" IS NOT NULL OR "plants" IS NOT NULL)::int
      + ("contact_title" IS NOT NULL)::int
      + ("phone" IS NOT NULL OR "contact_channel" IS NOT NULL)::int
      + ("pain" IS NOT NULL)::int
      )::smallint)`,
      ),
    /** Số ô TUỲ CHỌN đã moi được, 0…4. Cùng luật với cột trên. */
    optionalFilled: smallint('optional_filled')
      .notNull()
      .generatedAlwaysAs(
        sql`((
        ("current_stack" IS NOT NULL)::int
      + ("decision_maker" IS NOT NULL OR "approver" IS NOT NULL)::int
      + ("budget" IS NOT NULL)::int
      + ("deadline" IS NOT NULL)::int
      )::smallint)`,
      ),

    // ── exit · ra khỏi luồng ───────────────────────────────────────────────
    exitReason: text('exit_reason').$type<ExitReason>(),
    exitedAt: timestamp('exited_at', { withTimezone: true }),
  },
  (t) => [
    index('lead_owner_idx').on(t.ownerId),
    index('lead_stage_idx').on(t.stage),
    index('lead_exit_idx').on(t.exitReason),
    index('lead_campaign_idx').on(t.campaignId),
    /* Ô tìm theo tên công ty dùng `ILIKE '%…%'` — B-tree KHÔNG đỡ được kiểu
       này, mọi lần gõ là một seq scan. Với 100 dòng thì không ai thấy; khi có
       dữ liệu thật thì bật `pg_trgm` và thêm một GIN index trên `company`.
       Chưa làm bây giờ vì extension phải đi kèm migration riêng. */

    /** MỘT email = MỘT lead ĐANG SỐNG.
     *
     *  Landing page nộp hai lần là hai bản ghi thô ở `lead_intake`, không phải
     *  hai lead. Nhưng khách rơi khỏi luồng năm ngoái quay lại năm nay là một
     *  lead MỚI hợp lệ — nên điều kiện chỉ áp cho dòng chưa rơi.
     *
     *  Indexed on `lower(email)`, not on the raw column — blocker #3 of the
     *  four in `docs/ban-giao-db.md`. `An@x.vn` and `an@x.vn` are one mailbox,
     *  so on a raw index they slip through as two live leads and the MAS mail
     *  flow sends the same person the same campaign twice. The column comment
     *  above already asks writers to store the address lowercased and
     *  trimmed; this is what makes that a fact instead of a request, at the
     *  one place no door can skip. Same technique `config_name_live` uses. */
    uniqueIndex('lead_email_live_idx')
      .on(sql`lower("email")`)
      .where(sql`"exit_reason" IS NULL`),

    /** Tiền luôn mang đơn vị — nợ số 7. Một trong hai cột trống là cả hai
     *  trống; `250000000` không đơn vị là con số không cộng được với dòng bên
     *  cạnh. */
    check('lead_money_pair', sql`("budget" IS NULL) = ("currency" IS NULL)`),
    /** Rơi thì phải có mốc rơi. Thiếu mốc thì mọi báo cáo theo kỳ đếm hụt. */
    check('lead_exit_pair', sql`("exit_reason" IS NULL) = ("exited_at" IS NULL)`),
    /** Rơi rồi thì không còn đứng ở cột nào của phễu. Không có ràng buộc này
     *  thì sổ cơ hội và sổ lead đếm ra hai con số khác nhau. */
    check('lead_exit_no_stage', sql`"exit_reason" IS NULL OR "stage" IS NULL`),
    /** `contact_channel` joined this list on 27/08, and it is not cosmetic:
     *  it is one of the two columns slot 5 of `required_filled` reads
     *  (`phone IS NOT NULL OR contact_channel IS NOT NULL`). An empty string
     *  is NOT NULL, so `contact_channel = ''` counts slot 5 as filled — the
     *  generated column reports a lead as better qualified than it is, and
     *  the MQL gate opens on nothing. Fourteen columns were already covered;
     *  this was the one that got out. */
    check(
      'lead_no_blank',
      noBlank(
        'company',
        'legal_name',
        'tax_code',
        'address',
        'province',
        'main_product',
        'contact_name',
        'contact_title',
        'email',
        'phone',
        'contact_channel',
        'contact_channel_url',
        'pain',
        'current_stack',
        'decision_maker',
        'approver',
        'campaign_id',
      ),
    ),
  ],
)

export type LeadRowDb = typeof lead.$inferSelect
