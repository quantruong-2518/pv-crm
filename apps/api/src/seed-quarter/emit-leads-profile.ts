import type { LeadMotion, LeadTier } from '@pv/contracts'
import type { Rng } from './rng'
import type { Company, Contact, Ctx } from './types'
import type { Knobs } from './story.types'

/** The lead's profile columns. A lead fills in as it matures, so the depth
 *  follows the tier the journey reached, as the gate counts it: nothing known
 *  beyond the company, then the contact, then the need, then the money. */

const ORIGIN_BY_MOTION: Record<LeadMotion, string[]> = {
  EVENT: ['Triển lãm', 'Hội thảo', 'Webinar'],
  INBOUND: ['Website', 'Google', 'Facebook', 'Zalo OA', 'Hotline', 'Email đến'],
  OUTBOUND: ['LinkedIn', 'Email lạnh', 'Gọi lạnh', 'Gặp trực tiếp', 'Apollo'],
  PARTNER: ['Đại lý', 'Đối tác tích hợp'],
  RECYCLE: ['Lead cũ', 'Khách đã rời'],
  REFERRAL: ['Khách cũ', 'Người quen', 'Nhân viên'],
}

/** A campaign's own origin wins over the motion's pool. */
const ORIGIN_BY_CAMPAIGN: Record<string, string> = {
  'event-aug': 'Hội thảo',
  'mail-electronics': 'Email lạnh',
  'expo-sep': 'Triển lãm',
  recycle: 'Lead cũ',
  'webinar-mes': 'Webinar',
  'mail-auto': 'Email lạnh',
  expansion: 'Khách cũ',
  'tet-2027': 'Email lạnh',
}

const PRODUCTS = ['MES', 'Truy xuất nguồn gốc', 'Quản lý kho thông minh', 'Giám sát năng lượng']

const PAINS = [
  'Báo cáo sản xuất làm tay bằng Excel, cuối ngày mới có số',
  'Không truy được lô hàng khi khách phàn nàn',
  'Tồn kho lệch giữa sổ sách và thực tế',
  'Máy dừng đột xuất, không biết nguyên nhân',
  'Kế hoạch sản xuất đổi liên tục, xưởng không theo kịp',
  'Khách yêu cầu truy xuất xuất xứ nhưng chưa có hệ thống',
]

const STACKS = [
  'Excel và phần mềm kế toán riêng',
  'ERP cũ cài từ nhiều năm trước',
  'Giấy tờ và bảng tính',
  'Phần mềm tự viết, người làm đã nghỉ',
]

const CHANNELS = ['email', 'email', 'email', 'zalo-oa', 'linkedin'] as const

export function pickOrigin(ctx: Ctx, k: Knobs): string | null {
  const names = k.campaign && ORIGIN_BY_CAMPAIGN[k.campaign]
  const name = names || ctx.rng.pick(ORIGIN_BY_MOTION[k.motion])
  return ctx.world.origins.get(name) ?? null
}

const TIER_DEPTH: Record<LeadTier, number> = { prospect: 1, mql: 2, sql: 3 }

export function profileOf(rng: Rng, company: Company, person: Contact, tier: LeadTier | null) {
  const depth = tier ? TIER_DEPTH[tier] : 0
  const money = depth >= 3 && rng.chance(0.7)
  const usd = money && rng.chance(0.15)
  return {
    legalName: company.name,
    address: company.address,
    province: company.province,
    categoryId: company.categoryId,
    contactTitle: depth >= 1 ? person.title : null,
    phone: depth >= 1 ? person.phone : null,
    contactChannel: depth >= 1 ? rng.pick(CHANNELS) : null,
    mainProduct: depth >= 1 ? rng.pick(PRODUCTS) : null,
    sizeBand: depth >= 2 ? company.sizeBand : null,
    plants: depth >= 2 ? (company.headcount >= 200 ? 2 : 1) : null,
    pain: depth >= 2 ? rng.pick(PAINS) : null,
    currentStack: depth >= 3 ? rng.pick(STACKS) : null,
    decisionMaker:
      depth >= 3 ? (company.contacts.find((c) => c.isDecisionMaker)?.name ?? null) : null,
    budget: money ? (usd ? rng.int(2, 12) * 10_000 : rng.int(3, 40) * 50_000_000) : null,
    currency: money ? (usd ? ('USD' as const) : ('VND' as const)) : null,
  }
}
