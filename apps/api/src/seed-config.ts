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

/** The eight `config_entry` lists and the discovery criteria `seed.ts` plants.
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
  new: ['Mới', 2],
  discovery: ['Đang tìm hiểu', 14],
  'demo-done': ['Đã demo', 21],
  quoted: ['Đã báo giá', 30],
  'awaiting-signature': ['Chờ ký', 10],
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
/** Planted by migration 0026; re-planted because the wipe takes it too. */
const LOSS_REASONS = [
  'Giá cao hơn đối thủ',
  'Khách chọn đối thủ khác',
  'Không đủ ngân sách năm nay',
  'Dự án hoãn vô thời hạn',
  'Thiếu tính năng khách cần',
  'Thời gian triển khai không kịp',
  'Mất người ủng hộ bên trong',
]
export const CRITERIA = ['Ngân sách', 'Người quyết định', 'Timeline', 'Pain point']

type ConfigSeed = { name: string; limitDays?: number; ownerId?: string; kind?: string }

function configRows(list: ConfigList, items: ConfigSeed[]) {
  return items.map((it, i) => ({
    id: `${CONFIG_PREFIX[list]}-${String(i + 1).padStart(2, '0')}`,
    list,
    name: it.name,
    ord: i + 1,
    limitDays: it.limitDays ?? null,
    ownerId: it.ownerId ?? null,
    kind: it.kind ?? null,
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
  ...configRows(
    'LOSS_REASON',
    LOSS_REASONS.map((name) => ({ name })),
  ),
]

export const criteriaSeed = CRITERIA.map((label, i) => ({
  id: `SC-${String(i + 1).padStart(2, '0')}`,
  stage: 'discovery' as const,
  label,
  ord: i + 1,
}))
