import {
  FRAME_CHANGE_KINDS,
  type ConfigEntry,
  type ConfigList,
  type ConfigProposal,
  type LeadMotion,
} from '@pv/contracts'
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
 *  current value. A box holding a non-number is skipped here too, so the
 *  caller must block its send on `isDays` rather than trust this list. */
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

/** The screen's map — the journey frame first (it spans both phases), then the
 *  flows in funnel order, each with its sections. ONE list feeds the nav, the
 *  overview and every `Section` heading. `step` is the funnel position the
 *  nav prints, stated rather than derived so a reorder cannot renumber it.
 *  `no` is the stable number a
 *  section is cited by in comments and in its accessible name; it does not
 *  follow this order. */
export const CONFIG_AREAS = [
  {
    key: 'frame',
    label: 'Khung hành trình',
    step: null,
    sections: [
      { id: 'step-frame', no: '5.14', title: 'Bước tiếp theo theo từng trạng thái' },
      { id: 'tier-limits', no: '5.5', title: 'Hạn từng bậc lead' },
    ],
  },
  {
    key: 'intake',
    label: 'Tiếp nhận lead',
    step: 1,
    sections: [{ id: 'motions', no: '5.13', title: 'Phương án tiếp cận' }],
  },
  {
    key: 'assign',
    label: 'Phân công',
    step: 2,
    sections: [
      { id: 'motion-policy', no: '5.9', title: 'Hạn liên hệ lần đầu' },
      { id: 'industries', no: '5.20', title: 'Nhóm ngành và ngành' },
    ],
  },
  {
    key: 'care',
    label: 'Chăm sóc và liên hệ',
    step: 3,
    sections: [
      { id: 'stop-reasons', no: '5.4', title: 'Lý do dừng chăm sóc' },
      { id: 'waiting-labels', no: '5.4e', title: 'Nhãn nhóm chờ' },
      { id: 'comm-criteria', no: '5.10', title: 'Câu hỏi đánh giá liên hệ' },
      { id: 'step-kinds', no: '5.11', title: 'Loại bước tiếp theo' },
      { id: 'recare-cycles', no: '5.19', title: 'Kỳ chăm sóc khách đã mua' },
    ],
  },
  {
    key: 'deal',
    label: 'Cơ hội',
    step: 4,
    sections: [
      { id: 'freshness', no: '5.12', title: 'Hoạt động cuối' },
      { id: 'care-reasons', no: '5.4b', title: 'Lý do dừng cơ hội' },
      { id: 'quote-reasons', no: '5.4d', title: 'Lý do báo giá lại' },
      { id: 'products', no: '5.4c', title: 'Sản phẩm/dịch vụ' },
      { id: 'contract-kinds', no: '5.15', title: 'Loại hợp đồng' },
    ],
  },
  {
    key: 'kpi',
    label: 'KPI',
    step: null,
    sections: [
      { id: 'kpi-metrics', no: '5.16', title: 'Chỉ số theo vai trò' },
      { id: 'kpi-alert', no: '5.17', title: 'Ngưỡng cảnh báo' },
      { id: 'kpi-teams', no: '5.18', title: 'Phòng ban & nhóm' },
    ],
  },
] as const

export type ConfigArea = (typeof CONFIG_AREAS)[number]
export type AreaKey = ConfigArea['key']
export type SectionId = ConfigArea['sections'][number]['id']

/** The landing view. A nav entry, not an area: it has no sections of its own,
 *  and keeping it out of `CONFIG_AREAS` keeps `SectionId` exact. */
export const OVERVIEW = 'overview'
export type ConfigView = AreaKey | typeof OVERVIEW

/** `?area=` → the open view; absent or unknown lands on the overview. */
export function viewOf(param: string | null): ConfigView {
  return CONFIG_AREAS.find((a) => a.key === param)?.key ?? OVERVIEW
}

const SECTIONS = CONFIG_AREAS.flatMap((a) => [...a.sections])

export function sectionOf(id: SectionId) {
  const found = SECTIONS.find((s) => s.id === id)
  if (!found) throw new Error(`Unknown config section "${id}"`)
  return found
}

/** Lives beside `SectionId`, the type it scrolls to. The
 *  global reduced-motion rule stops CSS motion only; a scripted scroll has
 *  to ask for itself. */
export function scrollToSection(id: SectionId) {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
}

/** The head of every note about the reader's own change still waiting. */
export const WAITING = 'Đang chờ duyệt'

/** A catalog entry's waiting edits, in the approver's own sentence, or null
 *  when none waits. */
export function entryWaiting(
  proposals: ConfigProposal[],
  list: ConfigList,
  id: string,
): string | null {
  const said = proposals.flatMap((p) =>
    p.change.kind === 'update' && p.change.list === list && p.change.id === id
      ? [p.consequence]
      : [],
  )
  return said.length > 0 ? said.join(' · ') : null
}

/** Sentences of the names waiting to join one list; for `COMM_ANSWER`, one
 *  question's answers. */
export function addsWaiting(
  proposals: ConfigProposal[],
  list: ConfigList,
  criterionId?: string,
): string[] {
  return proposals.flatMap((p) =>
    p.change.kind === 'create' &&
    p.change.list === list &&
    (criterionId === undefined || p.change.draft.criterionId === criterionId)
      ? [p.consequence]
      : [],
  )
}

/** Industries waiting to join one category; `null` = the not-grouped bucket. */
export function industryAddsWaiting(proposals: ConfigProposal[], parentId: string | null) {
  return proposals.flatMap((p) =>
    p.change.kind === 'create' &&
    p.change.list === 'INDUSTRY' &&
    (p.change.draft.parentId ?? null) === parentId
      ? [p.consequence]
      : [],
  )
}

/** One industry's waiting edits and merges, in the approver's sentence. */
export function industryWaiting(proposals: ConfigProposal[], id: string): string | null {
  const said = proposals.flatMap((p) =>
    (p.change.kind === 'update' && p.change.list === 'INDUSTRY' && p.change.id === id) ||
    (p.change.kind === 'merge' && p.change.sourceId === id)
      ? [p.consequence]
      : [],
  )
  return said.length > 0 ? said.join(' · ') : null
}

export function freshnessWaiting(proposals: ConfigProposal[]): string | null {
  const said = proposals.flatMap((p) =>
    p.change.kind === 'activity-freshness' ? [p.consequence] : [],
  )
  return said.length > 0 ? said.join(' · ') : null
}

export function recareWaiting(proposals: ConfigProposal[]): string | null {
  const said = proposals.flatMap((p) => (p.change.kind === 'recare-cycles' ? [p.consequence] : []))
  return said.length > 0 ? said.join(' · ') : null
}

/** Sentences of the waiting changes to one motion's first-touch deadline. */
export function motionWaiting(proposals: ConfigProposal[], motion: LeadMotion): string[] {
  return proposals.flatMap((p) =>
    p.change.kind === 'motion' &&
    p.change.motion === motion &&
    p.change.patch.firstTouchMinutes !== undefined
      ? [p.consequence]
      : [],
  )
}

/** Changes counted per section rather than pinned to a row: a motion's name,
 *  switch, order or form (5.13, drawn by the lead-origins list), and the
 *  journey frame (5.14), whose payload the wire does not carry. */
export function motionPickerWaiting(proposals: ConfigProposal[]): number {
  return proposals.filter(
    ({ change: c }) =>
      c.kind === 'motion' && Object.keys(c.patch).some((k) => k !== 'firstTouchMinutes'),
  ).length
}

const FRAME_KINDS: readonly string[] = FRAME_CHANGE_KINDS

export function frameWaiting(proposals: ConfigProposal[]): number {
  return proposals.filter((p) => FRAME_KINDS.includes(p.change.kind)).length
}
