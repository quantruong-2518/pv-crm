import type { IconGlyph } from '@pv/ui'
import { OWNER_NONE } from '@pv/contracts'
import { AMOUNT_SCALE, AMOUNT_UNIT } from './book-columns'
import { dmy } from '@/lib/date'

/** The removable chips a book draws above its toolbar (`BookPage` draws them).
 *
 *  A reader who follows a link from the overview lands on a narrowed book, and
 *  a header's filter dot does not say what narrows it. Each chip names one
 *  narrowing and takes off only its own keys; the books build the list with
 *  the two helpers here so the four of them word a range and a list alike. */

export type ActiveFilter = {
  /** React key — usually the query key the chip clears. */
  id: string
  label: string
  onDrop: () => void
  /** Replaces the default spoken name when the label alone reads badly aloud. */
  aria?: string
  icon?: IconGlyph
  className?: string
}

/** One chip for a date pair, the year always printed; either end may be open
 *  because `ColumnFilterRange` lets the reader fill only one. */
export function dayRangeChip(
  id: string,
  name: string,
  from: string | undefined,
  to: string | undefined,
  onDrop: () => void,
): ActiveFilter[] {
  if (from && to) return [{ id, label: `${name} ${dmy(from)} – ${dmy(to)}`, onDrop }]
  if (from) return [{ id, label: `${name} từ ${dmy(from)}`, onDrop }]
  if (to) return [{ id, label: `${name} đến ${dmy(to)}`, onDrop }]
  return []
}

/** One chip for a comma list, its values named and joined. `separator` is
 *  for a name that reads straight on into its values, with no colon. */
export function listChip(
  id: string,
  name: string,
  csv: string | undefined,
  nameOf: (value: string) => string,
  onDrop: () => void,
  separator = ': ',
): ActiveFilter[] {
  if (!csv) return []
  return [{ id, label: `${name}${separator}${csv.split(',').map(nameOf).join(', ')}`, onDrop }]
}

/** One chip for an amount pair, in the unit the filter was typed in. */
export function amountChip(
  id: string,
  name: string,
  min: number | undefined,
  max: number | undefined,
  onDrop: () => void,
): ActiveFilter[] {
  const said = (vnd: number) => (vnd / AMOUNT_SCALE).toLocaleString('vi-VN')
  if (min !== undefined && max !== undefined) {
    return [{ id, label: `${name} ${said(min)} – ${said(max)} ${AMOUNT_UNIT}`, onDrop }]
  }
  if (min !== undefined) return [{ id, label: `${name} từ ${said(min)} ${AMOUNT_UNIT}`, onDrop }]
  if (max !== undefined) return [{ id, label: `${name} đến ${said(max)} ${AMOUNT_UNIT}`, onDrop }]
  return []
}

/** Names a picked person for a chip. A pick the directory does not know (yet,
 *  or any more) reads as one plain phrase in every book, never as a raw id. */
export function personNameOf(
  people: readonly { id: string; name: string }[],
  none?: string,
): (id: string) => string {
  return (id) =>
    id === OWNER_NONE
      ? (none ?? PERSON_UNKNOWN)
      : (people.find((p) => p.id === id)?.name ?? PERSON_UNKNOWN)
}

const PERSON_UNKNOWN = 'Người đã chọn'
