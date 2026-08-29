import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, FileText, Handshake, Link, Plus, Trash2, X } from '@pv/ui'
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  GlassCard,
  Icon,
  Input,
  MetaPill,
  SectionTitle,
  Select,
  Skeleton,
  Textarea,
} from '@pv/ui'
import {
  MEETING_TITLE_MAX,
  TRANSCRIPT_MAX,
  type MeetingCreate,
  type MeetingRow,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { useDirectory } from '@/data/directory'
import { meetingsQuery, useAddMeeting, useDropMeeting } from '@/data/meetings'

/** Khối "Cuộc họp" của màn hồ sơ lead — mọi lần đã gặp khách này.
 *
 *  ------------------------------------------------------------------
 *  NẰM Ở CỘT CHÍNH, KHÔNG Ở CỘT PHỤ
 *  ------------------------------------------------------------------
 *  Cột phụ rộng 320px và đang chở năm thẻ tra cứu nhanh (nguồn · mail · việc
 *  tiếp · ghi chú · người phụ trách). Một buổi họp có tiêu đề, hai danh sách
 *  người và một transcript — nhồi vào 320px thì mỗi dòng xuống bốn hàng và
 *  không thẻ nào trong năm thẻ kia còn đọc được.
 *
 *  ------------------------------------------------------------------
 *  NHÃN "LẦN GẶP ĐẦU" KHÔNG PHẢI MỘT CÔNG TẮC
 *  ------------------------------------------------------------------
 *  `isFirst` do máy chủ tính: buổi SỚM NHẤT của lead. Màn chỉ vẽ lại thành một
 *  nhãn. Không có nút bật/tắt nào ở đây, và đó là quyết định đã chốt chứ không
 *  phải tính năng còn thiếu — một cờ người bấm cộng một danh sách buổi họp là
 *  hai nguồn cho một sự thật, và ngày chúng lệch nhau thì thẻ điểm Sổ lead nói
 *  một con số không ai truy được về dòng nào.
 *
 *  Hệ quả nhìn thấy được: ghi bù một buổi CŨ HƠN buổi đang mang nhãn thì nhãn
 *  chuyển. Vì thế mọi lượt ghi vứt nguyên danh sách và đọc lại thay vì vá
 *  một dòng — xem `data/meetings.ts`.
 *
 *  ------------------------------------------------------------------
 *  TRANSCRIPT MỞ Ở DRAWER, KHÔNG TRẢI TRONG THẺ
 *  ------------------------------------------------------------------
 *  Một transcript là hàng nghìn chữ. Trải nó ra trong danh sách thì buổi họp
 *  thứ hai bị đẩy khỏi màn, và câu hỏi thường gặp nhất của thẻ này — "gặp mấy
 *  lần rồi, gần nhất khi nào" — cần đúng cái danh sách vừa bị đẩy đi. */
export function MeetingsCard({ code, canEdit }: { code: string; canEdit: boolean }) {
  const { data, isPending } = useQuery(meetingsQuery(code))
  const [recording, setRecording] = useState(false)
  const [reading, setReading] = useState<MeetingRow | null>(null)

  const rows = data?.rows ?? []

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5" aria-label="Cuộc họp với lead">
      <SectionTitle
        size="detail"
        actions={
          canEdit ? (
            <Button size="sm" variant="secondary" onClick={() => setRecording(true)}>
              <Icon icon={Plus} size={16} />
              Thêm lịch họp
            </Button>
          ) : undefined
        }
      >
        Họp {rows.length > 0 && `(${rows.length})`}
      </SectionTitle>

      {isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          message="Chưa có lịch họp với khách này."
          /* `action` là BẮT BUỘC ở `EmptyState` (M-08: luôn 1 icon + 1 câu + 1
             nút). Người chỉ có quyền xem vẫn thấy nút, nhưng nó không làm gì —
             `onClick` vắng mặt. Đó là hình dạng component cho phép, và nó thành
             thật hơn một nút mở ra biểu mẫu chắc chắn trả 403. */
          action={
            canEdit
              ? { label: 'Thêm lịch họp đầu tiên', onClick: () => setRecording(true) }
              : { label: 'Cần quyền sửa lead để thêm lịch' }
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
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

      <RecordMeetingDrawer
        code={code}
        open={recording}
        onClose={() => setRecording(false)}
        firstOne={rows.length === 0}
      />

      <Drawer
        open={reading !== null}
        onClose={() => setReading(null)}
        title={reading?.title ?? ''}
        subtitle={reading ? `${dt(reading.at)} · ghi bởi ${reading.by}` : undefined}
        width="lg"
      >
        {/* `whitespace-pre-wrap`: transcript giữ nguyên xuống dòng của người
            dán vào. Bỏ nó đi thì cả buổi họp thành một khối chữ liền. */}
        <p className="text-fg-1 whitespace-pre-wrap text-sm leading-relaxed">
          {reading?.transcript}
        </p>
      </Drawer>
    </GlassCard>
  )
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
    <li className="flex flex-col gap-3 rounded-md bg-white/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <MetaPill mono>{dt(row.at)}</MetaPill>
        {row.isFirst && (
          <Badge tone="success">
            <Icon icon={Handshake} size={14} />
            Lần gặp đầu
          </Badge>
        )}
      </div>

      <p className="text-fg-1 text-[13.5px] font-semibold leading-[1.5]">{row.title}</p>

      <div className="grid gap-2 text-[12.5px] leading-[1.55]">
        <p className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
          <span className="text-muted-foreground">Chủ trì</span>
          <span className="text-fg-1">{names(row.hosts)}</span>
        </p>
        {row.guests.length > 0 && (
          <p className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
            <span className="text-muted-foreground">Khách mời</span>
            <span className="text-fg-1">{names(row.guests)}</span>
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
            className="text-accent-foreground inline-flex items-center gap-1 text-xs font-medium"
          >
            <Icon icon={Link} size={14} />
            Mở link họp
          </a>
        )}
        {row.transcript && (
          <button
            type="button"
            onClick={onRead}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
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
            className="text-muted-foreground hover:text-danger ml-auto inline-flex items-center gap-1 text-xs"
          >
            <Icon icon={Trash2} size={14} />
            Xoá
          </button>
        )}
      </div>
    </li>
  )
}

/** Ghi một buổi vừa họp xong.
 *
 *  Chủ trì CHỌN từ sổ người, khách GÕ TAY — bất đối xứng có lý do và nó là hình
 *  dạng của dữ liệu hôm nay chứ không phải sở thích: `platform.actor` là sổ
 *  nhân sự thật, còn phía khách chưa có bảng nào (`LeadContact` vẫn sinh ra từ
 *  fixture đóng băng). Máy chủ ép đúng luật này bằng
 *  `meeting_attendee_host_co_actor`. */
function RecordMeetingDrawer({
  code,
  open,
  onClose,
  firstOne,
}: {
  code: string
  open: boolean
  onClose: () => void
  firstOne: boolean
}) {
  const people = useDirectory()
  const add = useAddMeeting()

  const [at, setAt] = useState('')
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const [transcript, setTranscript] = useState('')
  const [hostIds, setHostIds] = useState<string[]>([])
  const [guests, setGuests] = useState<{ name: string; role: string }[]>([])
  const [failure, setFailure] = useState('')

  /* Mở lại là một lần ghi mới. Đặt lại HẾT — một Drawer mở lại còn giữ
     transcript của buổi trước là một cú bấm cách chỗ ghi nhầm nội dung buổi cũ
     sang buổi mới. `at` mồi bằng lúc này vì phần lớn người ta ghi ngay sau khi
     họp xong; sửa được. */
  useEffect(() => {
    if (!open) return
    setAt(nowLocal())
    setTitle('')
    setLink('')
    setTranscript('')
    setHostIds([])
    setGuests([])
    setFailure('')
  }, [open])

  const peopleOptions = useMemo(() => people.map((p) => ({ value: p.id, label: p.name })), [people])

  /* Bốn cách chưa ghi được, mỗi cách một câu. Gộp thành một `disabled` trần thì
     người dùng thấy nút xám mà không biết phải sửa gì. */
  const blocker: string | null = !at
    ? 'Chưa chọn thời điểm họp.'
    : !title.trim()
      ? 'Buổi họp cần một tiêu đề — "Kickoff", "Demo sản phẩm".'
      : hostIds.length === 0
        ? 'Chọn ít nhất một người chủ trì từ sổ nhân sự.'
        : guests.some((g) => !g.name.trim())
          ? 'Có dòng khách chưa điền tên.'
          : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (blocker || add.isPending) return
    setFailure('')

    const body: MeetingCreate = {
      /* `datetime-local` trả chuỗi KHÔNG có múi giờ ("2026-08-29T14:30").
         `Moc` của hợp đồng đòi ISO 8601 CÓ múi, nên `new Date(...)` diễn giải
         nó theo múi của máy rồi `toISOString()` đóng dấu — đúng thứ người gõ
         vừa nhìn thấy trên đồng hồ của họ. */
      at: new Date(at).toISOString(),
      title: title.trim(),
      ...(link.trim() ? { link: link.trim() } : {}),
      ...(transcript.trim() ? { transcript: transcript.trim() } : {}),
      hosts: hostIds.map((id) => ({
        actorId: id,
        name: people.find((p) => p.id === id)?.name ?? id,
      })),
      guests: guests
        .filter((g) => g.name.trim())
        .map((g) => ({ name: g.name.trim(), ...(g.role.trim() ? { role: g.role.trim() } : {}) })),
    }

    add.mutate(
      { code, body },
      {
        onSuccess: (row) => {
          toast(row.isFirst ? 'Đã thêm lịch họp — đây là lần gặp đầu' : 'Đã thêm lịch họp', {
            tone: 'success',
            ...(row.isFirst
              ? { detail: 'Dòng thời gian của lead có thêm một mốc "gặp lần đầu".' }
              : {}),
          })
          onClose()
        },
        onError: (error) =>
          setFailure(
            isApiError(error) ? userMessage(error) : 'Không thêm được lịch họp. Vui lòng thử lại.',
          ),
      },
    )
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Thêm lịch họp"
      subtitle={
        firstOne
          ? 'Lịch đầu tiên sẽ được đánh dấu là lần gặp đầu.'
          : 'Chọn đúng thời gian cuộc họp đã hoặc sẽ diễn ra.'
      }
      width="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-xs">{blocker ?? failure}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button type="submit" form="ghi-buoi-hop" disabled={Boolean(blocker) || add.isPending}>
              {add.isPending ? 'Đang thêm…' : 'Thêm lịch họp'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="ghi-buoi-hop" onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Thời gian</span>
          <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Tiêu đề</span>
          <Input
            value={title}
            maxLength={MEETING_TITLE_MAX}
            placeholder="Kickoff · Demo sản phẩm · Chốt phương án"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Link họp (không bắt buộc)</span>
          <Input
            value={link}
            placeholder="https://meet.google.com/…"
            onChange={(e) => setLink(e.target.value)}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Chủ trì — chọn từ sổ nhân sự</span>
          <Select
            label="Thêm người chủ trì"
            value=""
            options={[
              { value: '', label: 'Thêm người…' },
              ...peopleOptions.filter((o) => !hostIds.includes(o.value)),
            ]}
            onChange={(value) => value && setHostIds((cur) => [...cur, value])}
          />
          <div className="flex flex-wrap gap-2">
            {hostIds.map((id) => (
              <Badge key={id} tone="draft">
                {people.find((p) => p.id === id)?.name ?? id}
                <button
                  type="button"
                  aria-label="Bỏ người chủ trì"
                  onClick={() => setHostIds((cur) => cur.filter((x) => x !== id))}
                >
                  <Icon icon={X} size={14} />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Khách — gõ tên và chức danh</span>
          {guests.map((g, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={g.name}
                placeholder="Tên khách"
                onChange={(e) =>
                  setGuests((cur) =>
                    cur.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)),
                  )
                }
              />
              <Input
                value={g.role}
                placeholder="Chức danh"
                onChange={(e) =>
                  setGuests((cur) =>
                    cur.map((x, j) => (i === j ? { ...x, role: e.target.value } : x)),
                  )
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setGuests((cur) => cur.filter((_, j) => j !== i))}
              >
                <Icon icon={X} size={14} />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setGuests((cur) => [...cur, { name: '', role: '' }])}
          >
            <Icon icon={Plus} size={14} />
            Thêm khách
          </Button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">
            Transcript (không bắt buộc) — dán nguyên bản ghi
          </span>
          <Textarea
            value={transcript}
            rows={8}
            maxLength={TRANSCRIPT_MAX}
            onChange={(e) => setTranscript(e.target.value)}
          />
        </label>
      </form>
    </Drawer>
  )
}

const names = (people: readonly { name: string; role?: string }[]): string =>
  people.map((p) => (p.role ? `${p.name} (${p.role})` : p.name)).join(', ')

/** Mốc trên dây là ISO có múi; màn in theo giờ máy của người đọc. */
const dt = (iso: string): string =>
  new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/** Giá trị mồi cho `<input type="datetime-local">`, đúng định dạng nó đòi
 *  (`YYYY-MM-DDTHH:mm`) và theo giờ ĐỊA PHƯƠNG — `toISOString()` ở đây sẽ mồi
 *  giờ UTC và người dùng thấy sai vài tiếng. */
function nowLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
