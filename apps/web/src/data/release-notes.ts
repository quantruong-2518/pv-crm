/** What changed in each release, written by hand and read in the what's-new
 *  drawer (`components/release-notes-drawer.tsx`).
 *
 *  Newest first. Add an entry in the same commit that ships a change a user can
 *  see; internal work (refactors, tests, tooling) does not go here. Keep the
 *  list to the last ~10 releases: it is an answer to "what is new", not a
 *  history. `module` and `feature` are the labels the screen already shows.
 *  Copy rules: `docs/design-system/ui-copy.md`. */

import { message, type Message } from '@/app/i18n'

export type ReleaseNoteKind = 'new' | 'change' | 'fix'

export const RELEASE_NOTE_KIND_LABEL: Record<ReleaseNoteKind, Message> = {
  new: message('Mới', 'New', '신규'),
  change: message('Đổi', 'Changed', '변경'),
  fix: message('Sửa lỗi', 'Fix', '오류 수정'),
}

export type ReleaseNoteItem = {
  /** The nav book or settings area, as named in the header. */
  module: Message
  /** The function inside it, as named on the screen. */
  feature: Message
  kind: ReleaseNoteKind
  /** One short sentence: what the user can do now. */
  text: Message
}

export type ReleaseNote = {
  /** Unique and sortable; what the browser remembers as "seen". */
  id: string
  /** `dd/mm/yyyy`, the Vietnamese form; the drawer prints `id` in the reader's format. */
  date: string
  items: readonly ReleaseNoteItem[]
}

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    id: '2026-10-25',
    date: '25/10/2026',
    items: [
      {
        module: message('Hợp đồng', 'Contracts', '계약'),
        feature: message('Tiền phạt', 'Penalties', '위약금'),
        kind: 'new',
        text: message(
          'Ghi tiền phạt khi chấm dứt hợp đồng, khách hoặc công ty trả, kèm ngày tiền về hoặc đã chi.',
          'Record the penalty when a contract is terminated, whether the customer or the company pays, with the date the money arrived or was paid out.',
          '계약을 해지할 때 위약금을 기록합니다. 고객이나 회사 중 누가 지불하든 입금일 또는 지급일과 함께 남깁니다.',
        ),
      },
      {
        module: message('Hợp đồng', 'Contracts', '계약'),
        feature: message('Sổ hợp đồng', 'Contract book', '계약 목록'),
        kind: 'new',
        text: message(
          'Đầu sổ có ô tổng hợp số hợp đồng đã chấm dứt và tiền phạt; bấm vào để xem các hợp đồng đó.',
          'The top of the book now has a summary tile for terminated contracts and penalties; click it to see those contracts.',
          '목록 상단에 해지된 계약 수와 위약금을 요약한 칸이 생겼습니다. 누르면 해당 계약을 볼 수 있습니다.',
        ),
      },
      {
        module: message('Lead', 'Leads', '리드'),
        feature: message('Lịch gặp', 'Meetings', '미팅 일정'),
        kind: 'new',
        text: message(
          'Dời lịch ngay trên thẻ lịch, không phải mở lượt liên hệ.',
          'Reschedule right on the meeting card without opening the contact.',
          '연락 기록을 열지 않고 일정 카드에서 바로 일정을 옮깁니다.',
        ),
      },
      {
        module: message('Lead', 'Leads', '리드'),
        feature: message('Lịch gặp', 'Meetings', '미팅 일정'),
        kind: 'new',
        text: message(
          'Xoá lịch ngay trong màn Dời lịch họp, với buổi chưa diễn ra.',
          'Delete a meeting right in the Reschedule screen, for meetings that have not happened yet.',
          '아직 진행되지 않은 미팅은 미팅 일정 변경 화면에서 바로 삭제할 수 있습니다.',
        ),
      },
    ],
  },
  {
    id: '2026-10-23',
    date: '23/10/2026',
    items: [
      {
        module: message('Cài đặt', 'Settings', '설정'),
        feature: message('Phòng ban & nhóm', 'Departments & teams', '부서 및 팀'),
        kind: 'change',
        text: message(
          'Cây đơn vị Công ty → Phòng → Nhóm, xem theo từng tháng.',
          'Unit tree Company → Department → Team, viewable month by month.',
          '회사 → 부서 → 팀 순서의 조직 트리를 월별로 볼 수 있습니다.',
        ),
      },
      {
        module: message('Cài đặt', 'Settings', '설정'),
        feature: message('Phòng ban & nhóm', 'Departments & teams', '부서 및 팀'),
        kind: 'change',
        text: message(
          'Xoá một đơn vị trống sẽ hỏi lại trước khi xoá.',
          'Deleting an empty unit now asks for confirmation first.',
          '비어 있는 조직을 삭제하기 전에 확인을 한 번 더 묻습니다.',
        ),
      },
      {
        module: message('Lead', 'Leads', '리드'),
        feature: message('Lượt liên hệ', 'Contacts', '연락 기록'),
        kind: 'new',
        text: message(
          'Sửa lại lượt liên hệ đã chốt: tiêu đề, ghi chú, đánh giá, file và việc tiếp theo.',
          'Edit a contact that was already confirmed: title, note, rating, files and next task.',
          '확정한 연락 기록을 수정할 수 있습니다. 제목, 메모, 평가, 파일, 다음 업무가 대상입니다.',
        ),
      },
    ],
  },
]

/** How many releases the reader has not opened yet; all of them when nothing is remembered. */
export function unseenReleases(seenId: string | null): number {
  const at = RELEASE_NOTES.findIndex((note) => note.id === seenId)
  return at === -1 ? RELEASE_NOTES.length : at
}
