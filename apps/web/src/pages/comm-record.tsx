import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@pv/ui'
import type { DebriefView } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { commRecordQuery } from '@/data/comm-record-detail'
import { RecordShell } from '@/components/record/record-shell'
import { CommFillWorkspace } from './comm-record-fill'
import { CommEditWorkspace } from './comm-record-edit'
import { CommReadView } from './comm-record-read'
import { ScheduledMeeting } from './comm-record-meeting'

/** One comm record — `/comms/:id` (ADR 0075), one column, no side rail.
 *
 *  Whoever may close an open comm gets the three-step fill form
 *  (`CommFillWorkspace`); once done, or for anybody else, it is the read view
 *  (`CommReadView`), which says whose it is while it is open — only the
 *  creator confirms (ADR 0075 §1 + 0074). The owner of a confirmed record may
 *  reopen the same form as an edit (`CommEditWorkspace`, ADR 0122). A booked
 *  meeting (`scheduled`, `cancelled`) has its own view, `ScheduledMeeting`.
 *
 *  The subject is fixed at creation, so it is printed, never picked. A record
 *  mints no object code, so the ContextRail carries the subject alone (law 10). */

export function CommRecordPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const { data: record, isPending, error } = useQuery(commRecordQuery(id))

  return (
    <AppShell {...chrome.shell}>
      {record ? (
        <RecordBody key={record.id} record={record} />
      ) : (
        <RecordShell
          pending={isPending}
          skeleton={{ strip: false, rail: false }}
          failure={{
            error,
            notFound: 'Không tìm thấy lượt liên hệ này.',
            fallback: 'Không mở được lượt liên hệ này.',
            back: { label: 'Quay lại', onClick: () => navigate(-1) },
          }}
        />
      )}
    </AppShell>
  )
}

export default CommRecordPage

/** Keyed by id so moving between records never carries one form's state into another. */
function RecordBody({ record }: { record: DebriefView }) {
  const [editing, setEditing] = useState(false)
  if (record.state === 'scheduled' || record.state === 'cancelled') {
    return <ScheduledMeeting record={record} />
  }
  if (record.closedAt === null && record.closableByMe) {
    return <CommFillWorkspace record={record} />
  }
  if (editing && record.editableByMe) {
    return <CommEditWorkspace record={record} onClose={() => setEditing(false)} />
  }
  return (
    <CommReadView
      record={record}
      onEdit={record.editableByMe ? () => setEditing(true) : undefined}
    />
  )
}
