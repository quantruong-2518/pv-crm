import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@pv/ui'
import type { DebriefView } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { dmhm } from '@/lib/date'
import { meetingOverdue, subjectKindLabel, titleOf } from '@/data/comm-record-detail'
import { workstreamCommRecordsQuery } from '@/data/comm-records'
import { useMinuteClock } from '@/data/minute-clock'
import { CommRecordRead } from './comm-record-bits'
import { CommTimelineTrack, type CommCardItem } from './comm-timeline'

/** The contact timeline of one workstream run — every comm of its lead, deals
 *  and contract on the shared axis, each card naming its object, the chosen
 *  one's read view underneath (ADR 0075, canvas `History`). No glass of its own: it draws inside a `.glass-b` card (law 8). */

const itemOf = (row: DebriefView, now: number): CommCardItem => ({
  id: row.id,
  channel: row.channel,
  state: row.state,
  late: row.late,
  overdue: meetingOverdue(row, now),
  createdAt: row.createdAt,
  ...titleOf(row),
  /* A meeting's own hour is the time worth reading; the axis keeps the booking day. */
  meta: `${row.meeting ? `Họp ${dmhm(row.meeting.at)}` : dmhm(row.createdAt)} · ${row.owner.name}`,
  subject: { code: row.subject.code, label: subjectKindLabel(row.subject.code) },
  step: row.step,
})

export function WorkstreamComms({ workstreamCode }: { workstreamCode: string }) {
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
      <p className="text-warning m-0 text-[12.5px] leading-[1.6]">
        Không đọc được các lượt liên hệ.{' '}
        {isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'}
      </p>
    )
  }
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        Chưa có lượt liên hệ nào.
      </p>
    )
  }

  const waiting = rows.filter((row) => row.state === 'unconfirmed').length
  const empty = rows.filter((row) => row.state === 'empty').length
  /* A zero count says nothing the reader needs. */
  const caption = [
    `${rows.length} lượt liên hệ`,
    waiting > 0 && `${waiting} chưa xác nhận`,
    empty > 0 && `${empty} chưa điền nội dung`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CommTimelineTrack
        items={rows.map((row) => itemOf(row, now))}
        selectedId={selected?.id ?? null}
        onSelect={setPicked}
        caption={caption}
      />
      {selected && <CommRecordRead row={selected} as="panel" />}
    </div>
  )
}
