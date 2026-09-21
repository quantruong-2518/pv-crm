import { boolean, check, date, index, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'
import { sales } from '../sales.schema'
import { configEntry } from '../config/config.schema'
import { leadOrigin } from '../lead-origin/lead-origin.schema'
import { lead } from '../lead/lead.schema'

/** Same second net as `lead_no_blank`: the mapper normalises `''` to NULL on
 *  the way in, and this is the guard for the day some future writer forgets.
 *  Copied rather than shared because `lead.schema.ts` keeps its copy private —
 *  exporting it would make one branch's table helper part of another's API. */
const noBlank = (...cols: string[]): SQL => sql.raw(cols.map((c) => `"${c}" <> ''`).join(' AND '))

/** Campaign code counter. Same reasoning as `lead_code_seq`: a sequence is the
 *  only counter that stays correct with two writers, where `SELECT max(code)`
 *  hands both of them the same answer. Starts at 1 because — unlike leads —
 *  no frozen fixture owns a block of campaign codes in the real database. */
export const campaignCodeSeq = sales.sequence('campaign_code_seq', {
  startWith: 1,
  increment: 1,
  minValue: 1,
  cache: 1,
})

/** A CAMPAIGN CONSUMES LEADS; IT DOES NOT PRODUCE THEM.
 *
 *  This is the correction decision #1 of
 *  `docs/decisions/0009-campaign-module-decisions.md` records against the
 *  first draft, and the whole table shape follows from it: a campaign is not the
 *  parent of a lead, the two are n:m through `campaign_member`, and one lead
 *  being mailed by three campaigns is ordinary rather than a duplicate.
 *
 *  Not a `platform.object` row, so E1's `story()` cannot walk from a lead back
 *  to the campaign that touched it — a debt left open on purpose. Closing it
 *  means adding a `CP` object kind, which is a change to the graph, not to this
 *  table. */
export const campaign = sales.table(
  'campaign',
  {
    code: text('code').primaryKey(),
    name: text('name').notNull(),

    /** Câu mở đầu ngắn hiện trên bước Hồ sơ của màn tạo/sửa — trang trí,
     *  không phải nghiệp vụ. Nullable, cùng lý do mọi cột "tuỳ chọn" ở đây. */
    slogan: text('slogan'),
    /** URL ảnh thumbnail — hệ chưa có kho file, nên đây là ô dán URL, không
     *  phải cột lưu file. */
    thumbnailUrl: text('thumbnail_url'),

    /** Who owns the campaign. Nullable — a campaign drafted before anyone is
     *  assigned is a real state, and inventing an owner to fill the column is
     *  how a report grows a person who never ran anything. */
    ownerId: text('owner_id'),

    /** Nguồn được quy công cho chiến dịch mail này — `config_entry.id` của một
     *  dòng `SOURCE`, cùng thứ mà `lead.campaign_id` trỏ vào.
     *
     *  Đây là sợi dây làm cho module 1 có chuỗi đợt THẬT: đợt của một nguồn là
     *  các lô (`mail_sequence_run` → `platform.mail_run`) của những chiến dịch mang
     *  mã nguồn này. Không có cột này thì hai nửa của cùng một câu chuyện —
     *  "nguồn nào kéo lead về" và "đã gửi những gì" — không nối được với nhau,
     *  và bảng nguồn phải tự bịa ra chuỗi đợt của mình.
     *
     *  NULLABLE có chủ ý: Quick MAS bắn từ sổ lead không thuộc chiến dịch nào,
     *  và một chiến dịch mail dựng trước khi ai đó quyết nó thuộc nguồn nào là
     *  một trạng thái có thật. Điền bừa để lấp cột là ghi công cho một nguồn
     *  không làm gì. */
    sourceId: text('source_id').references(() => configEntry.id),

    state: text('state').$type<'DRAFT' | 'RUNNING' | 'STOPPED' | 'DONE'>().notNull(),
    /** Last day the campaign runs, inclusive. Optional: an always-on campaign
     *  has no end, and inventing one would close it on a made-up date. */
    endsOn: date('ends_on'),
    /** The level-2 origin a lead brought in by this campaign is filed under.
     *  Nullable: campaigns created before 0059 have none, and none is guessed. */
    originId: text('origin_id').references(() => leadOrigin.id),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('campaign_owner_idx').on(t.ownerId),
    check('campaign_code_shape', sql`${t.code} ~ '^CP-[0-9]{4}$'`),
    check('campaign_state_valid', sql`${t.state} IN ('DRAFT', 'RUNNING', 'STOPPED', 'DONE')`),
    check('campaign_no_blank', noBlank('name', 'owner_id', 'slogan', 'thumbnail_url')),
  ],
)

/** MEMBERSHIP IS FROZEN AT THE MOMENT OF ADDING — decision #2 of
 *  `docs/decisions/0008-lead-schema-and-permission-decisions.md`.
 *  A dynamic segment re-evaluated per wave means wave 2 and
 *  wave 3 go to different people, and afterwards nobody can answer "who
 *  actually received what". A row here is a fact that stops moving. */
export const campaignMember = sales.table(
  'campaign_member',
  {
    campaignCode: text('campaign_code')
      .notNull()
      .references(() => campaign.code),
    leadCode: text('lead_code')
      .notNull()
      .references(() => lead.code),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    /** REMOVED rather than deleted: taking someone out of the audience must
     *  not erase that they were mailed in wave 1. */
    state: text('state').$type<'ACTIVE' | 'REMOVED'>().notNull().default('ACTIVE'),
  },
  (t) => [
    index('campaign_member_lead_idx').on(t.leadCode),
    check('campaign_member_state_valid', sql`${t.state} IN ('ACTIVE', 'REMOVED')`),
    primaryKey({ columns: [t.campaignCode, t.leadCode] }),
  ],
)

/** Ready-made copy the sender picks from, then edits. Deliberately NOT
 *  referenced by `mail_run`: the batch snapshots subject and body at creation,
 *  so editing a template never rewrites what already went out. Which is also
 *  why this table can live in `sales` while the batch lives in `platform` —
 *  nothing on the send path ever reads it. */
export const mailTemplate = sales.table(
  'mail_template',
  {
    code: text('code').primaryKey(),
    name: text('name').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    ctaLabel: text('cta_label'),
    ctaUrl: text('cta_url'),
    /** The booking link — the letter's second button. ONE column and not a
     *  pair: the button's label is a constant in `@pv/mail-templates`, so there
     *  is no second half to fall out of step and no CHECK to write. */
    bookingUrl: text('booking_url'),
    /** Same "no delete, only switch off" rule the config catalogue uses: a
     *  retired template must stay readable, because runs still name it. */
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('mail_template_cta_pair', sql`(${t.ctaLabel} IS NULL) = (${t.ctaUrl} IS NULL)`),
    check(
      'mail_template_no_blank',
      noBlank('name', 'subject', 'body', 'cta_label', 'cta_url', 'booking_url'),
    ),
  ],
)

/** `Db` suffix to keep this apart from `CampaignRow` in `@pv/contracts` — the
 *  wire shape, built by `campaign.mapper.ts` from this and never returned raw. */
export type CampaignRowDb = typeof campaign.$inferSelect
export type CampaignMemberRow = typeof campaignMember.$inferSelect
export type MailTemplateRow = typeof mailTemplate.$inferSelect
