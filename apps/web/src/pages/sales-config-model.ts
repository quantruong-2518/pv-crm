import type { ConfigEntry, ConfigList } from '@pv/contracts'
import type { ConfigEdit, LadderRow } from '@/data/sales-config'

/** A whole number of days, at least one. Zero is refused here although the
 *  server accepts it: a zero-day deadline is late the instant a row arrives,
 *  which nobody means to set by typing into a box. */
export function isDays(v: string): boolean {
  return /^\d+$/.test(v.trim()) && Number(v) > 0
}

/** Draft → proposals, one comparison for both ladders. Dropped silently:
 *  untouched boxes, emptied boxes (`ConfigEntryPatch.limitDays` takes no
 *  `null`, so a deadline cannot be removed yet) and boxes typed back to the
 *  current value. A box holding a non-number is NOT dropped silently — the
 *  page blocks the whole send on it. */
export function editsOf(
  cells: { list: ConfigList; row: LadderRow; what: string }[],
  typed: Record<string, string>,
): ConfigEdit[] {
  const edits: ConfigEdit[] = []

  for (const { list, row, what } of cells) {
    const v = typed[`${list}/${row.id}`]
    if (v === undefined || !isDays(v)) continue

    const limitDays = Number(v)
    if (limitDays === row.limitDays) continue

    edits.push({ list, id: row.id, what, limitDays })
  }

  return edits
}

export const byOrd = (a: ConfigEntry, b: ConfigEntry) => a.ord - b.ord

/** The screen's map — flows in funnel order, each with its sections. ONE list
 *  feeds both nav tiers and every `Section` heading. The exception is
 *  `motions`: `MotionPickerSection` is shared with the lead-origins screen and
 *  prints its own heading. `no` is the stable number a section is cited by in
 *  comments and in its accessible name; it does not follow this order. */
export const CONFIG_AREAS = [
  {
    key: 'intake',
    label: 'Tiếp nhận lead',
    sections: [{ id: 'motions', no: '5.13', title: 'Phương án tiếp cận' }],
  },
  {
    key: 'assign',
    label: 'Phân công',
    sections: [{ id: 'motion-policy', no: '5.9', title: 'Thiết lập luồng' }],
  },
  {
    key: 'care',
    label: 'Chăm sóc và liên hệ',
    sections: [
      { id: 'stop-reasons', no: '5.4', title: 'Lý do dừng chăm sóc' },
      { id: 'comm-criteria', no: '5.10', title: 'Câu hỏi đánh giá liên hệ' },
      { id: 'step-kinds', no: '5.11', title: 'Loại bước tiếp theo' },
    ],
  },
  {
    key: 'deal',
    label: 'Cơ hội',
    sections: [
      { id: 'freshness', no: '5.12', title: 'Hoạt động cuối' },
      { id: 'care-reasons', no: '5.4b', title: 'Lý do vào danh sách chăm sóc' },
      { id: 'products', no: '5.4c', title: 'Sản phẩm/dịch vụ' },
    ],
  },
  {
    key: 'frame',
    label: 'Khung hành trình',
    sections: [
      { id: 'step-frame', no: '5.14', title: 'Bước tiếp theo theo từng trạng thái' },
      { id: 'tier-limits', no: '5.5', title: 'Hạn từng bậc lead' },
    ],
  },
] as const

export type ConfigArea = (typeof CONFIG_AREAS)[number]
export type AreaKey = ConfigArea['key']
export type SectionId = ConfigArea['sections'][number]['id']

const SECTIONS = CONFIG_AREAS.flatMap((a) => [...a.sections])

export function sectionOf(id: SectionId) {
  const found = SECTIONS.find((s) => s.id === id)
  if (!found) throw new Error(`Unknown config section "${id}"`)
  return found
}
