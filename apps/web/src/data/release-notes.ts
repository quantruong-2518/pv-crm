/** What changed in each release, written by hand and read in the what's-new
 *  drawer (`components/release-notes-drawer.tsx`).
 *
 *  Newest first. Add an entry in the same commit that ships a change a user can
 *  see; internal work (refactors, tests, tooling) does not go here. Keep the
 *  list to the last ~10 releases: it is an answer to "what is new", not a
 *  history. `module` and `feature` are the labels the screen already shows.
 *  Copy rules: `docs/design-system/ui-copy.md`. */

export type ReleaseNoteKind = 'new' | 'change' | 'fix'

export const RELEASE_NOTE_KIND_LABEL: Record<ReleaseNoteKind, string> = {
  new: 'Mới',
  change: 'Đổi',
  fix: 'Sửa lỗi',
}

export type ReleaseNoteItem = {
  /** The nav book or settings area, as named in the header. */
  module: string
  /** The function inside it, as named on the screen. */
  feature: string
  kind: ReleaseNoteKind
  /** One short sentence: what the user can do now. */
  text: string
}

export type ReleaseNote = {
  /** Unique and sortable; what the browser remembers as "seen". */
  id: string
  /** `dd/mm/yyyy`, printed as is. */
  date: string
  items: readonly ReleaseNoteItem[]
}

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    id: '2026-10-25',
    date: '25/10/2026',
    items: [
      {
        module: 'Lead',
        feature: 'Lịch gặp',
        kind: 'new',
        text: 'Dời lịch ngay trên thẻ lịch, không phải mở lượt liên hệ.',
      },
      {
        module: 'Lead',
        feature: 'Lịch gặp',
        kind: 'new',
        text: 'Xoá lịch ngay trong màn Dời lịch họp, với buổi chưa diễn ra.',
      },
    ],
  },
  {
    id: '2026-10-23',
    date: '23/10/2026',
    items: [
      {
        module: 'Cài đặt',
        feature: 'Phòng ban & nhóm',
        kind: 'change',
        text: 'Cây đơn vị Công ty → Phòng → Nhóm, xem theo từng tháng.',
      },
      {
        module: 'Cài đặt',
        feature: 'Phòng ban & nhóm',
        kind: 'change',
        text: 'Xoá một đơn vị trống sẽ hỏi lại trước khi xoá.',
      },
      {
        module: 'Lead',
        feature: 'Lượt liên hệ',
        kind: 'new',
        text: 'Sửa lại lượt liên hệ đã chốt: tiêu đề, ghi chú, đánh giá, file và việc tiếp theo.',
      },
    ],
  },
]

/** How many releases the reader has not opened yet; all of them when nothing is remembered. */
export function unseenReleases(seenId: string | null): number {
  const at = RELEASE_NOTES.findIndex((note) => note.id === seenId)
  return at === -1 ? RELEASE_NOTES.length : at
}
