import type { Rng } from './rng'

/** Vietnamese name parts for the invented customer base. Cores are three
 *  neutral syllables, because the common two-syllable pairs are real brands. */

export const slugify = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const LEGAL_FORMS = [
  ['Công ty TNHH', 50],
  ['Công ty Cổ phần', 40],
  ['Công ty TNHH MTV', 10],
] as const

/** Sector words by CATEGORY name, so a company reads like its category. */
export const SECTORS_BY_CATEGORY: Record<string, string[]> = {
  'Điện tử': ['Điện tử', 'Linh kiện điện tử', 'Lắp ráp PCB'],
  Chip: ['Bán dẫn', 'Vi mạch', 'Kiểm thử chip'],
  'Cơ khí': ['Cơ khí chính xác', 'Khuôn mẫu'],
  'Ô tô': ['Phụ tùng ô tô', 'Linh kiện xe'],
  Dược: ['Dược phẩm', 'Thiết bị y tế'],
}
export const ANY_SECTORS = Object.values(SECTORS_BY_CATEGORY).flat()

const PARTNER_SECTORS = [
  'Tích hợp hệ thống',
  'Phân phối thiết bị',
  'Giải pháp tự động hoá',
  'Công nghệ nhà máy',
  'Thương mại máy móc',
  'Dịch vụ công nghiệp',
]

const SYLLABLES_A = ['Tân', 'Lạc', 'Kiến', 'Thiên', 'Đông', 'Vạn', 'Nhân', 'Bình', 'Quy', 'Hồng']
const SYLLABLES_B = ['Mộc', 'Vinh', 'Hà', 'Cát', 'Lĩnh', 'Trúc', 'Sơn', 'Giang', 'Phong', 'Nguyên']
const SYLLABLES_C = ['Phát', 'Lợi', 'An', 'Đạt', 'Thịnh', 'Tín', 'Khang', 'Thuận', 'Hưng', 'Việt']

const FAMILY_NAMES = [
  ['Nguyễn', 30],
  ['Trần', 14],
  ['Lê', 10],
  ['Phạm', 8],
  ['Hoàng', 6],
  ['Vũ', 6],
  ['Đặng', 5],
  ['Bùi', 5],
  ['Đỗ', 4],
  ['Ngô', 3],
  ['Dương', 3],
  ['Lý', 2],
  ['Đinh', 2],
  ['Phan', 2],
] as const

const MALE_MIDDLE = ['Văn', 'Hữu', 'Minh', 'Quốc', 'Đức', 'Thanh', 'Xuân', 'Anh', 'Công']
const FEMALE_MIDDLE = ['Thị', 'Ngọc', 'Thu', 'Thanh', 'Mai', 'Hồng', 'Phương', 'Kim']
const MALE_GIVEN = [
  'Hùng',
  'Dũng',
  'Long',
  'Tuấn',
  'Nam',
  'Sơn',
  'Hải',
  'Khoa',
  'Thắng',
  'Bình',
  'Cường',
  'Đạt',
  'Phúc',
  'Quang',
]
const FEMALE_GIVEN = [
  'Lan',
  'Hương',
  'Linh',
  'Trang',
  'Thảo',
  'Ngân',
  'Hà',
  'Yến',
  'Nhung',
  'Vân',
  'Mai',
  'Oanh',
  'Thuỷ',
]

/** One invented company name; `used` keeps cores unique so slugs never clash. */
export function inventName(
  rng: Rng,
  used: Set<string>,
  sectors: readonly string[] | null = null,
): { name: string; shortName: string; slug: string } {
  for (;;) {
    const core = [rng.pick(SYLLABLES_A), rng.pick(SYLLABLES_B), rng.pick(SYLLABLES_C)].join(' ')
    const slug = slugify(core)
    if (used.has(slug)) continue
    used.add(slug)
    const sector = rng.pick(sectors ?? PARTNER_SECTORS)
    const shortName = `${sector} ${core}`
    return { name: `${rng.weighted(LEGAL_FORMS)} ${shortName}`, shortName, slug }
  }
}

/** A full name and its ascii mail local part, e.g. `an.nguyen`. */
export function inventPerson(rng: Rng): { name: string; mail: string } {
  const female = rng.chance(0.4)
  const family = rng.weighted(FAMILY_NAMES)
  const middle = rng.pick(female ? FEMALE_MIDDLE : MALE_MIDDLE)
  const given = rng.pick(female ? FEMALE_GIVEN : MALE_GIVEN)
  return {
    name: `${family} ${middle} ${given}`,
    mail: `${slugify(given)}.${slugify(family)}`,
  }
}
