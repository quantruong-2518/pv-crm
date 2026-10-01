import {
  CONFIG_PREFIX,
  ContactChannel,
  LeadCategory,
  LeadTier,
  StageKey,
  type ConfigList,
} from '@pv/contracts'
import { STAFF } from './staff'
import { PRODUCTS, SOURCES } from './seed-book'

/** Every `config_entry` list `seed.ts` plants.
 *  Vocabulary rather than demo data, so the labels match the ones the old
 *  fixture seed wrote and the screens already print. */

export function person(id: string) {
  const p = STAFF.find((s) => s.id === id)
  if (!p) throw new Error(`seed-book names "${id}", who is not in staff.ts`)
  return p
}

/* Labels keyed by the enum, so a new enum value is a compile error here and
   the ord of each row matches the enum's order — the join `ladder.ts` relies on. */
const STAGE_CONFIG: Record<StageKey, [string, number]> = {
  new: ['Khởi tạo', 2],
  assigned: ['Đang phân công', 14],
  engaged: ['Chăm sóc', 21],
  quotation: ['Báo giá', 30],
}
const TIER_NAME: Record<LeadTier, string> = { prospect: 'Đầu mối', mql: 'MQL', sql: 'SQL' }
const CATEGORY_CONFIG: Record<LeadCategory, [string, string]> = {
  chip: ['Chip', 'u-sale'],
  mechanical: ['Cơ khí', 'u-am'],
  automotive: ['Ô tô', 'u-am'],
  pharma: ['Dược', 'u-grace'],
}
/** Seed-local keys for the six stop reasons the catalogue starts with (ADR 0070);
 *  the closed contract enum is gone, and what a lead stores is the `EX-` id. */
const EXIT_KEYS = [
  'unreachable',
  'not-a-fit',
  'no-budget',
  'contact-left',
  'chose-competitor',
  'silent-after-quote',
] as const
export type SeedExitKey = (typeof EXIT_KEYS)[number]
const EXIT_NAME: Record<SeedExitKey, string> = {
  unreachable: 'Không gọi được ai',
  'not-a-fit': 'Không phải khách của mình',
  'no-budget': 'Chưa có ngân sách năm nay',
  'contact-left': 'Người liên hệ nghỉ việc',
  'chose-competitor': 'Khách chọn bên khác',
  'silent-after-quote': 'Im sau báo giá',
}
const CHANNEL_NAME: Record<ContactChannel, string> = {
  email: 'Email',
  'zalo-oa': 'Zalo OA',
  telegram: 'Telegram',
  'in-app': 'Trong app',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  website: 'Website',
}
/** Provisional (ADR 0064 §5 — Open #2): why an opp leaves the board into the
 *  care list, one bucket per stage it can fail at. The owner will replace this
 *  catalogue. No catch-all row: `OPPORTUNITY_CARE_REASON_OTHER` is a virtual
 *  API value, not a `config_entry` row, so scoped catch-alls never collide on
 *  `config_name_live`. The sample and POC rows sit under `engaged` (ADR 0072). */
const CARE_REASONS: ConfigSeed[] = [
  { name: 'Không tìm được PIC phù hợp', stage: 'new' },
  { name: 'Lead không đủ điều kiện', stage: 'new' },
  { name: 'Trùng opp khác', stage: 'new' },
  { name: 'Không liên lạc được khách', stage: 'assigned' },
  { name: 'Khách chưa có nhu cầu thật', stage: 'assigned' },
  { name: 'Khách hẹn lại sau', stage: 'assigned' },
  { name: 'Khách từ chối nhận sample', stage: 'engaged' },
  { name: 'Sample không đạt yêu cầu', stage: 'engaged' },
  { name: 'Khách không phản hồi', stage: 'engaged' },
  { name: 'POC không đạt', stage: 'engaged' },
  { name: 'Khách đổi yêu cầu kỹ thuật', stage: 'engaged' },
  { name: 'Chọn giải pháp khác', stage: 'engaged' },
  { name: 'Giá cao hơn đối thủ', stage: 'quotation' },
  { name: 'Khách không chấp nhận điều khoản', stage: 'quotation' },
  { name: 'Ngân sách bị cắt', stage: 'quotation' },
  { name: 'Chọn đối thủ', stage: 'quotation' },
  { name: 'Khách hoãn dự án', stage: 'quotation' },
]

/** The any-rung reasons of canvas board F-Wait (ADR 0069 §11), with the ids
 *  and do-not-contact flags migration 0068 plants on Neon (ADR 0067 D5).
 *  LR-93 is left out: seed row LR-17 already carries its name, and
 *  `config_name_live` refuses a second — 0068 skips it the same way. */
const ANY_RUNG_REASONS = [
  { id: 'LR-90', name: 'Chưa có ngân sách năm nay', doNotContact: false },
  { id: 'LR-91', name: 'Người liên hệ nghỉ việc', doNotContact: true },
  { id: 'LR-92', name: 'Khách chọn bên khác', doNotContact: false },
  { id: 'LR-94', name: 'Không phải khách của mình', doNotContact: true },
]

/** Comm close-out vocabulary (ADR 0074), the same rows migration 0075 plants.
 *  Words, not scores: each question carries its own answers. */
const COMM_QUESTIONS: [string, string[]][] = [
  ['Khách quan tâm thế nào?', ['Rất quan tâm', 'Có quan tâm', 'Chưa quan tâm']],
  [
    'Đã chạm được người quyết định chưa?',
    ['Đã gặp người quyết định', 'Mới gặp người ảnh hưởng', 'Chưa'],
  ],
  ['Cuộc trao đổi đạt mục tiêu không?', ['Đạt', 'Đạt một phần', 'Chưa đạt']],
]
const STEP_KINDS = [
  'Gọi lại',
  'Hẹn gặp',
  'Gửi tài liệu',
  'Gửi mẫu',
  'Gửi báo giá',
  'Theo dõi phản hồi',
]

type ConfigSeed = {
  name: string
  limitDays?: number
  ownerId?: string
  kind?: string
  stage?: StageKey
  criterionId?: string
}

function configRows(list: ConfigList, items: ConfigSeed[]) {
  return items.map((it, i) => ({
    id: `${CONFIG_PREFIX[list]}-${String(i + 1).padStart(2, '0')}`,
    list,
    name: it.name,
    ord: i + 1,
    limitDays: it.limitDays ?? null,
    ownerId: it.ownerId ?? null,
    kind: it.kind ?? null,
    stage: it.stage ?? null,
    criterionId: it.criterionId ?? null,
  }))
}

const sourceRows = configRows(
  'SOURCE',
  SOURCES.map((s) => ({ name: s.name, kind: s.kind })),
)
export const productRows = configRows(
  'PRODUCT',
  PRODUCTS.map((name) => ({ name })),
)
export const sourceIdOf = (key: string) => sourceRows[SOURCES.findIndex((s) => s.key === key)]!.id
const exitRows = configRows(
  'EXIT_REASON',
  EXIT_KEYS.map((k) => ({ name: EXIT_NAME[k] })),
)
export const exitIdOf = (key: SeedExitKey) => exitRows[EXIT_KEYS.indexOf(key)]!.id
const criterionRows = configRows(
  'COMM_CRITERION',
  COMM_QUESTIONS.map(([name]) => ({ name })),
)
/* `ord` runs across the whole list (`config_ord_uniq` is per list), so within
   one question the answers keep their relative order. */
const answerRows = configRows(
  'COMM_ANSWER',
  COMM_QUESTIONS.flatMap(([, answers], q) =>
    answers.map((name) => ({ name, criterionId: criterionRows[q]!.id })),
  ),
)

export const configSeed = [
  ...configRows(
    'STAGE',
    StageKey.options.map((k) => ({ name: STAGE_CONFIG[k][0], limitDays: STAGE_CONFIG[k][1] })),
  ),
  ...configRows(
    'TIER',
    LeadTier.options.map((k) => ({ name: TIER_NAME[k] })),
  ),
  ...configRows(
    'CATEGORY',
    LeadCategory.options.map((k) => ({
      name: CATEGORY_CONFIG[k][0],
      ownerId: person(CATEGORY_CONFIG[k][1]).id,
    })),
  ),
  ...exitRows,
  ...configRows(
    'CHANNEL',
    ContactChannel.options.map((k) => ({ name: CHANNEL_NAME[k] })),
  ),
  ...sourceRows,
  ...productRows,
  ...configRows('LOSS_REASON', CARE_REASONS),
  ...ANY_RUNG_REASONS.map((r, i) => ({
    ...r,
    list: 'LOSS_REASON' as const,
    ord: CARE_REASONS.length + i + 1,
    stage: null,
  })),
  ...criterionRows,
  ...answerRows,
  ...configRows(
    'STEP_KIND',
    STEP_KINDS.map((name) => ({ name })),
  ),
]
