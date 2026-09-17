import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Handshake, Link, Target, Trash2 } from '@pv/ui'
import { Badge, Button, Drawer, Icon, MetaPill, Skeleton } from '@pv/ui'
import type { MeetingRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { MeetingScheduleDrawer } from '@/components/meeting-schedule-drawer'
import { MEETING_MODE_LABEL, meetingRowLabel } from '@/data/meeting-labels'
import { meetingsQuery, useDropMeeting } from '@/data/meetings'

/** The "Sắp tới" block of the activity card — the next meeting with this
 *  customer.
 *
 *  NO GLASS OF ITS OWN: it is drawn inside the activity card next to the
 *  timeline, and a glass surface inside a glass surface is the fifth background
 *  layer (law 12).
 *
 *  ONE meeting, not the list: the question here is "who am I meeting next, and
 *  when", and a full list pushes the timeline off the screen. The rest opens in
 *  place rather than behind another door.
 *
 *  The "first meeting" badge is computed by the server (`isFirst`, the EARLIEST
 *  meeting of the lead) and only redrawn here — no switch. A hand-set flag plus
 *  a list of meetings is two sources for one truth.
 *
 *  A transcript opens in a drawer because a transcript is thousands of words. */
export function MeetingsPanel({
  code,
  canEdit,
  /** Bumped from outside to open the record-meeting door: both buttons that
   *  ask for it — the card head and the toolbar — live outside this block. */
  openSchedule = 0,
}: {
  code: string
  canEdit: boolean
  openSchedule?: number
}) {
  const { data, isPending } = useQuery(meetingsQuery(code))
  const [recording, setRecording] = useState(false)
  const [reading, setReading] = useState<MeetingRow | null>(null)
  const [expanded, setExpanded] = useState(false)

  const rows = data?.rows ?? []
  const next = upcomingOf(rows)
  const shown = expanded ? rows : next ? [next] : []

  /* `0` is the opening value, so this does not open the door on first paint. A
     counter rather than a boolean: a second press must reopen a door just
     closed — the same reason `TouchFocus` carries `seq`. */
  useEffect(() => {
    if (openSchedule > 0 && canEdit) setRecording(true)
  }, [openSchedule, canEdit])

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Lịch họp sắp tới">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-baseline gap-2">
          <span className="text-[12.5px] font-semibold">Sắp tới</span>
          <span className="text-muted-foreground text-[11px]">giờ Việt Nam</span>
        </span>
        {rows.length > (next ? 1 : 0) && (
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? 'Thu gọn' : `Xem tất cả ${rows.length} buổi`}
          </Button>
        )}
      </div>

      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
          {rows.length === 0
            ? 'Chưa có lịch họp với khách này.'
            : 'Không còn buổi nào sắp tới — mở danh sách để xem các buổi đã gặp.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((row) => (
            <MeetingLine
              key={row.id}
              code={code}
              row={row}
              canEdit={canEdit}
              onRead={() => setReading(row)}
            />
          ))}
        </ul>
      )}

      {/* Same permission the delete button asks for. Opening a whole booking
          form for somebody who cannot write ends at a 403 on the save. */}
      {canEdit && (
        <MeetingScheduleDrawer code={code} open={recording} onClose={() => setRecording(false)} />
      )}

      <Drawer
        open={reading !== null}
        onClose={() => setReading(null)}
        title={reading?.title ?? ''}
        subtitle={
          reading
            ? `${meetingRowLabel(reading.at, reading.durationMinutes)} · ghi bởi ${reading.by}`
            : undefined
        }
        width="lg"
      >
        {/* `whitespace-pre-wrap`: transcript giữ nguyên xuống dòng của người
            dán vào. Bỏ nó đi thì cả buổi họp thành một khối chữ liền. */}
        <p className="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
          {reading?.transcript}
        </p>
      </Drawer>
    </section>
  )
}

/** The EARLIEST meeting still ahead. The server answers with the whole list in
 *  its own order, so "next" is chosen here rather than taken off the top: the
 *  first row of a newest-first list is the meeting that just ended. */
function upcomingOf(rows: readonly MeetingRow[]): MeetingRow | undefined {
  const now = Date.now()
  let best: MeetingRow | undefined
  let bestAt = Infinity
  for (const row of rows) {
    const at = Date.parse(row.at)
    if (!Number.isFinite(at) || at < now || at >= bestAt) continue
    best = row
    bestAt = at
  }
  return best
}

/** Một lịch họp: thời gian → nội dung → người tham gia → thao tác. */
function MeetingLine({
  code,
  row,
  canEdit,
  onRead,
}: {
  code: string
  row: MeetingRow
  canEdit: boolean
  onRead: () => void
}) {
  const drop = useDropMeeting()

  return (
    <li className="bg-surface-ink/5 flex flex-col gap-3 rounded-md p-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* The range, not just the start — and only when the row carries a
            length. Rows written before migration 0050 have none, and printing
            a made-up end (or "0 phút") would be a claim about a real meeting. */}
        <MetaPill mono>{meetingRowLabel(row.at, row.durationMinutes)}</MetaPill>
        {row.mode && <MetaPill>{MEETING_MODE_LABEL[row.mode]}</MetaPill>}
        {row.isFirst && (
          <Badge tone="success">
            <Icon icon={Handshake} size={14} />
            Lần gặp đầu
          </Badge>
        )}
      </div>

      <p className="text-foreground text-[13.5px] font-semibold leading-[1.5]">{row.title}</p>

      {row.goal && (
        <p className="text-glass-foreground m-0 flex min-w-0 items-start gap-2 text-[12px] leading-[1.55]">
          <Icon icon={Target} size={14} className="mt-1 shrink-0" />
          <span className="min-w-0">{row.goal}</span>
        </p>
      )}

      <div className="grid gap-2 text-[12.5px] leading-[1.55]">
        <p className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
          <span className="text-muted-foreground">Chủ trì</span>
          <span className="text-foreground">{names(row.hosts)}</span>
        </p>
        {row.guests.length > 0 && (
          <p className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
            <span className="text-muted-foreground">Khách mời</span>
            <span className="text-foreground">{names(row.guests)}</span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
        {row.link && (
          /* `rel="noreferrer"`: link do người dùng dán vào, và một tab mở bằng
             `target="_blank"` không có thuộc tính này thì trang đích với được
             vào `window.opener`. */
          <a
            href={row.link}
            target="_blank"
            rel="noreferrer"
            className="text-accent-foreground pointer-coarse:min-h-12 inline-flex items-center gap-1 rounded-sm px-2 py-2 text-xs font-medium"
          >
            <Icon icon={Link} size={14} />
            Mở link họp
          </a>
        )}
        {row.transcript && (
          <button
            type="button"
            onClick={onRead}
            className="text-muted-foreground hover:text-foreground pointer-coarse:min-h-12 inline-flex items-center gap-1 rounded-sm px-2 py-2 text-xs font-medium"
          >
            <Icon icon={FileText} size={14} />
            Xem transcript
          </button>
        )}
        {canEdit && Number.isFinite(Date.parse(row.at)) && Date.parse(row.at) > Date.now() && (
          <button
            type="button"
            aria-label={`Xoá lịch họp ${row.title}`}
            disabled={drop.isPending}
            onClick={() => {
              /* Không `confirm()`: một dialog của trình duyệt CHẶN mọi sự kiện
                 và làm treo cả phiên tự động hoá. Xoá một buổi họp là việc nhỏ
                 và ghi lại được, nên nút chịu trách nhiệm bằng cách nói rõ nó
                 làm gì, không bằng một câu hỏi lại. */
              drop.mutate(
                { code, id: row.id },
                {
                  onSuccess: () => toast('Đã xoá buổi họp', { tone: 'success' }),
                  onError: (error) =>
                    toast(isApiError(error) ? userMessage(error) : 'Không xoá được buổi họp', {
                      tone: 'danger',
                    }),
                },
              )
            }}
            className="text-muted-foreground hover:text-destructive-foreground pointer-coarse:min-h-12 ml-auto inline-flex items-center gap-1 rounded-sm px-2 py-2 text-xs"
          >
            <Icon icon={Trash2} size={14} />
            Xoá
          </button>
        )}
      </div>
    </li>
  )
}

const names = (people: readonly { name: string; role?: string }[]): string =>
  people.map((p) => (p.role ? `${p.name} (${p.role})` : p.name)).join(', ')
