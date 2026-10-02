import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@pv/ui'
import type { DebriefView } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { dmhm } from '@/lib/date'
import { subjectKindLabel, summaryTextOf } from '@/data/comm-record-detail'
import { workstreamCommRecordsQuery } from '@/data/comm-records'
import { CommRecordRead } from './comm-record-bits'
import { CommTimelineTrack, type CommCardItem } from './comm-timeline'

/** The contact timeline of one workstream run — every comm of its lead, deals
 *  and contract on the shared axis, each card naming its object, the chosen
 *  one's read view underneath (ADR 0075, canvas `History`).
 *  With `onOpen` a card opens its own screen instead and no read view is drawn
 *  (ADR 0077 §6). No glass of its own: it draws inside a `.glass-b` card (law 8). */

const itemOf = (row: DebriefView): CommCardItem => ({
  id: row.id,
  channel: row.channel,
  state: row.state,
  late: row.late,
  createdAt: row.createdAt,
  title: summaryTextOf(row.summary),
  titleMuted: row.summary.state !== 'visible',
  meta: `${dmhm(row.createdAt)} · ${row.owner.name}`,
  subject: { code: row.subject.code, label: subjectKindLabel(row.subject.code) },
  step: row.step,
})

export function WorkstreamComms({
  workstreamCode,
  onOpen,
}: {
  workstreamCode: string
  onOpen?: (id: string) => void
}) {
  const canView = useCan('comm.view')
  const { data, isPending, error } = useQuery({
    ...workstreamCommRecordsQuery(workstreamCode),
    enabled: canView,
  })
  /* Sorted here because the axis IS the order and the contract promises none. */
  const rows = useMemo(
    () => [...(data?.rows ?? [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [data],
  )
  const [picked, setPicked] = useState<string | null>(null)
  const selected = rows.find((row) => row.id === picked) ?? rows.at(-1) ?? null

  if (!canView) {
    return (
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        Vai của bạn không có quyền xem các lượt liên hệ.
      </p>
    )
  }
  if (isPending) return <Skeleton className="h-40 w-full" />
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
        items={rows.map(itemOf)}
        selectedId={onOpen ? null : (selected?.id ?? null)}
        onSelect={onOpen ?? setPicked}
        caption={caption}
      />
      {!onOpen && selected && <CommRecordRead row={selected} as="panel" />}
    </div>
  )
}
