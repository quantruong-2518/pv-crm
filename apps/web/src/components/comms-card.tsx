import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@pv/ui'
import type { DebriefView } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { message, useI18n, type Message } from '@/app/i18n'
import { dmhm } from '@/lib/date'
import { meetingOverdue, subjectKindLabel, titleOf } from '@/data/comm-record-detail'
import { workstreamCommRecordsQuery } from '@/data/comm-records'
import { useMinuteClock } from '@/data/minute-clock'
import { CommRecordRead } from './comm-record-bits'
import { CommTimelineTrack, type CommCardItem } from './comm-timeline'

/** The contact timeline of one workstream run — every comm of its lead, deals
 *  and contract on the shared axis, each card naming its object, the chosen
 *  one's read view underneath (ADR 0075, canvas `History`). No glass of its own: it draws inside a `.glass-b` card (law 8). */

const itemOf = (row: DebriefView, now: number, t: (copy: Message) => string): CommCardItem => ({
  id: row.id,
  channel: row.channel,
  state: row.state,
  late: row.late,
  overdue: meetingOverdue(row, now),
  createdAt: row.createdAt,
  ...titleOf(row),
  /* A meeting's own hour is the time worth reading; the axis keeps the booking day. */
  meta: `${
    row.meeting
      ? t(
          message(
            `Họp ${dmhm(row.meeting.at)}`,
            `Meeting ${dmhm(row.meeting.at)}`,
            `회의 ${dmhm(row.meeting.at)}`,
          ),
        )
      : dmhm(row.createdAt)
  } · ${row.owner.name}`,
  subject: { code: row.subject.code, label: subjectKindLabel(row.subject.code) },
  step: row.step,
})

export function WorkstreamComms({ workstreamCode }: { workstreamCode: string }) {
  const { t } = useI18n()
  const { data, isPending, error } = useQuery(workstreamCommRecordsQuery(workstreamCode))
  const now = useMinuteClock()
  /* Sorted here because the axis IS the order and the contract promises none. */
  const rows = useMemo(
    () => [...(data?.rows ?? [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [data],
  )
  const [picked, setPicked] = useState<string | null>(null)
  const selected = rows.find((row) => row.id === picked) ?? rows.at(-1) ?? null

  if (isPending) return <Skeleton height={160} />
  if (error) {
    return (
      <p className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]">
        {t(
          message(
            'Không đọc được các lượt liên hệ.',
            'Could not read the contacts.',
            '연락 기록을 불러오지 못했습니다.',
          ),
        )}{' '}
        {isApiError(error)
          ? userMessage(error)
          : t(message('Thử lại.', 'Try again.', '다시 시도해 주세요.'))}
      </p>
    )
  }
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        {t(
          message(
            'Chưa có lượt liên hệ nào.',
            'No contacts logged yet.',
            '연락 기록이 아직 없습니다.',
          ),
        )}
      </p>
    )
  }

  const waiting = rows.filter((row) => row.state === 'unconfirmed').length
  const empty = rows.filter((row) => row.state === 'empty').length
  /* A zero count says nothing the reader needs. */
  const caption = [
    t(
      message(
        `${rows.length} lượt liên hệ`,
        `${rows.length} ${rows.length === 1 ? 'contact' : 'contacts'}`,
        `연락 ${rows.length}건`,
      ),
    ),
    waiting > 0 &&
      t(message(`${waiting} chưa xác nhận`, `${waiting} unconfirmed`, `미확인 ${waiting}건`)),
    empty > 0 &&
      t(message(`${empty} chưa điền nội dung`, `${empty} not filled in`, `미작성 ${empty}건`)),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CommTimelineTrack
        items={rows.map((row) => itemOf(row, now, t))}
        selectedId={selected?.id ?? null}
        onSelect={setPicked}
        caption={caption}
      />
      {selected && <CommRecordRead row={selected} />}
    </div>
  )
}
