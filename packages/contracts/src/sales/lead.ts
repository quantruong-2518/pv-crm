import { z } from 'zod'
import {
  Dong,
  MaObject,
  Moc,
  Ngay,
  email,
  gomKhoangTrang,
  phoneOptional,
  textNhap,
  textNhapTuyChon,
} from '../primitives'
import { PageQuery, SortDir, paged } from '../pagination'
import { MaConfig } from './config'
import {
  ContactChannel,
  CurrencyCode,
  ExitReason,
  LeadCategory,
  LeadMotion,
  LeadSourceKind,
  LeadTier,
  StageKey,
} from './enums'
import {
  LEAD_MAX,
  LEAD_NUM,
  channelUrlClearable,
  counted,
  channelUrlOptional,
  deadlineDay,
  taxCodeClearable,
  taxCodeOptional,
} from './lead-fields'
import { MOTION_BY_CHANNEL } from './lead-intake'
import { LeadSource } from './lead-source'

/** Lead book — module 2 of the Sales branch. `GET /sales/leads`.
 *
 *  This is the contract for ONE ROW OF THE BOOK, not for a whole lead profile.
 *  The twenty profile fields (`pain`, `budget`, `decision_maker`…), `history`
 *  and the conversation record belong to `GET /sales/leads/:code`: making a
 *  100-row book carry every row's full profile means shipping a few hundred KB
 *  for a table that shows eight columns.
 *
 *  ------------------------------------------------------------------
 *  THREE REQUIRED FIELDS, EVERYTHING ELSE OPTIONAL
 *  ------------------------------------------------------------------
 *  `company` · `contactName` · `email` — mirroring exactly the three `NOT NULL`
 *  columns of the table. The reason is the main flow: leads are picked from the
 *  book to be mailed through MAS, and a lead without a mailbox cannot take part
 *  in that flow.
 *
 *  Fields that used to be required and no longer are (`province`, `category`,
 *  `tier`, `source`) changed for one reason: a lead arriving through a landing
 *  page has only the three above, and the rest is what gets DUG OUT later.
 *  Requiring them in the contract forces the door to invent data to get in. */

/** CỔNG INIT DATA CÓ BAO NHIÊU Ô BẮT BUỘC — một con số, ba chỗ đọc.
 *
 *  Cột sinh `lead.required_filled` cộng đúng sáu mệnh đề; `LeadRow` chặn trần ở
 *  đúng số đó; và "lead tốt" ở mọi báo cáo là `required_filled >= REQUIRED_SLOTS`
 *  — module 1 đếm nó theo nguồn, module 5 đếm nó theo kỳ.
 *
 *  Là hằng số chứ không phải số 6 gõ ba lần, vì cái sai khi ba chỗ lệch nhau
 *  KHÔNG nổ: cổng bảy ô mà báo cáo còn hỏi ">= 6" thì mọi nguồn bỗng có thêm
 *  lead tốt, và không dòng log nào nói vì sao. Đổi cổng là đổi cột sinh (một
 *  migration) VÀ đổi dòng này, cùng một lượt. */
export const REQUIRED_SLOTS = 6

export const LeadRow = z.object({
  code: MaObject,
  company: z.string().min(1),
  /** The contact person — the real target of every touch. */
  contactName: z.string().min(1),
  email: z.string().email(),

  /** Job title of the contact person — the "Chức danh" column of the book.
   *
   *  Present because the column is on screen today and has nowhere else to come
   *  from: it is currently drawn from `leadContact(l).title`, a deterministic
   *  generator inside the DAS Vina fixture. That works while the data is frozen
   *  and produces nothing at all against a real table, where the value lives in
   *  `lead.contact_title`. Absent means slot 4 of the init-data gate has not
   *  been dug out yet — the screen draws "—" and says so in `title`. */
  contactTitle: z.string().min(1).optional(),

  province: z.string().min(1).optional(),
  category: LeadCategory.optional(),
  tier: LeadTier.optional(),
  phone: z.string().min(1).optional(),
  contactChannel: ContactChannel.optional(),

  /** Number of REQUIRED slots dug out so far, 0…6. This is what the init-data
   *  gate looks at. Computed by the server as a generated column; nobody
   *  writes it by hand. */
  requiredFilled: z.number().int().min(0).max(REQUIRED_SLOTS),
  /** Number of optional slots dug out, 0…4. */
  optionalFilled: z.number().int().min(0).max(4),

  // ── who holds it · three fields, three different jobs ──────────────────────
  //
  // These are NOT one value copied three times, and it is worth saying exactly
  // what each one is for, because "just send the name" is the shortcut that
  // created debt #2 in the first place:
  //
  //   ownerId    IDENTITY. The only one anything is allowed to compare, filter
  //              or store. Two people named "Nguyễn Văn Nam" are two ids.
  //   ownerName  LABEL. Human text, shown in the cell's `title` tooltip. Never
  //              a key: it changes when someone marries, and it collides.
  //   ownerEmail What the Lead PIC cell actually PRINTS, and the value people
  //              reconcile against other systems (mail, calendar, commission
  //              sheets) — all of which key on the mailbox.
  //
  // All three come out of the join the repository already performs
  // (`leftJoin(actor, eq(actor.id, lead.ownerId))`), so carrying them costs no
  // extra query — only two more columns in the SELECT list.

  /** Who is holding it. Absent = still in the common pool, nobody has taken it. */
  ownerId: z.string().min(1).optional(),
  /** Display name of the holder. LABEL — never compare against it. */
  ownerName: z.string().min(1).optional(),
  /** Company mailbox of the holder. This is what the Lead PIC column prints.
   *
   *  Needed as its own field because the screen derives it today with
   *  `staffEmail(name)`, a naming convention baked into the fixture. Against a
   *  real `platform.actor` table that derivation is a guess, and a wrong guess
   *  here is a mail sent to an address that does not exist. */
  ownerEmail: z.string().min(1).optional(),

  stage: StageKey.optional(),

  /** Days spent at the current place. NOT a column — the server computes it
   *  from `stage_since` at read time, because this number changes with the
   *  clock even when nobody touches the row. */
  daysHere: z.number().int().nonnegative(),

  /** Where this lead came from — origin KIND plus optional campaign, one
   *  object. See `./lead-source` for why the two travel together and why the
   *  campaign's NAME rides along with its id.
   *
   *  Always present, even when it is empty: an absent object and an object
   *  with nothing dug out yet are the same fact, and one shape for it means
   *  the screen writes `lead.source.kind` rather than `lead.source?.kind`
   *  guarded three different ways in three different columns. */
  source: LeadSource,

  /** Has this lead signed?
   *
   *  A field rather than something the screen works out, because the screen
   *  CANNOT work it out: "signed" is now `EXISTS(contract WHERE lead_code = …)`
   *  — the old `lead.contract_code` column is gone since lead → opportunity
   *  became 1-n. The book never receives the contract table, so without this
   *  field the "Trạng thái" column loses one of its four branches and every
   *  signed lead silently renders as "still running".
   *
   *  Deliberately a BOOLEAN and not the contract code: one lead can now hold
   *  several contracts, so no single code fits. See the handover note — the
   *  badge currently prints "Đã ký · HĐ-2711", and that code has no field to
   *  arrive in yet. */
  signed: z.boolean(),

  /** Warmth score, accumulated across touches. */
  score: z.number().int().nonnegative(),
  lastTouchAt: Moc.optional(),

  createdAt: Moc,
  exitReason: ExitReason.optional(),
  exitedAt: Moc.optional(),
})

// ---------------------------------------------------------------------------
// Filters — every one of them has to survive the URL
// ---------------------------------------------------------------------------

/** The four branches of the book's "Trạng thái" filter.
 *
 *  This REPLACES the old `running: Bool`, and the replacement is not cosmetic.
 *  A boolean carries two branches while the screen has four, and the two extra
 *  ones are not the negation of anything:
 *
 *      running   not exited AND not signed
 *      signed    EXISTS(contract)              <- not "NOT running"
 *      exited    exit_reason IS NOT NULL
 *      all       everything in the period
 *
 *  What the boolean actually did is worth writing down, because it is live
 *  today in `lead.repository.ts`: `running=true` returned "not exited and no
 *  contract", `running=false` returned "exited". A SIGNED lead matched NEITHER
 *  value — it was unreachable through the only filter the contract had. That is
 *  the failure mode this enum removes.
 *
 *  Default `running`, matching the screen: an exited lead is still lookup-able,
 *  because that is where the answer to "why did we lose it" lives. */
export const LeadStatus = z.enum(['running', 'signed', 'exited', 'all'])

/** Columns the book can be sorted by. A closed list on purpose: a sort key with
 *  no column behind it must die at the zod gate, not inside the query builder.
 *
 *  `company` is the only header with a sort arrow on screen today. `createdAt`
 *  is the book's natural order — the repository already sorts by it — and
 *  `daysHere` is here because it is the number the SLA warning reads. Note for
 *  whoever implements it: `daysHere` is not a column, so ordering by it means
 *  ordering by the same expression the SELECT computes, which is `stage_since`
 *  in reverse. */
export const LeadSortKey = z.enum(['company', 'createdAt', 'daysHere'])

/** The `owner` filter value meaning "nobody has taken it".
 *
 *  The screen has its own sentinel for this — `NO_OWNER` in `leads.tsx`, which
 *  is this same word behind a literal NUL character — and that one must NOT
 *  travel. A native `<select>` can only carry strings, so the NUL prefix was
 *  how it avoided colliding with a real person's name. On the wire the
 *  collision cannot happen anyway, because `owner` carries an actor `id` and no
 *  id is spelled like this; meanwhile a NUL byte in a URL is rejected by half
 *  the proxies in the world and by a Postgres `text` column outright.
 *
 *  So the screen maps its sentinel to this constant on the way out. ASCII,
 *  lowercase, unaccented, like every other identifier that leaves the process. */
export const OWNER_NONE = 'chua-ai-nhan'

/** Filters of the book. Matches exactly the query contract carried on the URL
 *  by `apps/web/src/app/url.ts` — one filter, one name, both ends.
 *
 *  (That file does not exist yet. The names below are the ones it has to adopt
 *  when it is written; this docblock is the promise, not a description of
 *  something already there.)
 *
 *  ------------------------------------------------------------------
 *  WHY EVERY CONTROL ON THE FILTER ROW IS IN HERE
 *  ------------------------------------------------------------------
 *  Today the screen filters and pages in the browser: `book.filter(...)` and
 *  then a `PAGE_SIZE` slice. Once paging moves to the server, a filter that
 *  stayed behind on the client no longer filters the book — it filters the 50
 *  rows the server happened to send for page 1. There is no partial version of
 *  this move, which is why `campaign`, `owner` and `account` are here even
 *  though only `stage`/`tier`/`category` were before. */
export const LeadBookQuery = PageQuery.extend({
  stage: StageKey.optional(),
  tier: LeadTier.optional(),
  category: LeadCategory.optional(),

  status: LeadStatus.default('running'),

  /** Campaign id, exact match. Absent = every campaign, including none.
   *
   *  Named for what it filters. The old spelling was `source`, from back when
   *  the column held a bare code and nothing else; now that an origin is two
   *  facts, a param called `source` would not say which of the two it means. */
  campaign: MaConfig.optional(),

  /** The OTHER half of an origin — see `LeadSource` for why the two facts
   *  cannot share one param. `campaign` picks one named campaign; this picks
   *  a lead that has NO campaign at all and came in through one of the four
   *  raw doors (`LeadSourceKind`). The two are mutually exclusive on a row —
   *  a lead with a campaign never shows its kind on screen (`SourceMark`
   *  prints the campaign name, not the kind) — so the repository ANDs this
   *  with "campaign is null" rather than trusting the caller not to send
   *  both. */
  sourceKind: LeadSourceKind.optional(),

  q: z.string().trim().min(1).max(120).optional(),

  /** Default order is the book's own: newest first. That is both what the
   *  screen shows when no header is active and what the repository already
   *  does, so turning sorting on changes nothing until the user asks.
   *
   *  Implementation note that belongs in the contract because it is a
   *  correctness issue and not a detail: sorting by `company` produces ties,
   *  and ties make paging unstable — the same row can appear on page 1 and
   *  page 2, or on neither. The server has to append `code` as a final
   *  tiebreaker on every sort. */
  sort: LeadSortKey.default('createdAt'),
  dir: SortDir.default('desc'),
})

export const LeadBookResponse = paged(LeadRow)

/** Nửa "không chiến dịch" của ô lọc Nguồn — `GET /sales/leads/facets`.
 *
 *  ------------------------------------------------------------------
 *  TẠI SAO CHỈ CÓ `sourceKind`, KHÔNG CÓ DANH SÁCH CHIẾN DỊCH Ở ĐÂY
 *  ------------------------------------------------------------------
 *  Nửa chiến dịch của ô lọc đã có nguồn THẬT rồi — `GET /sales/config` (danh
 *  mục `SOURCE`, `salesCatalogQuery` ở `apps/web/src/data/sales-config.ts`).
 *  Việc còn thiếu là nửa kia: một lead KHÔNG gắn chiến dịch nào vẫn có một
 *  `sourceKind` thật (`LeadSourceKind`) và cột Nguồn vẫn in nó ra
 *  (`SourceMark` → "Web landing", "Apollo"…) — nhưng trước bản sửa này, ô lọc
 *  không có lấy MỘT lựa chọn nào trỏ tới những dòng đó. Chọn "Mọi nguồn" là
 *  cách duy nhất một lead `LANDING_PAGE` không chiến dịch còn tìm lại được.
 *
 *  Đây là DANH SÁCH THẬT bốn giá trị `LeadSourceKind` nào đang thật sự xuất
 *  hiện KHÔNG kèm chiến dịch trong sổ — không phải cả bốn giá trị enum lúc
 *  nào cũng liệt kê đủ: một sổ mà mọi lead đều có chiến dịch thì mảng này
 *  rỗng, và ô lọc không vẽ ra một lựa chọn chết. Cùng trục phạm vi với
 *  `book()`. */
export const LeadFacets = z.object({
  sourceKinds: z.array(LeadSourceKind),
})

// ---------------------------------------------------------------------------
// One whole lead — `GET /sales/leads/:code`
// ---------------------------------------------------------------------------

/** The profile of ONE lead. `GET /sales/leads/:code`.
 *
 *  ------------------------------------------------------------------
 *  AN EXTENSION OF `LeadRow`, NOT A SECOND SHAPE OF THE SAME TABLE
 *  ------------------------------------------------------------------
 *  `.extend()` rather than a fresh `z.object`, and that IS the design of this
 *  schema. The book row and the profile describe one table, so everything they
 *  share — `code`, `company`, `email`, `signed`, `daysHere`, the three owner
 *  fields, the two slot counters — is declared exactly once, above, and cannot
 *  drift here. A hand-written twin agrees on the day it is written and stops
 *  agreeing the first time somebody adds a column to only one of them; the
 *  screen then prints one value in the book and another on the profile of the
 *  same lead, and neither is wrong enough for anyone to notice.
 *
 *  The server holds the same line: `toProfile` in `lead.mapper.ts` CALLS
 *  `toContract` and adds to it, rather than mapping the row a second time.
 *
 *  ------------------------------------------------------------------
 *  WHAT THIS ADDS — THE COLUMNS THE BOOK DELIBERATELY LEAVES BEHIND
 *  ------------------------------------------------------------------
 *  Four groups, and they are the table's own groups (`lead.schema.ts`): who
 *  the company is, what it wants solved, who else is credited on it, and which
 *  door it came through. A 100-row book carrying all of them ships a few
 *  hundred KB for a table that shows eight columns — the reason stated at the
 *  top of `LeadRow`, and the reason these live here.
 *
 *  ------------------------------------------------------------------
 *  WHAT IS NOT HERE, AND WHY EACH ABSENCE IS AN ANSWER
 *  ------------------------------------------------------------------
 *   · `dealCode` / `contractCode` — the frozen fixture profile carries both;
 *     the table carries neither. Lead -> opportunity became 1-n, so no single
 *     column can name "the" deal or "the" contract. `signed`, inherited from
 *     `LeadRow`, is the boolean that survived that change. The codes come back
 *     the day the profile carries a LIST of opportunities, which is another
 *     query and another contract, not a field added here.
 *   · touches, the conversation record, `history` — `sales.touch` does not
 *     exist yet, which is also why `score` is `0` and `lastTouchAt` is absent
 *     on every row in the book today.
 *   · `stageSince` — the timestamp `daysHere` is computed from, and `daysHere`
 *     is already inherited. Two spellings of one fact is how the two start to
 *     disagree.
 *
 *  NAME COLLISION, on purpose: `@pv/engines/fixtures/das-vina` exports a type
 *  also called `LeadProfile` — the frozen shape the detail screen reads today,
 *  built by a deterministic generator. This one describes the real table. A
 *  file importing both gets a compile error instead of a silent pick, and that
 *  error is the right moment to delete the other one. */
export const LeadProfile = LeadRow.extend({
  // ── info · who the customer is ────────────────────── slots 1 · 2 · 3 ────
  //
  // `province` and `category` are NOT repeated here: the book already carries
  // them, because both are known the moment a lead enters the book rather than
  // dug out of a conversation later.

  /** The name on the paperwork, which is not the name the book calls them. */
  legalName: z.string().min(1).optional(),
  /** Free text, matching the column: 10 digits, or 13 with a branch suffix. */
  taxCode: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  mainProduct: z.string().min(1).optional(),

  /** Headcount and plants — `nonnegative`, not `positive`, and the difference
   *  is deliberate. `LeadCreate` narrows both to `positive()` because a person
   *  typing "0 employees" is typing a mistake. This is the READ side: it has
   *  to describe every value the `integer` column can legally hold, including
   *  the `0` that an imported file can carry, or a row already in the table
   *  fails its own response contract and the profile answers 500 for a lead
   *  the book lists happily. */
  headcount: z.number().int().nonnegative().optional(),
  plants: z.number().int().nonnegative().optional(),

  // ── contact · how to reach the person on the channel ─────── slot 5 ──────

  /** The customer's page on `contactChannel` — a LinkedIn profile, a Facebook
   *  page, the company site. Detail only, deliberately not on `LeadRow`: the
   *  book lists and filters by WHICH channel, never by the address on it.
   *
   *  Free text, not `z.url()`, and that is a decision rather than an omission.
   *  What people actually paste is `linkedin.com/in/abc` off the address bar or
   *  out of a Zalo message, and refusing that is refusing the one gesture this
   *  box exists for. The cost is stated where it lands: nothing may build an
   *  `<a href>` out of this value, because a string that is not a URL becomes a
   *  link to somewhere nobody chose. It is drawn as text and copied by hand. */
  contactChannelUrl: z.string().min(1).optional(),

  // ── need · what the customer wants solved ─────────── slots 6…10 ─────────

  /** Slot 6 — the most valuable sentence in the whole profile. */
  pain: z.string().min(1).optional(),
  currentStack: z.string().min(1).optional(),
  decisionMaker: z.string().min(1).optional(),
  approver: z.string().min(1).optional(),
  /** The budget the CUSTOMER named, not the price we quoted. Travels with its
   *  unit or not at all — `CHECK lead_money_pair` guarantees the pair, so a
   *  profile can never show a number whose currency nobody knows. */
  budget: Dong.optional(),
  currency: CurrencyCode.optional(),
  deadline: Ngay.optional(),

  // ── credit · the two holders that are NOT the scope axis ─────────────────
  //
  // Three id/name/email triples now, all built the same way and for the same
  // three reasons `ownerId` · `ownerName` · `ownerEmail` are spelled out above:
  // the id is the only thing anything may compare, the name is a label that
  // changes and collides, the mailbox is what a person reconciles against mail
  // and commission sheets. All six extra values come out of two more
  // `leftJoin(actor, …)` in the query the profile already runs — two more
  // joins, no extra round trip.
  //
  // Only `ownerId` is the scope axis. These two record CREDIT — BD is named
  // when BD put a hand on the lead, marketing when the campaign brought it —
  // and `CREDIT_RULES` reads them for commission. A Sale who owns nothing here
  // but appears as `bdOwnerId` still does not see the lead, and that is the
  // intended answer: credit is not custody.

  bdOwnerId: z.string().min(1).optional(),
  bdOwnerName: z.string().min(1).optional(),
  bdOwnerEmail: z.string().min(1).optional(),

  marketingOwnerId: z.string().min(1).optional(),
  marketingOwnerName: z.string().min(1).optional(),
  marketingOwnerEmail: z.string().min(1).optional(),

  // ── who moved first ──────────────────────────────────────────────────────
  //
  // The other half of the intake pair — WHERE the row came from — is not here
  // any more: it lives on `source.kind`, which the book already carries, and
  // `LeadProfile` extends `LeadRow`. Two axes, never one (`./lead-intake` has
  // the long argument); they are simply no longer two SIBLINGS, because the
  // origin half belongs with the campaign half it is read beside.

  /** Who made the first move. Stored `UPPER_SNAKE`, same spelling on the wire;
   *  `@pv/engines` still spells the same six values in lower case, and
   *  `lead.mapper.ts` is the ONE place the two forms are allowed to meet.
   *
   *  Nullable in the table and optional here: the 100 frozen fixture rows
   *  predate the idea of an intake pair entirely, so inventing a value for
   *  them would put made-up data on the Performance screen. */
  motion: LeadMotion.optional(),
})

// ---------------------------------------------------------------------------
// Creating one lead by hand
// ---------------------------------------------------------------------------

/** `POST /sales/leads` — one lead, typed by a person, one field at a time.
 *
 *  ------------------------------------------------------------------
 *  EVERY FIELD HERE NORMALISES, IT DOES NOT ONLY CHECK
 *  ------------------------------------------------------------------
 *  The text fields go through `textNhap` / `textNhapTuyChon`, the mailbox
 *  through `email`, the phone through `phoneOptional` (see `../primitives`).
 *  What reaches the service is already trimmed, already collapsed, already
 *  lowercased where it has to be, and `''` has already become `undefined`.
 *
 *  That last conversion is the one that matters most here: the table has
 *  exactly one spelling for "empty", which is `NULL`, and `CHECK lead_no_blank`
 *  enforces it across fifteen columns. An HTML form submits `''` for every
 *  field the user left alone. A contract that only validates hands those `''`
 *  straight to the CHECK, which answers with a constraint violation — a 500
 *  that names a constraint instead of a 400 that names a field.
 *
 *  ------------------------------------------------------------------
 *  WHAT THIS DELIBERATELY DOES NOT ACCEPT
 *  ------------------------------------------------------------------
 *   · `code` — the server mints it. Letting the caller choose the primary key
 *     means one typo can overwrite another lead.
 *   · `requiredFilled` / `optionalFilled` — generated columns. They are counted
 *     FROM the fields above; accepting them is offering a way for the count to
 *     disagree with the data it counts.
 *   · `score`, `stageSince`, `createdAt`, `lastTouchAt` — the system's own
 *     bookkeeping.
 *   · `tier` and `stage` — deliberately withheld, same rule the file importer
 *     already applies (`tierOfRow` caps an imported row at MQL). SQL means the
 *     init-data gate has been passed AND somebody opened an opportunity; a lead
 *     that has just been typed has passed neither, and a client that can name
 *     its own tier can claim a gate it never went through.
 *   · `exitReason` / `exitedAt` — a lead cannot be born already lost, and
 *     `CHECK lead_exit_pair` would be the one to say so.
 *   · `source.kind` — the system records the origin, nobody types it. For this
 *     endpoint the origin is `MANUAL`, which is why `motion` is narrowed below
 *     to the motions that door can carry. Only `campaignId` is accepted. */
export const LeadCreate = z
  .object({
    // ── the three required ones · exactly the three NOT NULL columns ─────────
    company: textNhap(LEAD_MAX.company),
    contactName: textNhap(LEAD_MAX.contactName),
    email,

    // ── info · who the customer is ────────────────────── slots 1 · 2 · 3 ────
    legalName: textNhapTuyChon(LEAD_MAX.legalName),
    /** Tax code, SHAPE-CHECKED — see `taxCodeOptional` for why it stopped being
     *  free text. Worth knowing: the importer's dedupe key strips it down to
     *  digits, so two spellings of one code are one key there. */
    taxCode: taxCodeOptional,
    address: textNhapTuyChon(LEAD_MAX.address),
    province: textNhapTuyChon(LEAD_MAX.province),
    category: LeadCategory.optional(),
    mainProduct: textNhapTuyChon(LEAD_MAX.mainProduct),
    headcount: counted('Số người', LEAD_NUM.headcountMax).optional(),
    plants: counted('Số nhà máy', LEAD_NUM.plantsMax).optional(),

    // ── contact · who we talk to ──────────────────────── slots 4 · 5 ────────
    contactTitle: textNhapTuyChon(LEAD_MAX.contactTitle),
    phone: phoneOptional,
    contactChannel: ContactChannel.optional(),
    /** The customer's page on that channel — shape-checked, still not a URL.
     *  See `channelUrlOptional`; `LeadProfile` explains why nothing may turn
     *  the value into a link. */
    contactChannelUrl: channelUrlOptional,

    // ── need · what the customer wants solved ─────────── slots 6…10 ─────────
    pain: textNhapTuyChon(LEAD_MAX.pain),
    currentStack: textNhapTuyChon(LEAD_MAX.currentStack),
    decisionMaker: textNhapTuyChon(LEAD_MAX.decisionMaker),
    approver: textNhapTuyChon(LEAD_MAX.approver),
    /** The budget the CUSTOMER named, not the price we quoted. Bounded so a
     *  mistyped figure gets a Vietnamese sentence instead of zod's English one
     *  about `MAX_SAFE_INTEGER` — see `LEAD_NUM`. */
    budget: Dong.max(LEAD_NUM.budgetMax, 'Ngân sách vượt mức ghi nhận được').optional(),
    currency: CurrencyCode.optional(),
    deadline: deadlineDay.optional(),

    // ── owner · actor ids, never names ───────────────────────────────────────
    ownerId: textNhapTuyChon(LEAD_MAX.actorId),
    bdOwnerId: textNhapTuyChon(LEAD_MAX.actorId),
    marketingOwnerId: textNhapTuyChon(LEAD_MAX.actorId),

    // ── where it came from ───────────────────────────────────────────────────
    /** Narrowed to the motions the `MANUAL` door can carry, so `EVENT` is
     *  refused here: an event arrives as a LIST, and a hand-typed row claiming
     *  to be an event lead is a row nobody can trace back to an event.
     *
     *  See the handover — the brief asked for all six, `MOTION_BY_CHANNEL` says
     *  five, and this follows the table rather than quietly widening it. */
    motion: z.enum(MOTION_BY_CHANNEL.MANUAL, {
      /* Two different mistakes, two sentences. A missing motion is a control
         nobody touched; a motion outside the five is a caller claiming a door
         it did not come through, and "not chosen" would be the wrong thing to
         tell them. */
      error: (issue) =>
        issue.input === undefined ? 'Chưa chọn thế' : 'Thế này không đi qua cửa gõ tay được',
    }),
    /** Optional: a lead typed in directly belongs to no campaign, and inventing
     *  a campaign code to fill the field creates a campaign that is in no
     *  campaign book.
     *
     *  Only the ID is accepted. `kind` is not a field here — this endpoint IS
     *  the `MANUAL` origin, and a caller that can name its own origin can
     *  claim `LANDING_PAGE`, which `CHANNEL_TRUST` reads as customer-verified. */
    campaignId: MaConfig.optional(),
  })
  .refine((v) => (v.budget === undefined) === (v.currency === undefined), {
    /* Money always carries its unit. Enforced here rather than left to
       `CHECK lead_money_pair`, because the CHECK can only produce a 500 naming
       a constraint — while this produces a 400 pointing at the currency control
       the user forgot to touch. `250000000` with no unit is a number that
       cannot be added to the row next to it. */
    message: 'Có ngân sách thì phải chọn đơn vị tiền, và ngược lại',
    path: ['currency'],
  })

/** What `POST /sales/leads` answers with: the row as the book would show it.
 *
 *  The full row rather than just the new code, so the screen can insert it
 *  without a second round trip — and so the caller immediately sees the values
 *  as NORMALISED, which is the only way to notice that what was typed and what
 *  was stored are not always the same string. */
export const LeadCreateResponse = LeadRow

// ---------------------------------------------------------------------------
// CORRECTING A PROFILE — `PATCH /sales/leads/:code`
// ---------------------------------------------------------------------------

/** An optional text box on a door where CLEARING is something a person does.
 *
 *  ------------------------------------------------------------------
 *  `''` MEANS CLEAR HERE, WHILE ON `LeadCreate` IT MEANS ABSENT
 *  ------------------------------------------------------------------
 *  Not an inconsistency — the two doors are asked different questions. A create
 *  form has no stored value to remove, so a blank box is a field nobody filled
 *  in, and `textNhapTuyChon` folding `''` into `undefined` is exactly right.
 *  On a patch that same `''` is somebody DELETING what was in the box, and
 *  folding it into `undefined` makes the field quietly un-clearable: the user
 *  empties it, presses save, and the old value comes straight back with no
 *  refusal to explain why.
 *
 *  So this door needs three inputs carrying three meanings, and it has them:
 *
 *   · key absent    — leave the column exactly as it is
 *   · `''` or `null`— write NULL
 *   · a value       — write it, normalised the way every other door normalises
 *
 *  Absence is the only "no change", which is why the form sends CHANGED fields
 *  and nothing else: a body carrying all twenty-one is a body that overwrites a
 *  colleague's edit with values read before they made it. */
const clearableText = (max: number) =>
  z
    .string('Ô này phải là chữ')
    .max(max, `Tối đa ${max} ký tự`)
    .transform(gomKhoangTrang)
    .transform((s): string | null => (s === '' ? null : s))
    .nullish()

/** What a person may correct on the profile screen, and nothing else.
 *
 *  ------------------------------------------------------------------
 *  EXACTLY THE THREE GROUPS THE PROFILE CARD DRAWS
 *  ------------------------------------------------------------------
 *  `ProfileCard` renders `khach` · `nguoi` · `viec` and filters `so` out —
 *  the book group is what the system writes about itself. This shape is those
 *  three groups and stops there, so everything withheld is withheld for a
 *  reason already written down somewhere:
 *
 *   · `code` · `createdAt` · `score` · `requiredFilled` — the system's own
 *     bookkeeping, two of them generated columns Postgres computes.
 *   · `tier` · `stage` — gates, not fields. A client that can name its own
 *     tier can claim a gate it never went through (`LeadCreate` says the same).
 *   · `ownerId` · `bdOwnerId` · `marketingOwnerId` — `PATCH :code/owner` is
 *     their door, and it holds a rule this one does not (who may hand a lead
 *     to somebody else) that would have to be copied here to stay true.
 *   · `exitReason` · `exitedAt` — `CHECK lead_exit_pair` and `lead_exit_no_stage`
 *     tie them to `stage`, so they move together through their own door.
 *   · `motion` · `campaignId` — where the lead CAME FROM. That is history, and
 *     history is not a thing you correct on a form six weeks later.
 *
 *  ------------------------------------------------------------------
 *  NO MONEY-PAIR REFINE, UNLIKE `LeadCreate`
 *  ------------------------------------------------------------------
 *  `LeadCreate` can check "budget and currency travel together" because it sees
 *  the whole row. A patch sees a FRAGMENT: sending only `budget` is perfectly
 *  legal when the row already holds a currency, and a refine here would refuse
 *  it while knowing nothing about what is stored. So the pair is left to
 *  `CHECK lead_money_pair`, which is the only party that can see both halves —
 *  and `lead.constraints.ts` already turns it into a 400 naming both boxes,
 *  not the 500 the `LeadCreate` docblock warns about. */
export const LeadPatch = z
  .object({
    // ── info · who the customer is ────────────────────── slots 1 · 2 · 3 ────
    legalName: clearableText(LEAD_MAX.legalName),
    /** Shape-checked like the create door, and `null` still clears it: one rule
     *  for a value, both doors — a tax code the form refuses must not be
     *  reachable by editing the profile afterwards. */
    taxCode: taxCodeClearable,
    address: clearableText(LEAD_MAX.address),
    province: clearableText(LEAD_MAX.province),
    category: LeadCategory.nullish(),
    mainProduct: clearableText(LEAD_MAX.mainProduct),
    headcount: counted('Số người', LEAD_NUM.headcountMax).nullish(),
    plants: counted('Số nhà máy', LEAD_NUM.plantsMax).nullish(),

    // ── contact · who we talk to ──────────────────────── slots 4 · 5 ────────
    //
    // `contactName` and `email` are the two NOT NULL columns this door can
    // touch, so they are optional but NOT nullable: correcting a typo is the
    // point, deleting the only way to reach a customer is not — and the column
    // would refuse it anyway, one layer later and in worse words.
    contactName: textNhap(LEAD_MAX.contactName).optional(),
    contactTitle: clearableText(LEAD_MAX.contactTitle),
    email: email.optional(),
    phone: phoneOptional.nullish(),
    contactChannel: ContactChannel.nullish(),
    contactChannelUrl: channelUrlClearable,

    // ── need · what the customer wants solved ─────────── slots 6…10 ─────────
    pain: clearableText(LEAD_MAX.pain),
    currentStack: clearableText(LEAD_MAX.currentStack),
    decisionMaker: clearableText(LEAD_MAX.decisionMaker),
    approver: clearableText(LEAD_MAX.approver),
    /* Bounded exactly as on the create door. A ceiling one door holds and the
       other does not is a ceiling: the value simply arrives through the door
       that lets it in, and the book ends up holding what the form refuses. */
    budget: Dong.max(LEAD_NUM.budgetMax, 'Ngân sách vượt mức ghi nhận được').nullish(),
    currency: CurrencyCode.nullish(),
    deadline: deadlineDay.nullish(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    /* An empty body is a request that cannot be answered honestly: 200 claims a
       write that never happened, and the row's `updated_at` would move for
       nobody. Refusing names the real mistake — the caller built the body from
       a diff that turned out to be empty, and the button should have been
       disabled. */
    message: 'Không có ô nào để sửa — thân bài rỗng.',
  })

/** What `PATCH /sales/leads/:code` answers with: the profile, re-read.
 *
 *  The whole profile rather than the fields that changed, and read back through
 *  the ordinary read path rather than assembled from what was just written —
 *  same reason `setOwner` gives. `requiredFilled` is a GENERATED column, so
 *  filling in a phone number moves the init-data gate without this door
 *  touching it; a response built from the patch body would carry the old count
 *  and the gate bar on screen would sit one notch behind the truth. */
export const LeadPatchResponse = LeadProfile

// ---------------------------------------------------------------------------
// HANDING A LEAD OVER — `PATCH /sales/leads/:code/owner`
// ---------------------------------------------------------------------------

/** Who holds this lead from now on. `null` puts it back in the common pool.
 *
 *  ------------------------------------------------------------------
 *  ONE FIELD, AND NO `task` BESIDE IT
 *  ------------------------------------------------------------------
 *  The screen this replaces sent a list of people plus a sentence naming the
 *  work ("Gọi lần 2"). Neither had a column to land in: assignment lived in
 *  browser storage, so the list could hold five people no table knew about and
 *  the sentence was picked from a list the screen derived on the fly. What the
 *  database actually models is `lead.owner_id` — ONE actor, the person the
 *  scope axis reads and `CREDIT_RULES` pays. So the door writes exactly that,
 *  and a "task" with nowhere to go is not accepted rather than accepted and
 *  dropped.
 *
 *  ------------------------------------------------------------------
 *  NULLABLE, NOT OPTIONAL — AND THE VERB IS `PATCH`
 *  ------------------------------------------------------------------
 *  `null` has to be spellable: releasing a lead back to the pool is a real
 *  move a holder makes when they go on leave, and `{}` — the shape an optional
 *  field allows — cannot say it. Optional would also give two spellings for
 *  "no owner", absent and null, where the column has exactly one.
 *
 *  So the field is REQUIRED and nullable, which makes the body name the whole
 *  new state of `owner_id`: sending it twice leaves the lead exactly where the
 *  first call put it. That is `PUT` semantics on a `PATCH` verb, and the verb
 *  is the deliberate half. `apps/web/src/app/api/client.ts` carries `POST`,
 *  `PATCH` and `DELETE` end to end — through `enableCors`, the replay rule and
 *  the interceptor chain — and its own docblock records what adding a fourth
 *  verb costs: a `main.ts` that forgets it makes every call die at preflight
 *  with no server log at all. One field's idempotency is not worth a new verb
 *  in four files.
 *
 *  An id, never a name: two people can share a name, and `lead_owner_id_actor_id_fk`
 *  is the fence that actually holds. The importer takes names because a
 *  spreadsheet is typed by a human; a screen holds the id it already read. */
export const LeadOwnerWrite = z.object({
  ownerId: z.string().min(1).max(64).nullable(),
})

/** The row as the book would show it — same answer shape as `POST /sales/leads`.
 *
 *  The whole row rather than `{ ok: true }`, and for a reason that shows up on
 *  screen: the caller sent an ID and the book prints a NAME and a mailbox, both
 *  of which live on `platform.actor` rather than in the request. Answering with
 *  the row means the cell updates from what the server stored, not from what
 *  the client hoped it stored. */
export const LeadOwnerResponse = LeadRow

// ---------------------------------------------------------------------------
// The scorecard — `GET /sales/leads/scorecard`
// ---------------------------------------------------------------------------

/** Four counts on ONE denominator, which is the whole point of the card: the
 *  screen turns three of them into percentages of the first, so they have to
 *  be counted over the same population or the percentages are of nothing.
 *
 *  ------------------------------------------------------------------
 *  COUNTS, NOT PERCENTAGES, AND NOT A PERIOD
 *  ------------------------------------------------------------------
 *  Percentages are computed by the screen because the screen already owns how
 *  a ratio is spelled (`percent()`, and `—` rather than `0%` on an empty
 *  denominator). Sending `38%` would move that decision to the server and
 *  leave the raw pair unavailable for the "38 trên 100" line underneath.
 *
 *  No date range either, deliberately. The card is labelled "cả kỳ" and reads
 *  the whole book — the same thing the frozen `FUNNEL` constant it replaces
 *  did. A period filter is a real feature, but it is one where somebody has to
 *  answer "which date puts a lead in the period" — created, entered pipeline,
 *  signed? — and inventing an answer here would bake it in unread.
 *
 *  ------------------------------------------------------------------
 *  `firstMeetings` IS A DEFINITION CHANGE, ON PURPOSE
 *  ------------------------------------------------------------------
 *  It counts leads with AT LEAST ONE meeting (`sales.meeting`). The frozen
 *  fixture computed something else — MQL plus a reachable channel — which was
 *  never derivable from real columns, and that gap is exactly why the scorecard
 *  sat on frozen constants for two days after the book was cut over to Neon.
 *  The new definition is one the meeting book can actually answer, and it is
 *  the same fact the "Lần gặp đầu" label on the lead detail screen shows — so
 *  the number on the card and the label on the row cannot disagree. */
export const LeadScorecard = z.object({
  /** Every lead in the book, whatever its status — the denominator. */
  leads: z.number().int().nonnegative(),
  /** Leads with at least one recorded meeting. */
  firstMeetings: z.number().int().nonnegative(),
  opportunities: z.number().int().nonnegative(),
  contracts: z.number().int().nonnegative(),
})

export type LeadRow = z.infer<typeof LeadRow>
export type LeadStatus = z.infer<typeof LeadStatus>
export type LeadSortKey = z.infer<typeof LeadSortKey>
export type LeadBookQuery = z.infer<typeof LeadBookQuery>
export type LeadBookResponse = z.infer<typeof LeadBookResponse>
export type LeadFacets = z.infer<typeof LeadFacets>
export type LeadProfile = z.infer<typeof LeadProfile>
export type LeadCreate = z.infer<typeof LeadCreate>
export type LeadCreateResponse = z.infer<typeof LeadCreateResponse>
export type LeadPatch = z.infer<typeof LeadPatch>
export type LeadPatchResponse = z.infer<typeof LeadPatchResponse>
export type LeadOwnerWrite = z.infer<typeof LeadOwnerWrite>
export type LeadOwnerResponse = z.infer<typeof LeadOwnerResponse>
export type LeadScorecard = z.infer<typeof LeadScorecard>
