import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Check, Lock, MessageSquare, Plus, Timer, UserPlus } from '@pv/ui'
import {
  Badge,
  Button,
  ChannelTag,
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
  Timeline,
  type IconGlyph,
} from '@pv/ui'
import {
  MESSAGE_BODY_MAX,
  THREAD_SUBJECT_MAX,
  type CommsChannel,
  type IdentityRow,
  type MessageCreate,
  type MessageDirection,
  type MessageRow,
  type ThreadRow,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toast } from '@/app/toast'
import { dmhm, localSlot } from '@/lib/date'
import {
  COMMS_CHANNELS,
  COMMS_CHANNEL_ICON,
  COMMS_CHANNEL_LABEL,
  identitySearchQuery,
  objectThreadsQuery,
  threadMessagesQuery,
  useCaptureMessage,
} from '@/data/comms'

/** The conversation book of one object — what was actually SAID, as opposed to
 *  what happened to the record.
 *
 *  ------------------------------------------------------------------
 *  A CARD BESIDE `ActivityCard`, NOT ONE MERGED TIMELINE
 *  ------------------------------------------------------------------
 *  §3.3 of `docs/tam-nhin-giao-tiep-va-noi-dung.md` says the books stay
 *  separate and the SCREEN merges the two streams when it draws. This screen
 *  merges them by standing them next to each other, in one column, in reading
 *  order — and that is a decision with a reason, not a shortcut.
 *
 *  A `sales.touch` row is a POINT: the lead entered the book, changed hands,
 *  moved a column, got signed. A thread is an INTERVAL with turns inside it —
 *  it has a start, a last, and a count of how many times the two sides went
 *  back and forth. Interleaving an interval into a list of points forces one
 *  of two moves, and both lie:
 *
 *   · file the thread at ONE of its two ends and the other end disappears, so
 *     a chain that ran for three weeks reads as a thing that happened on a
 *     Tuesday;
 *   · flatten the thread into its individual turns and the count goes with it
 *     — `messageCount` is the one number `GET /comms/threads` exists to give,
 *     and the question it answers ("how much have we talked") cannot be
 *     re-read off a merged list where every third row is a tier change.
 *
 *  There is also a permission reason. A reader without `comm.view-content`
 *  gets `state: 'hidden'` on the words but keeps every touch row in full; one
 *  merged list would alternate between rows that are complete and rows that
 *  are withheld, and the withheld ones would read as gaps in the record rather
 *  than as gaps in the reader's clearance. Two cards keep the boundary where
 *  the permission actually falls.
 *
 *  ------------------------------------------------------------------
 *  NO CODE, NO RAIL
 *  ------------------------------------------------------------------
 *  A thread mints no object code and never reaches ContextRail (§19.3) — a
 *  code is minted for something a person names out loud, and a thread is
 *  something that happened BETWEEN objects. So nothing here feeds the rail,
 *  and a thread is opened in a drawer rather than at an address of its own. */
export function CommsCard({ code, seedAddress }: { code: string; seedAddress?: string }) {
  const canView = useCan('comm.view')
  /* The capture door itself only asks for `comm.view`. The IDENTITY BOOK it
     depends on asks for `comm.capture-manage`, and without a way to name a
     sender there is no request to build — see `identitySearchQuery`. */
  const canCapture = useCan('comm.capture-manage')
  /* ONE question for the whole card, and it decides ONE sentence — not how any
     turn is drawn. Without this line the only way to learn you are not cleared
     to read content is to open a thread, and opening a thread writes a
     `platform.audit` row (§5c): finding out you may not read costs you a
     record saying you read. Said here, that trade goes away.
     Each turn still renders off `row.content.state`, straight from the server.
     The screen never decides which branch applies. */
  const canReadContent = useCan('comm.view-content')

  const { data, isPending, error } = useQuery({ ...objectThreadsQuery(code), enabled: canView })
  const [reading, setReading] = useState<ThreadRow | null>(null)
  const [capturing, setCapturing] = useState(false)

  const rows = data?.rows ?? []

  return (
    /* Rule 8 — a list lives on `.glass-b`, never on `.glass-a`. */
    <GlassCard variant="b" className="flex flex-col gap-4 p-5" aria-label="Dòng giao tiếp">
      <SectionTitle
        size="detail"
        hint="Nội dung hai bên đã trao đổi — một sổ riêng, không phải dòng thời gian sự kiện."
        actions={
          canView && canCapture ? (
            <Button size="sm" variant="secondary" onClick={() => setCapturing(true)}>
              <Icon icon={Plus} size={16} />
              Ghi một lượt
            </Button>
          ) : undefined
        }
      >
        Dòng giao tiếp {rows.length > 0 && `(${rows.length})`}
      </SectionTitle>

      {!canView ? (
        <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
          Vai của bạn không có quyền xem sổ giao tiếp, nên thẻ này không nói được đã trao đổi bao
          nhiêu lượt với khách này.
        </p>
      ) : isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        /* A failed read says it failed. An empty card here would read as "we
           have never talked to this company", which is the sentence that sends
           somebody off to make a cold first call to a customer three people
           have already been emailing. */
        <p className="text-warning text-[12.5px] leading-[1.6]">
          Không đọc được sổ giao tiếp của hồ sơ này.{' '}
          {isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'}
        </p>
      ) : rows.length === 0 ? (
        /* `EmptyState` only where there is a real button to put in it —
           `action` is a required prop, so the read-only reader used to get a
           dead label saying the same thing as the paragraph right below it.
           Two copies of one sentence, and the one on the button could not be
           pressed. The paragraph keeps the job because it is the one with room
           to say WHY. */
        canCapture ? (
          <EmptyState
            icon={MessageSquare}
            message="Chưa có luồng giao tiếp nào gắn vào hồ sơ này."
            action={{ label: 'Ghi lượt đầu tiên', onClick: () => setCapturing(true) }}
          />
        ) : (
          <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
            Chưa có luồng giao tiếp nào gắn vào hồ sơ này.
          </p>
        )
      ) : (
        <Timeline
          items={rows.map((row) => ({
            id: row.id,
            /* Every one of these conversations has ALREADY happened, and the
               default dot means the opposite. Not `current` either: that dot
               carries a 4px azure halo, so one per row would be item 1 of this
               review walking back in through another door. */
            state: 'ok' as const,
            title: threadTitle(row),
            meta: (
              <>
                <ChannelTag
                  icon={COMMS_CHANNEL_ICON[row.channel]}
                  label={COMMS_CHANNEL_LABEL[row.channel]}
                />
                {/* The count comes straight off the thread header. No second
                    request to count turns — that is exactly what this field
                    was added to the contract to avoid. */}
                <MetaPill>{row.messageCount} lượt</MetaPill>
                <MetaPill mono title="Lượt đầu tiên → lượt gần nhất">
                  {dmhm(row.startedAt)} → {dmhm(row.lastAt)}
                </MetaPill>
                {row.state === 'archived' && <Badge tone="draft">Đã lưu trữ</Badge>}
              </>
            ),
            actions: (
              /* The ONE press target on a thread row, so it takes rule 13's
                 tablet floor rather than the card-header button's size. */
              <Button size="lg" variant="ghost" onClick={() => setReading(row)}>
                Mở luồng
              </Button>
            ),
          }))}
        />
      )}

      {canView && !canReadContent && (
        <p className="text-glass-foreground text-[11.5px] leading-[1.55]">
          Vai của bạn đọc được số lượt và thời điểm, nhưng không đọc được nội dung hai bên đã nói.
          Mở một luồng ra vẫn thấy đủ các lượt, phần lời sẽ ghi rõ là bị ẩn.
        </p>
      )}

      {!canView || canCapture ? null : (
        /* The friction stated out loud rather than a button that 400s. A turn
           needs a `fromIdentityId`, the identity book is the only place that
           maps an address to a person, and that book belongs to a seat this
           reader does not hold. */
        <p className="text-glass-foreground text-[11.5px] leading-[1.55]">
          Ghi tay một lượt cần tra người gửi trong sổ định danh, và sổ đó thuộc quyền quản trị kênh
          giao tiếp — vai của bạn chưa có. Nhờ người giữ sổ thêm địa chỉ của khách vào trước, hoặc
          nhờ họ ghi hộ lượt này.
        </p>
      )}

      <ThreadDrawer thread={reading} onClose={() => setReading(null)} />
      <CaptureDrawer
        code={code}
        open={capturing}
        onClose={() => setCapturing(false)}
        threads={rows}
        seedAddress={seedAddress}
      />
    </GlassCard>
  )
}

/** A thread may carry no subject at all — a logged phone call usually does not
 *  — so the fallback names the channel instead of printing an empty heading. */
function threadTitle(row: ThreadRow): string {
  return row.subject ?? `Trao đổi qua ${COMMS_CHANNEL_LABEL[row.channel]}`
}

/** What a fresh capture starts on, and the ONE place that answer lives.
 *
 *  It is both the form's initial state and the channel select's
 *  `neutralValue`, because those two drifting apart is exactly what went
 *  wrong: the select fell back to `options[0]` for its neutral value while the
 *  state started somewhere else, so the control opened tinted as though
 *  somebody had already changed it. A phone call is the turn people log by
 *  hand most often, which is why it is the one. */
const DEFAULT_CAPTURE_CHANNEL: CommsChannel = 'phone'

const DIRECTION_LABEL: Record<MessageDirection, string> = {
  in: 'Khách gửi',
  out: 'Mình gửi',
}

/** Direction is an EVENT, not a state, so it gets no tinted ground at all.
 *
 *  This used to be `Badge tone="running"` on every inbound turn, which is
 *  `bg-primary/24` — a fifteen-turn thread painted fifteen azure blocks down
 *  the drawer. Rule 3 reserves azure for AI, the primary button and an ACTIVE
 *  state, and requires it to stay countable on any one screen; an attribute
 *  every row carries is the opposite of countable. The arrow does the telling
 *  and the pill keeps the default muted ground. */
const DIRECTION_ICON: Record<MessageDirection, IconGlyph> = {
  in: ArrowDown,
  out: ArrowUp,
}

// ---------------------------------------------------------------------------
// READING ONE THREAD
// ---------------------------------------------------------------------------

/** One thread's turns, in a drawer rather than expanded in place: a thread is
 *  bounded but not short, and unrolling a fifteen-turn mail chain inside the
 *  card pushes every other thread off the screen — which is the list the most
 *  common question ("how many conversations are running") needs. */
function ThreadDrawer({ thread, onClose }: { thread: ThreadRow | null; onClose: () => void }) {
  const { data, isPending, error } = useQuery(threadMessagesQuery(thread?.id ?? null))

  return (
    <Drawer
      open={thread !== null}
      onClose={onClose}
      title={thread ? threadTitle(thread) : ''}
      subtitle={
        thread
          ? `${COMMS_CHANNEL_LABEL[thread.channel]} · ${dmhm(thread.startedAt)} → ${dmhm(thread.lastAt)}`
          : undefined
      }
      meta={thread ? <Badge tone="draft">{thread.messageCount} lượt</Badge> : undefined}
      width="lg"
    >
      {isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <p className="text-warning text-[12.5px] leading-[1.6]">
          Không mở được các lượt của luồng này.{' '}
          {isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'}
        </p>
      ) : (data?.rows ?? []).length === 0 ? (
        /* A blank panel under a heading is the one thing this must not be. The
           case is rare on purpose — `create` writes the header and the first
           turn in one transaction, so a thread with no turns is a row that
           should not exist — which is exactly why it gets a sentence rather
           than silence: it means something is wrong with the row, not that the
           conversation was quiet. */
        <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
          Luồng này chưa có lượt nào — thường là dấu hiệu dòng luồng bị ghi dở. Báo lại nếu bạn thấy
          nó.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {(data?.rows ?? []).map((row) => (
            <MessageLine key={row.id} row={row} />
          ))}
        </ol>
      )}
    </Drawer>
  )
}

function MessageLine({ row }: { row: MessageRow }) {
  return (
    <li className="flex flex-col gap-2 rounded-md bg-white/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <MetaPill mono>{dmhm(row.at)}</MetaPill>
        <MetaPill icon={DIRECTION_ICON[row.direction]}>{DIRECTION_LABEL[row.direction]}</MetaPill>
        {row.durationSec !== null && (
          <MetaPill icon={Timer}>{durationLabel(row.durationSec)}</MetaPill>
        )}
        {/* Only when there was more than one. A manual capture always names at
            least the sender, so a pill reading "one person" on every row would
            be a column of noise saying nothing. */}
        {row.parties.length > 1 && <MetaPill>{row.parties.length} người có mặt</MetaPill>}
      </div>

      <MessageBody row={row} />
    </li>
  )
}

/** THE THREE BRANCHES OF `MessageContent`, AND WHY TWO OF THEM CANNOT SHARE A
 *  RENDERING.
 *
 *  `none` means the turn genuinely carries no words — a call logged with only
 *  a duration. `hidden` means words EXIST and this reader lacks
 *  `comm.view-content`. Drawing them the same way is the one serious mistake
 *  available on this card: it would tell a manager the call was silent because
 *  the manager is not cleared to read it, and they would act on that.
 *
 *  So `hidden` gets the exact wording Rule 7 already forced onto the global
 *  search screen (§7, screen 03), plus a lock and a warning tone, while
 *  `none` stays in muted grey and says the opposite thing in as many words.
 *  The screen does NOT re-ask E2 which of the two applies: the server decided
 *  in `comms.mapper.ts` and a second opinion here could disagree with it. */
function MessageBody({ row }: { row: MessageRow }) {
  if (row.content.state === 'visible') {
    /* `whitespace-pre-wrap`: a captured body keeps the line breaks whoever
       pasted it in typed. Without it a whole call turns into one slab. */
    return (
      <p className="text-foreground whitespace-pre-wrap text-[12.5px] leading-[1.65]">
        {row.content.bodyText}
      </p>
    )
  }

  if (row.content.state === 'hidden') {
    return (
      <p className="text-warning flex items-start gap-2 text-[12.5px] leading-[1.6]">
        <Icon icon={Lock} size={16} className="shrink-0" />
        <span>
          Bị ẩn theo quyền của bạn — lượt này CÓ nội dung, nhưng vai của bạn không được đọc nội dung
          giao tiếp. Xin quyền đọc nội dung nếu bạn cần biết hai bên đã nói gì.
        </span>
      </p>
    )
  }

  return (
    <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
      Lượt này không có nội dung chữ — nó được ghi lại là đã diễn ra, không có gì để đọc.
    </p>
  )
}

/** Seconds off the wire → a sentence. `@pv/ui` holds no locale, and a bare
 *  number of seconds is not what anybody asks about a call. */
function durationLabel(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
  const rest = seconds % SECONDS_PER_MINUTE
  return minutes === 0 ? `${rest} giây` : `${minutes} phút ${rest} giây`
}

const SECONDS_PER_MINUTE = 60

// ---------------------------------------------------------------------------
// LOGGING ONE TURN BY HAND
// ---------------------------------------------------------------------------

/** How long the identity box waits after the last keystroke before it asks the
 *  book. THE SAME 300 the lead book, the opportunity book, the campaign book
 *  and the deal dialog all wait — a fifth number here would be a fifth feel
 *  for one gesture, and nothing about the identity book asks for a different
 *  one. The delay exists because that book is a shared table and one lookup
 *  per keystroke is a read storm on it for no extra answer. */
const SEARCH_DELAY_MS = 300

/** A turn that just happened, typed in by hand.
 *
 *  ------------------------------------------------------------------
 *  THE SENDER IS LOOKED UP, NOT TYPED
 *  ------------------------------------------------------------------
 *  `MessageCreate.fromIdentityId` is a UUID out of `comms.identity`, and that
 *  is the deliberate friction the module was built around: every turn has a
 *  named human behind it, not a free-text name that nothing can ever be joined
 *  back to. This form therefore refuses to submit until a row has been PICKED,
 *  and when the lookup comes back empty it says what has to happen next rather
 *  than letting the request go out and come back 400.
 *
 *  Looked up by ADDRESS because that is the only filter the identity book has
 *  (see `identitySearchQuery`). The box is seeded with the lead's own mailbox,
 *  which answers the common case without anybody typing: either that address
 *  is in the book and the sender is one press away, or it is not and the form
 *  says so before a single field has been filled. */
function CaptureDrawer({
  code,
  open,
  onClose,
  threads,
  seedAddress,
}: {
  code: string
  open: boolean
  onClose: () => void
  threads: readonly ThreadRow[]
  seedAddress?: string
}) {
  const capture = useCaptureMessage(code)

  const [target, setTarget] = useState('')
  const [channel, setChannel] = useState<CommsChannel>(DEFAULT_CAPTURE_CHANNEL)
  const [subject, setSubject] = useState('')
  const [at, setAt] = useState('')
  const [direction, setDirection] = useState<MessageDirection>('in')
  const [address, setAddress] = useState('')
  const [applied, setApplied] = useState('')
  const [sender, setSender] = useState<IdentityRow | null>(null)
  const [body, setBody] = useState('')
  const [seconds, setSeconds] = useState('')
  const [failure, setFailure] = useState('')

  /* Re-opening is a new capture. A drawer that still holds the previous call's
     body is one press away from filing last week's words under this morning. */
  useEffect(() => {
    if (!open) return
    setTarget('')
    setChannel(DEFAULT_CAPTURE_CHANNEL)
    setSubject('')
    /* Zero minutes ahead, not `localSlot()`'s default ten: a turn is logged
       straight after it happened, and a seed in the future would file this
       morning's call under a moment that has not arrived. */
    setAt(localSlot(0))
    setDirection('in')
    setAddress(seedAddress ?? '')
    setApplied(seedAddress ?? '')
    setSender(null)
    setBody('')
    setSeconds('')
    setFailure('')
  }, [open, seedAddress])

  useEffect(() => {
    const wanted = address.trim()
    if (wanted === applied) return
    const timer = setTimeout(() => setApplied(wanted), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [address, applied])

  const {
    data: book,
    isFetching: bookFetching,
    error: bookError,
  } = useQuery({ ...identitySearchQuery(applied), enabled: open && applied.length > 0 })

  const found = useMemo(() => book?.rows ?? [], [book])

  /* Picking a sender and then editing the address box un-picks: the row on
     screen has to be the row the request will carry, and a stale pick under a
     changed search string is the one way those two come apart. */
  useEffect(() => {
    if (sender && !found.some((row) => row.id === sender.id)) setSender(null)
  }, [found, sender])

  const secondsValue = seconds.trim() === '' ? null : Number(seconds)

  /* Four ways this is not ready, one sentence each. A bare disabled button
     leaves the user staring at grey with nothing to fix. */
  const blocker: string | null = !at
    ? 'Chưa chọn thời điểm của lượt này.'
    : !sender
      ? 'Chưa chọn người gửi từ sổ định danh.'
      : secondsValue !== null && (!Number.isInteger(secondsValue) || secondsValue < 0)
        ? 'Thời lượng phải là số giây nguyên, không âm.'
        : body.trim() === '' && secondsValue === null
          ? 'Lượt này chưa có gì để ghi — nhập nội dung, hoặc thời lượng nếu là cuộc gọi.'
          : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (blocker || !sender || capture.isPending) return
    setFailure('')

    /* `datetime-local` answers without a zone ("2026-09-15T14:30"); `Moment`
       demands ISO 8601 WITH one, so `new Date(...)` reads it in the machine's
       zone and `toISOString()` stamps it — the moment the person just read off
       their own clock. */
    const shared = {
      at: new Date(at).toISOString(),
      direction,
      fromIdentityId: sender.id,
      ...(body.trim() ? { bodyText: body.trim() } : {}),
      ...(secondsValue !== null ? { durationSec: secondsValue } : {}),
      /* The sender is always on their own turn. `parties` demands at least one
         row and this is the one the server can be sure of; everybody else who
         was on the call is turn 2's job, when there is a book to pick them
         from without a second search box. */
      parties: [{ identityId: sender.id, role: 'from' as const }],
      /* The record this turn belongs to. Required on BOTH branches: a thread
         with no link appears on no profile at all, because the thread list is
         an inner join on the link table. */
      objectCode: code,
    }

    const payload: MessageCreate = target
      ? { ...shared, thread: 'existing', threadId: target }
      : {
          ...shared,
          thread: 'new',
          channel,
          ...(subject.trim() ? { subject: subject.trim() } : {}),
        }

    capture.mutate(payload, {
      onSuccess: () => {
        toast('Đã ghi một lượt vào sổ giao tiếp', { tone: 'success' })
        onClose()
      },
      onError: (error) =>
        setFailure(
          isApiError(error) ? userMessage(error) : 'Không ghi được lượt này. Vui lòng thử lại.',
        ),
    })
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Ghi một lượt giao tiếp"
      subtitle="Ghi lại một cuộc gọi, một lá thư hay một tin nhắn đã diễn ra."
      width="lg"
      footer={
        /* TWO SLOTS, NOT ONE. A `blocker` is a reminder — a field still to
           fill, the user's own turn to move. A `failure` is the server having
           refused a write that already went out. Sharing one slot made the
           second read like the first, in the same grey at the same size, and
           worse: the next keystroke that produced a blocker silently overwrote
           the refusal, so the only account of why nothing was saved vanished
           without a trace. They stack now, and the refusal carries the warning
           tone that says somebody has to act on it. */
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {blocker && <span className="text-muted-foreground text-xs">{blocker}</span>}
            {failure && <span className="text-warning text-xs">{failure}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="lg" onClick={onClose}>
              Huỷ
            </Button>
            <Button
              type="submit"
              size="lg"
              form="comms-capture"
              disabled={Boolean(blocker) || capture.isPending}
            >
              {capture.isPending ? 'Đang ghi…' : 'Ghi lượt'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="comms-capture" onSubmit={submit} className="flex flex-col gap-4">
        {/* The thread picker IS the contract's union, drawn. An empty value is
            `thread: 'new'` and brings the two fields only a new thread needs;
            any other value is `thread: 'existing'` and those two fields go
            away, because a thread that exists already decided them. */}
        <Select
          size="lg"
          label="Luồng"
          value={target}
          options={[
            { value: '', label: 'Luồng mới' },
            ...threads.map((row) => ({
              value: row.id,
              label: `${threadTitle(row)} · ${row.messageCount} lượt`,
            })),
          ]}
          onChange={setTarget}
        />

        {!target && (
          <>
            <Select
              size="lg"
              label="Kênh của luồng mới"
              value={channel}
              neutralValue={DEFAULT_CAPTURE_CHANNEL}
              options={COMMS_CHANNELS.map((value) => ({
                value,
                label: COMMS_CHANNEL_LABEL[value],
              }))}
              onChange={(value) => setChannel(value as CommsChannel)}
            />
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px]">Tiêu đề (không bắt buộc)</span>
              <Input
                value={subject}
                maxLength={THREAD_SUBJECT_MAX}
                placeholder="Gọi tư vấn phương án · Thư báo giá"
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
          </>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Thời điểm</span>
          <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </label>

        <Select
          size="lg"
          label="Chiều"
          value={direction}
          options={[
            { value: 'in', label: DIRECTION_LABEL.in },
            { value: 'out', label: DIRECTION_LABEL.out },
          ]}
          onChange={(value) => setDirection(value as MessageDirection)}
        />

        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[11px]">
              Người gửi — tra trong sổ định danh theo địa chỉ
            </span>
            <Input
              value={address}
              placeholder="hòm thư, số điện thoại có mã nước, hoặc tài khoản Zalo/Telegram"
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>

          <SenderPicker
            address={applied}
            rows={found}
            total={book?.total ?? 0}
            fetching={bookFetching}
            failed={Boolean(bookError)}
            reason={bookError && isApiError(bookError) ? userMessage(bookError) : null}
            picked={sender}
            onPick={setSender}
          />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">
            Nội dung đã trao đổi (bỏ trống nếu lượt này không có chữ)
          </span>
          <Textarea
            value={body}
            rows={8}
            maxLength={MESSAGE_BODY_MAX}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">
            Thời lượng tính bằng giây (chỉ cuộc gọi và buổi gặp)
          </span>
          <Input
            type="number"
            inputMode="numeric"
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
          />
        </label>
      </form>
    </Drawer>
  )
}

/** The identity lookup's five answers, five sentences.
 *
 *  Folding any two of them collapses questions with different next steps: "the
 *  book has nobody at this address" needs somebody to add a row, "you may not
 *  read the book" needs somebody else to do the capture, and "still looking"
 *  needs nothing but a second. The empty case is the one the whole card exists
 *  to keep honest — it is the wall behind `fromIdentityId`, and it is said out
 *  loud here instead of being discovered as a 400. */
function SenderPicker({
  address,
  rows,
  total,
  fetching,
  failed,
  reason,
  picked,
  onPick,
}: {
  address: string
  rows: readonly IdentityRow[]
  total: number
  fetching: boolean
  failed: boolean
  reason: string | null
  picked: IdentityRow | null
  onPick: (row: IdentityRow) => void
}) {
  if (address.length === 0) {
    return (
      <p className="text-glass-foreground text-[11.5px] leading-[1.55]">
        Gõ địa chỉ của người đã gửi lượt này. Một lượt chỉ ghi được khi người gửi đã có trong sổ
        định danh — đó là cách mỗi lượt trao đổi có một con người đứng sau.
      </p>
    )
  }

  if (failed) {
    return (
      <p className="text-warning text-[11.5px] leading-[1.55]">
        Không tra được sổ định danh. {reason ?? 'Vui lòng thử lại.'}
      </p>
    )
  }

  if (fetching) return <Skeleton className="h-12 w-full" />

  if (rows.length === 0) {
    return (
      <p className="text-warning text-[11.5px] leading-[1.55]">
        Sổ định danh chưa có địa chỉ này. Thêm nó vào sổ trước — gán về đúng lead hoặc đúng người
        của mình — rồi quay lại ghi lượt; ghi trước khi có định danh thì lượt này không có ai đứng
        sau.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <Button
          key={row.id}
          type="button"
          size="lg"
          variant={picked?.id === row.id ? 'default' : 'ghost'}
          className="justify-start"
          onClick={() => onPick(row)}
        >
          <Icon icon={picked?.id === row.id ? Check : UserPlus} size={16} />
          <span className="font-mono">{row.address}</span>
          <span className="font-normal">
            {COMMS_CHANNEL_LABEL[row.channel]} ·{' '}
            {row.side === 'member' ? 'người của mình' : row.objectCode}
          </span>
        </Button>
      ))}
      {total > rows.length && (
        <p className="text-glass-foreground text-[11.5px] leading-[1.55]">
          Sổ còn {total - rows.length} địa chỉ nữa khớp câu này — gõ đầy đủ hơn để thu hẹp.
        </p>
      )}
    </div>
  )
}
