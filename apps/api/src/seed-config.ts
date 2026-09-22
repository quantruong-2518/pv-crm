import {
  CONFIG_PREFIX,
  ContactChannel,
  ExitReason,
  LeadCategory,
  LeadTier,
  StageKey,
  type ConfigList,
} from '@pv/contracts'
import { STAFF } from './staff'
import { PRODUCTS, SOURCES } from './seed-book'

/** The eight `config_entry` lists `seed.ts` plants.
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
  new: ['Khởi tạo opp', 2],
  assigned: ['Nhận PIC', 14],
  sample: ['Sample', 21],
  poc: ['POC', 21],
  quotation: ['Quotation', 30],
}
const TIER_NAME: Record<LeadTier, string> = { prospect: 'Đầu mối', mql: 'MQL', sql: 'SQL' }
const CATEGORY_CONFIG: Record<LeadCategory, [string, string]> = {
  chip: ['Chip', 'u-sale'],
  mechanical: ['Cơ khí', 'u-am'],
  automotive: ['Ô tô', 'u-am'],
  pharma: ['Dược', 'u-grace'],
}
export const EXIT_NAME: Record<ExitReason, string> = {
  unreachable: 'Không gọi được ai',
  'not-a-fit': 'Không phải khách của mình',
  'no-budget': 'Năm nay không có tiền',
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
 *  API value, not a `config_entry` row, so five scoped catch-alls never collide
 *  on `config_name_live`. */
const CARE_REASONS: ConfigSeed[] = [
  { name: 'Không tìm được PIC phù hợp', stage: 'new' },
  { name: 'Lead không đủ điều kiện', stage: 'new' },
  { name: 'Trùng opp khác', stage: 'new' },
  { name: 'Không liên lạc được khách', stage: 'assigned' },
  { name: 'Khách chưa có nhu cầu thật', stage: 'assigned' },
  { name: 'Khách hẹn lại sau', stage: 'assigned' },
  { name: 'Khách từ chối nhận sample', stage: 'sample' },
  { name: 'Sample không đạt yêu cầu', stage: 'sample' },
  { name: 'Khách không phản hồi', stage: 'sample' },
  { name: 'POC không đạt', stage: 'poc' },
  { name: 'Khách đổi yêu cầu kỹ thuật', stage: 'poc' },
  { name: 'Chọn giải pháp khác', stage: 'poc' },
  { name: 'Giá cao hơn đối thủ', stage: 'quotation' },
  { name: 'Khách không chấp nhận điều khoản', stage: 'quotation' },
  { name: 'Ngân sách bị cắt', stage: 'quotation' },
  { name: 'Chọn đối thủ', stage: 'quotation' },
  { name: 'Khách hoãn dự án', stage: 'quotation' },
]

type ConfigSeed = {
  name: string
  limitDays?: number
  ownerId?: string
  kind?: string
  stage?: StageKey
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
  ...configRows(
    'EXIT_REASON',
    ExitReason.options.map((k) => ({ name: EXIT_NAME[k] })),
  ),
  ...configRows(
    'CHANNEL',
    ContactChannel.options.map((k) => ({ name: CHANNEL_NAME[k] })),
  ),
  ...sourceRows,
  ...productRows,
  ...configRows('LOSS_REASON', CARE_REASONS),
]
