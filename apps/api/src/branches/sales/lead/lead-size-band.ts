import { LEAD_SIZE_BAND_LABEL, LEAD_SIZE_BANDS, type LeadSizeBand } from '@pv/contracts'

/** Company size as text → a `LeadSizeBand`, for the doors that receive text:
 *  the sheet import's size column (key `headcount`) and the scan's printed
 *  headcount. The bounds are migration 0156's `legacy_size_band`, copied: each
 *  band holds its lower bound, so 200 people is `200-500` and 1,000 is `gt1000`. */

export function sizeBandOfCount(count: number): LeadSizeBand {
  if (count < 50) return 'lt50'
  if (count < 200) return '50-200'
  if (count < 500) return '200-500'
  return count < 1000 ? '500-1000' : 'gt1000'
}

/** Case, diacritics, dashes, spaces, digit grouping and the word for "people"
 *  do not matter: a label, "200-500" and "200 - 500" are one band. */
const foldBand = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/nguoi|[\s.,]/g, '')

const BAND_BY_TEXT = new Map<string, LeadSizeBand>(
  LEAD_SIZE_BANDS.flatMap((band) => [
    [foldBand(band), band],
    [foldBand(LEAD_SIZE_BAND_LABEL[band]), band],
  ]),
)

/** A band key or its label, as typed; `null` when the text is neither. */
export const sizeBandOfLabel = (text: string): LeadSizeBand | null =>
  BAND_BY_TEXT.get(foldBand(text)) ?? null

/** A scan's printed size ("200+", "1.200 staff", a band label): a band named
 *  outright first, else the first number printed; `null` when neither. */
export function sizeBandOfText(raw: string | undefined): LeadSizeBand | null {
  if (!raw) return null
  const named = sizeBandOfLabel(raw)
  if (named) return named
  const digits = raw.match(/\d[\d.,]*/)?.[0].replace(/\D/g, '')
  const n = digits ? Number(digits) : NaN
  return Number.isSafeInteger(n) && n > 0 ? sizeBandOfCount(n) : null
}
