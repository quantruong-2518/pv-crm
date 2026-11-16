import { keysOf } from '@api/branches/sales/account/account.mapper'
import { sizeBandOfCount } from '@api/branches/sales/lead/lead-size-band'
import { addDays, vnAt } from './clock'
import { ANY_SECTORS, SECTORS_BY_CATEGORY, inventName, inventPerson } from './companies-names'
import { COUNTS, WINDOW_START } from './params'
import type { Rng } from './rng'
import type { AfterWrite, Company, Contact, Ctx, Partner, World } from './types'

/** The customer base: invented companies with their contacts, plus the
 *  referral partners. Names are made from neutral syllables, never real brands.
 *  Contacts stay data here; the leads emitter writes them (they hang off a lead). */

/** [province, weight, landline area code, industrial parks]. */
const PROVINCES = [
  ['Bắc Ninh', 16, '222', ['KCN Quế Võ', 'KCN Tiên Sơn', 'KCN Yên Phong']],
  ['Bắc Giang', 10, '204', ['KCN Vân Trung', 'KCN Quang Châu']],
  ['Hải Phòng', 10, '225', ['KCN Đình Vũ', 'KCN Tràng Duệ']],
  ['Hà Nội', 10, '243', ['KCN Thăng Long', 'KCN Quang Minh']],
  ['Vĩnh Phúc', 6, '211', ['KCN Bình Xuyên', 'KCN Khai Quang']],
  ['Thái Nguyên', 8, '208', ['KCN Yên Bình', 'KCN Điềm Thụy']],
  ['Bình Dương', 12, '274', ['KCN VSIP', 'KCN Sóng Thần', 'KCN Mỹ Phước']],
  ['Đồng Nai', 10, '251', ['KCN Biên Hoà', 'KCN Long Thành']],
  ['TP. Hồ Chí Minh', 8, '283', ['KCN Hiệp Phước', 'KCN Tân Bình']],
  ['Long An', 5, '272', ['KCN Long Hậu', 'KCN Hải Sơn']],
  ['Đà Nẵng', 5, '236', ['KCN Hoà Khánh', 'KCN Liên Chiểu']],
] as const

const SIZE_WEIGHTS: [[number, number], number][] = [
  [[12, 49], 10],
  [[50, 199], 30],
  [[200, 499], 30],
  [[500, 999], 18],
  [[1000, 6000], 12],
]

/** [title, decision maker by default]. */
const TITLES: [[string, boolean], number][] = [
  [['Giám đốc nhà máy', true], 14],
  [['Phó giám đốc kỹ thuật', true], 10],
  [['Trưởng phòng IT', false], 14],
  [['Trưởng phòng mua hàng', true], 12],
  [['Kỹ sư sản xuất', false], 16],
  [['Quản đốc sản xuất', false], 10],
  [['Kế toán trưởng', false], 8],
  [['Trưởng phòng kế hoạch', false], 8],
  [['Kỹ sư chất lượng', false], 8],
]

const CATEGORY_WEIGHT: Record<string, number> = {
  'Điện tử': 30,
  Chip: 25,
  'Cơ khí': 20,
  'Ô tô': 15,
  Dược: 10,
}

const digits = (rng: Rng, n: number): string =>
  Array.from({ length: n }, () => rng.int(0, 9)).join('')

function buildContacts(rng: Rng, domain: string): Contact[] {
  const [lo, hi] = COUNTS.contactsPerCompany
  const count = rng.int(lo, hi)
  const mails = new Set<string>()
  const contacts: Contact[] = Array.from({ length: count }, (_, index) => {
    const person = inventPerson(rng)
    const [title, senior] = rng.weighted(TITLES)
    let mail = person.mail
    for (let n = 2; mails.has(mail); n++) mail = `${person.mail}${n}`
    mails.add(mail)
    return {
      index,
      name: person.name,
      title,
      email: `${mail}@${domain}`,
      phone: `+84 9${rng.int(0, 9)}${rng.int(0, 9)} ${digits(rng, 3)} ${digits(rng, 3)}`,
      isDecisionMaker: senior && rng.chance(0.8),
    }
  })
  if (!contacts.some((c) => c.isDecisionMaker)) {
    contacts[0] = { ...contacts[0]!, title: 'Giám đốc nhà máy', isDecisionMaker: true }
  }
  return contacts
}

export function buildCompanies(
  rng: Rng,
  world: World,
): { companies: Company[]; partners: Partner[] } {
  const used = new Set<string>()
  const companies = Array.from({ length: COUNTS.companies }, (_, index): Company => {
    const cats = world.config.get('CATEGORY') ?? []
    const cat =
      cats.length > 0
        ? rng.weighted(cats.map((r) => [r, CATEGORY_WEIGHT[r.name] ?? 10] as const))
        : null
    const { name, shortName, slug } = inventName(
      rng,
      used,
      (cat && SECTORS_BY_CATEGORY[cat.name]) || ANY_SECTORS,
    )
    const [province, , area, parks] = rng.weighted(PROVINCES.map((p) => [p, p[1]] as const))
    const [lo, hi] = rng.weighted(SIZE_WEIGHTS)
    const headcount = Math.round(rng.logUniform(lo, hi + 1))
    const domain = `${slug}.example`
    const kin = world.industries.filter((i) => cat && i.parentId === cat.id)
    const industries = kin.length > 0 ? kin : world.industries
    const company: Company = {
      index,
      name,
      shortName,
      slug,
      domain,
      categoryId: cat?.id ?? null,
      industryId: industries.length > 0 ? rng.pick(industries).id : null,
      province,
      sizeBand: sizeBandOfCount(headcount),
      headcount,
      phone: `+84 ${area} ${rng.int(3, 8)}${digits(rng, 2)} ${digits(rng, 4)}`,
      address: `Lô ${rng.pick(['A', 'B', 'C', 'D'])}${rng.int(1, 40)}, ${rng.pick(parks)}, ${province}`,
      contacts: buildContacts(rng, domain),
    }
    return company
  })
  const partners = Array.from({ length: COUNTS.partners }, (_, index): Partner => {
    const { name, slug } = inventName(rng, used)
    return { index, name, slug }
  })
  return { companies, partners }
}

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** `ABC-123` with at least one letter and one digit, like the partner door's. */
function drawRef(rng: Rng, taken: Set<string>): string {
  for (;;) {
    const chars = Array.from({ length: 6 }, () => REF_ALPHABET[rng.int(0, REF_ALPHABET.length - 1)])
    const raw = chars.join('')
    const ref = `${raw.slice(0, 3)}-${raw.slice(3)}`
    if (/[A-Z]/.test(raw) && /[2-9]/.test(raw) && !taken.has(ref)) {
      taken.add(ref)
      return ref
    }
  }
}

export function emitCompanies(ctx: Ctx): void {
  const { plan, mint, rng, world } = ctx
  for (const c of ctx.companies) {
    const code = mint('AC')
    ctx.ids.account[c.index] = code
    plan.object.push({ code, kind: 'AC', branch: 'Sales', label: c.shortName })
    /* Existing before the quarter, so the book is not all "created today". */
    const createdAt = vnAt(addDays(WINDOW_START, -rng.int(10, 400)), rng.int(8, 17), rng.int(0, 59))
    plan.account.push({
      code,
      name: c.shortName,
      /* The admission gate finds a company by these; NULL reads as a stranger. */
      ...keysOf({ name: c.shortName }),
      legalName: c.name,
      address: c.address,
      province: c.province,
      categoryId: c.categoryId,
      website: `https://${c.domain}`,
      headcount: c.headcount,
      sizeBand: c.sizeBand,
      plants: c.headcount >= 1000 ? rng.int(2, 4) : c.headcount >= 200 ? rng.int(1, 2) : 1,
      createdAt,
      updatedAt: createdAt,
    })
  }

  /* A partner sits under a partner-motion origin; any origin is the fallback. */
  const origin = ['Đại lý', 'Đối tác tích hợp'].map((n) => world.origins.get(n))
  const fallback = [...world.origins.values()][0]
  const taken = new Set<string>()
  for (const p of ctx.partners) {
    const code = mint('REF')
    ctx.ids.partner[p.index] = code
    const originId = origin[p.index % 2] ?? fallback
    if (!originId) throw new Error('No lead_origin row: run the reference seed first')
    plan.partner.push({ code, name: p.name, ref: drawRef(rng, taken), originId })
  }
}

export const afterWrite: AfterWrite | undefined = undefined
