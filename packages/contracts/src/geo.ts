import { z } from 'zod'
import { LEAD_MAX } from './sales/lead-fields'
import { SEARCH_MIN_CHARS } from './search-text'

/** Address lookup — `GET /geo/address-suggest`. A suggestion is text to store,
 *  never an id to keep: nothing here reaches a table except as the plain
 *  `address` / `province` strings the lead already has. An empty `q` is a
 *  probe: it answers `enabled` alone, so the form knows whether to offer the
 *  picker before anyone types.
 *
 *  A suggestion is capped at the tightest column it can land in (the lead's),
 *  so a pick never comes back from the server as a field error the user did
 *  not type. */
export const ADDRESS_SUGGEST_MIN_CHARS = SEARCH_MIN_CHARS
export const ADDRESS_SUGGEST_MAX_ITEMS = 8
export const ADDRESS_SUGGEST_Q_MAX = 120

/** `lat,lng` — where the caller is looking; the provider ranks nearby matches
 *  first, which is what makes a short query find the right street. */
export const AddressFocus = z
  .string()
  .trim()
  .regex(/^-?\d{1,2}(\.\d{1,8})?,-?\d{1,3}(\.\d{1,8})?$/)

export const AddressSuggestQuery = z
  .object({
    q: z.string().trim().max(ADDRESS_SUGGEST_Q_MAX).default(''),
    focus: AddressFocus.optional(),
  })
  .strict()
export type AddressSuggestQuery = z.infer<typeof AddressSuggestQuery>

export const AddressSuggestion = z.object({
  /** Provider handle, spent on the map's `GET /geo/place` and never stored. */
  refId: z.string().max(400),
  address: z.string().max(LEAD_MAX.address),
  province: z.string().max(LEAD_MAX.province),
})
export type AddressSuggestion = z.infer<typeof AddressSuggestion>

export const AddressSuggestResult = z.object({
  enabled: z.boolean(),
  items: z.array(AddressSuggestion).max(ADDRESS_SUGGEST_MAX_ITEMS),
})
export type AddressSuggestResult = z.infer<typeof AddressSuggestResult>

/** A point on the map behind the picker. `lat`/`lng` only steer the map view;
 *  the caller keeps `address` / `province` and drops the rest — coordinates are
 *  never written to a lead. `place` is null when the provider had no answer. */
export const AddressPlace = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().max(LEAD_MAX.address),
  province: z.string().max(LEAD_MAX.province),
})
export type AddressPlace = z.infer<typeof AddressPlace>

export const AddressPlaceResult = z.object({ place: AddressPlace.nullable() })
export type AddressPlaceResult = z.infer<typeof AddressPlaceResult>

/** `GET /geo/place?refId=` — a suggestion's handle to its point. */
export const AddressPlaceQuery = z.object({ refId: z.string().trim().min(1).max(400) }).strict()
export type AddressPlaceQuery = z.infer<typeof AddressPlaceQuery>

/** The 34 provincial units after the 2025 merger, as stored: bare name, no
 *  "province" / "city" prefix. */
export const VN_PROVINCES = [
  'Hà Nội',
  'Huế',
  'Lai Châu',
  'Điện Biên',
  'Sơn La',
  'Lạng Sơn',
  'Quảng Ninh',
  'Thanh Hóa',
  'Nghệ An',
  'Hà Tĩnh',
  'Cao Bằng',
  'Tuyên Quang',
  'Lào Cai',
  'Thái Nguyên',
  'Phú Thọ',
  'Bắc Ninh',
  'Hưng Yên',
  'Hải Phòng',
  'Ninh Bình',
  'Quảng Trị',
  'Đà Nẵng',
  'Quảng Ngãi',
  'Gia Lai',
  'Khánh Hòa',
  'Lâm Đồng',
  'Đắk Lắk',
  'Hồ Chí Minh',
  'Đồng Nai',
  'Tây Ninh',
  'Cần Thơ',
  'Vĩnh Long',
  'Đồng Tháp',
  'Cà Mau',
  'An Giang',
] as const

/** Folded pre-2025 names and common aliases → the new unit. Hand-copied into
 *  migration 0156's backfill (which says it copies this): change both. */
const PROVINCE_ALIASES: Record<string, (typeof VN_PROVINCES)[number]> = {
  hagiang: 'Tuyên Quang',
  yenbai: 'Lào Cai',
  backan: 'Thái Nguyên',
  baccan: 'Thái Nguyên',
  vinhphuc: 'Phú Thọ',
  hoabinh: 'Phú Thọ',
  bacgiang: 'Bắc Ninh',
  thaibinh: 'Hưng Yên',
  haiduong: 'Hải Phòng',
  hanam: 'Ninh Bình',
  namdinh: 'Ninh Bình',
  quangbinh: 'Quảng Trị',
  quangnam: 'Đà Nẵng',
  kontum: 'Quảng Ngãi',
  binhdinh: 'Gia Lai',
  ninhthuan: 'Khánh Hòa',
  daknong: 'Lâm Đồng',
  binhthuan: 'Lâm Đồng',
  phuyen: 'Đắk Lắk',
  binhduong: 'Hồ Chí Minh',
  bariavungtau: 'Hồ Chí Minh',
  vungtau: 'Hồ Chí Minh',
  brvt: 'Hồ Chí Minh',
  binhphuoc: 'Đồng Nai',
  longan: 'Tây Ninh',
  soctrang: 'Cần Thơ',
  haugiang: 'Cần Thơ',
  bentre: 'Vĩnh Long',
  travinh: 'Vĩnh Long',
  tiengiang: 'Đồng Tháp',
  baclieu: 'Cà Mau',
  kiengiang: 'An Giang',
  thuathienhue: 'Huế',
  hcm: 'Hồ Chí Minh',
  saigon: 'Hồ Chí Minh',
  hochiminhcity: 'Hồ Chí Minh',
  hn: 'Hà Nội',
}

const plain = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const fold = (s: string) => plain(s).replace(/[^a-z0-9]/g, '')

const PROVINCE_BY_KEY: Record<string, string> = {
  ...Object.fromEntries(VN_PROVINCES.map((p) => [fold(p), p])),
  ...PROVINCE_ALIASES,
}

/** Free text → the new unit's bare name; unknown text comes back trimmed, as typed. */
export function normaliseProvince(text: string): string {
  const trimmed = text.trim()
  // "TP" may sit glued to the name ("TP.HCM", "TPHCM"); "T." needs its dot.
  const bare = plain(trimmed).replace(/^(tinh|thanh\s*pho|tp|t\.)[\s.]*/, '')
  return PROVINCE_BY_KEY[fold(bare)] ?? trimmed
}

/** `GET /geo/reverse?lat=&lng=` — the address under a click on the map. */
export const AddressReverseQuery = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  })
  .strict()
export type AddressReverseQuery = z.infer<typeof AddressReverseQuery>
