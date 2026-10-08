import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link as RouteLink } from 'react-router-dom'
import {
  CalendarCheck,
  CalendarClock,
  FileText,
  Handshake,
  Link,
  MessageSquare,
  Target,
  Trash2,
} from '@pv/ui'
import {
  Badge,
  Button,
  Drawer,
  GlassCard,
  Icon,
  MetaPill,
  SectionTitle,
  Skeleton,
  cn,
} from '@pv/ui'
import type { DebriefView, MeetingRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toast } from '@/app/toast'
import { CommOverdueMark } from '@/components/comm-bits'
import { COMM_CARD_SURFACE, meetingOverdue } from '@/data/comm-record-detail'
import { commRecordPath, subjectCommIndexQuery } from '@/data/comm-records'
import { MeetingScheduleDrawer } from '@/components/meeting-schedule-drawer'
import { MEETING_MODE_LABEL, meetingRowLabel } from '@/data/meeting-labels'
import { meetingsQuery, useDropMeeting, type MeetingSubject } from '@/data/meetings'
import { useMinuteClock } from '@/data/minute-clock'

/** The meetings card of a lead or a deal profile — the body's working card.
 *  One booking button, shown only to a reader who may book (`*.edit`, scoped).
 *  Holds a list, so `.glass-b` (law 8). */
export function MeetingsCard({ subject, canEdit }: { subject: MeetingSubject; canEdit: boolean }) {
  /* A counter, not a flag: a second press must reopen a door just closed. */
  const [asked, setAsked] = useState(0)

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Lịch gặp">
      <SectionTitle
        size="detail"
        actions={
          canEdit && (
            <Button
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12"
              onClick={() => setAsked((n) => n + 1)}
            >
              <Icon icon={CalendarClock} size={16} />
              Đặt lịch
            </Button>
          )
        }
      >
        Lịch gặp
      </SectionTitle>
      <MeetingsPanel subject={subject} canEdit={canEdit} openSchedule={asked} />
    </GlassCard>
  )
}

/** The "Sắp tới" block of the activity card — the next meeting with this
 *  customer.
 *
 *  NO GLASS OF ITS OWN: it is drawn inside the activity card next to the
 *  timeline, and a panel inside a panel stacks a surface the flat system has
 *  no place for.
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
  subject,
  canEdit,
  /** Bumped from outside to open the record-meeting door: both buttons that
   *  ask for it — the card head and the toolbar — live outside this block. */
  openSchedule = 0,
}: {
  subject: MeetingSubject
  canEdit: boolean
  openSchedule?: number
}) {
  const { data, isPending } = useQuery(meetingsQuery(subject))
  const [recording, setRecording] = useState(false)
  const [reading, setReading] = useState<MeetingRow | null>(null)
  const [expanded, setExpanded] = useState(false)
  const records = useMeetingRecords(subject.code)
  const now = useMinuteClock()

  const rows = data?.rows ?? []
  const next = upcomingOf(rows, now)
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
              subject={subject}
              row={row}
              canEdit={canEdit}
              record={records.get(row.id)}
              now={now}
              onRead={() => setReading(row)}
            />
          ))}
        </ul>
      )}

      {/* Same permission the delete button asks for. Opening a whole booking
          form for somebody who cannot write ends at a 403 on the save. */}
      {canEdit && (
        <MeetingScheduleDrawer
          subject={subject}
          open={recording}
          onClose={() => setRecording(false)}
        />
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

/** The EARLIEST meeting not yet over and not closed out — an in-progress one
 *  counts, the same cut as `GET /sales/meetings/today` (no length = over at its
 *  start), so this card and the countdown bar agree. The server answers in its
 *  own order, so "next" is chosen here rather than taken off the top. */
function upcomingOf(rows: readonly MeetingRow[], now: number): MeetingRow | undefined {
  let best: MeetingRow | undefined
  let bestAt = Infinity
  for (const row of rows) {
    const at = Date.parse(row.at)
    const ends = at + (row.durationMinutes ?? 0) * 60_000
    if (row.heldAt !== null || !Number.isFinite(at) || ends <= now || at >= bestAt) continue
    best = row
    bestAt = at
  }
  return best
}

/** Một lịch họp: thời gian → nội dung → người tham gia → thao tác. */
function MeetingLine({
  subject,
  row,
  canEdit,
  record,
  now,
  onRead,
}: {
  subject: MeetingSubject
  row: MeetingRow
  canEdit: boolean
  /** The comm record the booking opened; absent on rows booked before it did. */
  record?: DebriefView
  /** The shared minute clock, so the overdue mark turns over without a reload. */
  now: number
  onRead: () => void
}) {
  const recordId = record?.id
  const drop = useDropMeeting()
  /* The record's closer fence (owner or an outranking superior) gates delete too;
     a row with no record falls back to the subject's edit right alone. */
  const droppable = canEdit && (record ? record.closableByMe : true) && Date.parse(row.at) > now

  return (
    <li className={cn('flex flex-col gap-3 rounded-md p-3', COMM_CARD_SURFACE)}>
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
        {row.heldAt !== null && <Badge tone="success">Đã họp</Badge>}
        {record && <CommOverdueMark overdue={meetingOverdue(record, now)} />}
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
        {row.eventUrl && (
          <a
            href={row.eventUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-foreground pointer-coarse:min-h-12 inline-flex items-center gap-1 rounded-sm px-2 py-2 text-xs font-medium"
          >
            <Icon icon={CalendarCheck} size={14} />
            Mở trên Google Calendar
          </a>
        )}
        {recordId && (
          <RouteLink
            to={commRecordPath(recordId)}
            className="text-accent-foreground pointer-coarse:min-h-12 inline-flex items-center gap-1 rounded-sm px-2 py-2 text-xs font-medium"
          >
            <Icon icon={MessageSquare} size={14} />
            Mở lượt liên hệ
          </RouteLink>
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
        {droppable && (
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
                { subject, id: row.id },
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

/** Meeting id → its comm record. The record names its meeting
 *  (`DebriefView.meeting`), read from the list without summaries (no audit). */
function useMeetingRecords(code: string): ReadonlyMap<string, DebriefView> {
  const canView = useCan('comm.view')
  const records = useQuery({ ...subjectCommIndexQuery(code), enabled: canView })

  return useMemo(() => {
    const out = new Map<string, DebriefView>()
    for (const r of records.data?.rows ?? []) if (r.meeting) out.set(r.meeting.id, r)
    return out
  }, [records.data])
}
