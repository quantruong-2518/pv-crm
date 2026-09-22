import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from '@pv/ui'
import {
  Badge,
  Button,
  Drawer,
  GlassCard,
  Icon,
  MetaPill,
  SectionTitle,
  SegmentedControl,
  Skeleton,
  Timeline,
  type StatusDotState,
} from '@pv/ui'
import type { LeadMailTimelineRow, TouchKind } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { dm, dmy } from '@/lib/date'
import { DELIVERED_MAIL, FAILED_MAIL } from '@/data/mail-runs'
import { leadMailEventsQuery, leadMailTimelineQuery } from '@/data/mas'
import { lifecycleTitle, type TouchFocus } from '@/data/touches'
import { NO_TOUCHES } from '@/data/lead-profile'
import type { TouchEvent } from '@/data/touches'
import { useCan } from '@/app/auth'
import { objectThreadsQuery } from '@/data/comms'
import { exitReasonRows, salesCatalogQuery } from '@/data/sales-config'
import { CommsPanel } from './comms-card'

/** The three timelines of a lead behind three doors — mail, activity, talk.
 *
 *  They were three cards in a row, each titled as its own timeline, and nobody
 *  could say which of the three would answer a given question. They are one
 *  object seen three ways, so they are one tab row.
 *
 *  NO GLASS OF ITS OWN since 17/09: it draws inside the activity card, and a
 *  second glass surface there is the fifth background layer (law 12).
 *
 *  The tab row carries the button of the OPEN tab only — a button aimed at
 *  content nobody is looking at gets pressed by accident. Writing a letter is
 *  not one of those: it is the card's own head button.
 *
 *  A tab prints no count until its query has answered — `0` is a wrong answer
 *  about data nobody knows yet. */
type HistoryTab = 'activity' | 'mail' | 'comms'

const TAB_HINT: Record<HistoryTab, string> = {
  activity: 'Những gì đã xảy ra với hồ sơ này.',
  mail: 'Email đã gửi và tín hiệu trả về.',
  comms: 'Nội dung hai bên đã trao đổi.',
}

export function LeadHistoryPanel({
  code,
  touches,
  focus,
  seedAddress,
}: {
  code: string
  /** The lead's touch rows, `undefined` while the read has not answered. */
  touches: readonly TouchEvent[] | undefined
  /** The `sales.touch` row to jump to — normally a vector face just pressed. */
  focus?: TouchFocus | null
  seedAddress?: string | null
}) {
  const [tab, setTab] = useState<HistoryTab>('activity')
  /* The capture drawer opens from the tab row, which the panel does not own. */
  const [capturing, setCapturing] = useState(false)
  const mail = useQuery(leadMailTimelineQuery(code))
  const comms = useCommsTabHead(code)

  useEffect(() => {
    setTab('activity')
    setCapturing(false)
  }, [code])

  /* A vector face points at a touch row, and only this tab draws those rows —
     land on it first, or the press lands inside a closed tab and does nothing.
     The scroll itself waits for the row to mount; see `ActivityTimeline`. */
  useEffect(() => {
    if (focus) setTab('activity')
  }, [focus])

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Lịch sử">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          label="Dòng lịch sử"
          hideLabel
          tone="quiet"
          value={tab}
          onChange={(value) => setTab(value as HistoryTab)}
          options={[
            { value: 'activity', label: 'Hoạt động', count: touches?.length },
            { value: 'mail', label: 'Email', count: mail.data?.rows.length },
            { value: 'comms', label: 'Trao đổi', count: comms.count },
          ]}
        />
        {tab === 'comms' && comms.canCapture && (
          <Button size="md" variant="secondary" onClick={() => setCapturing(true)}>
            <Icon icon={Plus} size={16} />
            Ghi một trao đổi
          </Button>
        )}
      </div>

      <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.5]">{TAB_HINT[tab]}</p>

      {tab === 'activity' && <ActivityTimeline history={touches ?? NO_TOUCHES} focus={focus} />}
      {tab === 'mail' && <MailTimelinePanel code={code} />}
      {tab === 'comms' && (
        <CommsPanel
          code={code}
          seedAddress={seedAddress ?? undefined}
          capturing={capturing}
          onCapture={setCapturing}
        />
      )}
    </section>
  )
}

/** What the conversation tab needs to draw its own head: how many threads, and
 *  whether this reader may add one. Kept here rather than exported from
 *  `comms-card` so that file keeps exporting components only.
 *
 *  Same query key as `CommsPanel`, so the count costs no second request and the
 *  panel keeps owning its own read. */
function useCommsTabHead(code: string) {
  const canView = useCan('comm.view')
  const canCapture = useCan('comm.capture-manage')
  const { data } = useQuery({ ...objectThreadsQuery(code), enabled: canView })

  return { count: data?.rows.length, canCapture: canView && canCapture }
}

// ---------------------------------------------------------------------------
// The lead's own moments — `sales.touch`
// ---------------------------------------------------------------------------

/* `care-planned` and `first-action` share a tone, and so do `exchange-logged`
   and `verified`: each new kind replaced a legacy one on the same rung, and two
   tones for one rung would read as two different things happening. */
const EVENT_DOT: Record<TouchKind, 'ok' | 'current' | 'next' | 'bad' | 'warning'> = {
  created: 'next',
  contacted: 'next',
  'field-filled': 'current',
  'handed-over': 'current',
  'care-planned': 'current',
  'first-action': 'current',
  'exchange-logged': 'ok',
  'tier-raised': 'ok',
  verified: 'ok',
  nurtured: 'next',
  resumed: 'current',
  archived: 'next',
  'first-meeting': 'ok',
  'entered-pipeline': 'ok',
  'stage-changed': 'current',
  signed: 'ok',
  exited: 'bad',
  reopened: 'current',
  'sample-sent': 'ok',
  'poc-run': 'ok',
  'quotation-sent': 'ok',
  'care-entered': 'bad',
  'care-left': 'current',
}

/** What has happened to this record, one row per `sales.touch`.
 *
 *  Rows arrive by PROPS because the two callers read two different timelines —
 *  a deal's and a lead's — and those two do not mix (ADR 0018, decision 5).
 *
 *  Rows are keyed by touch id, not by position: a `FlowVector` face carries a
 *  `touchId`, and `focus` is the other half of that wire. The scroll runs on
 *  mount as well as on change, so a face pressed while another tab was open
 *  still lands once this one is drawn. */
export function ActivityTimeline({
  history,
  focus,
}: {
  history: readonly TouchEvent[]
  focus?: TouchFocus | null
}) {
  const { data: catalog } = useQuery(salesCatalogQuery)
  const reasons = new Map(exitReasonRows(catalog).map((r) => [r.key, r.label]))

  useEffect(() => {
    if (!focus) return
    const node = document.getElementById(`touch-${focus.id}`)
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focus])

  if (history.length === 0) {
    return (
      <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
        Chưa có hoạt động nào được ghi cho hồ sơ này.
      </p>
    )
  }

  /* The SAME `Timeline` the other two tabs draw with. Hand-rolling a second
     list here meant swapping tabs changed the type scale and the left gutter,
     which reads as three cards stacked rather than three doors of one. */
  return (
    <Timeline
      items={history.map((row) => ({
        id: row.id,
        domId: `touch-${row.id}`,
        highlight: focus?.id === row.id,
        state: EVENT_DOT[row.kind],
        marker: dm(row.at),
        title:
          lifecycleTitle(row) ?? (row.kind === 'exited' ? exitNote(row.note, reasons) : row.note),
        meta: <MetaPill avatar={row.by}>{row.by}</MetaPill>,
      }))}
    />
  )
}

/** An `exited` note arrives as "<prefix> · <reason-key>[ · note]" — swap the key
 *  for its configured label. Anything else is printed as the server wrote it. */
function exitNote(note: string, labels: Map<string, string>): string {
  const [head, key, ...rest] = note.split(' · ')
  const label = key === undefined ? undefined : labels.get(key)
  return label === undefined ? note : [head, label, ...rest].join(' · ')
}

/** The same timeline as its own card, for a screen that shows only this one.
 *  The deal profile has no second history stream to put beside it. */
export function ActivityCard({
  history,
  focus,
}: {
  history: readonly TouchEvent[]
  focus?: TouchFocus | null
}) {
  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Lịch sử">
      <SectionTitle size="lg" hint="Những gì đã xảy ra với hồ sơ này.">
        Lịch sử
      </SectionTitle>
      <ActivityTimeline history={history} focus={focus} />
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------
// The lead's mail book — GET /sales/leads/:code/mail
// ---------------------------------------------------------------------------

/** The letters written to this person, one row per `mail_run`.
 *
 *  NEVER SAYS "read" OR "unread". An open is a 1×1 image and it breaks both
 *  ways at once: Apple Mail Privacy Protection fetches it for people who never
 *  looked, Gmail caches it so every open after the first goes uncounted, and a
 *  reader with images off counts as nothing at all. `openCount` is therefore a
 *  noisy floor, and at the scale of ONE lead a single ghost open turns a
 *  customer who ignored us into one who "read it twice" — so the panel says
 *  only that no open signal was recorded, and carries no percentage.
 *  `clickCount` is the number worth trusting: nobody proxies a click.
 *
 *  One dot merges delivery and signal in the reader's order of need — see
 *  `deliveryFace`, where a bounce outranks everything else because it is the
 *  only state that asks for an action. */
function MailTimelinePanel({ code }: { code: string }) {
  /* The same query key the card head reads for the tab count — two observers,
     one fetch, and the panel keeps owning its own read. */
  const { data, isPending, error } = useQuery(leadMailTimelineQuery(code))
  const rows = data?.rows ?? []
  const [openRow, setOpenRow] = useState<LeadMailTimelineRow | null>(null)

  return (
    <>
      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : error ? (
        /* A failed read says so. An empty panel here reads as "no letter has
           been sent", which sends somebody off to write a fourth one to a
           person who has already had three. */
        <p className="text-warning text-[12.5px] leading-[1.6]">
          Không đọc được lịch sử email của lead này.{' '}
          {isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
          Chưa gửi email nào cho lead này.
        </p>
      ) : (
        <Timeline
          items={rows.map((row) => {
            const face = deliveryFace(row)
            const signal = signalOf(row)
            return {
              id: row.runId,
              state: face.dot,
              /* The SUBJECT names the letter; `label` names the batch, and
                 every batch fired from this screen is named after the lead —
                 so three letters read as one row repeated. */
              title: row.subject,
              meta: (
                <>
                  <MetaPill>
                    {row.campaignName ? `Chiến dịch · ${row.campaignName}` : 'Gửi riêng'}
                  </MetaPill>
                  <Badge
                    tone={face.tone}
                    className={face.tone === 'draft' ? 'text-foreground' : undefined}
                  >
                    {face.label}
                  </Badge>
                  {face.at && <MetaPill mono>{face.at}</MetaPill>}
                  {signal && (
                    <MetaPill tone={row.clickCount > 0 ? 'accent' : undefined}>{signal}</MetaPill>
                  )}
                </>
              ),
              children: row.failReason ? (
                <span className="text-destructive-foreground">
                  Không gửi được: {row.failReason}
                </span>
              ) : face.tone === 'danger' ? (
                <span className="text-destructive-foreground">
                  Không gửi được. Kiểm tra lại địa chỉ email trước khi thử lại.
                </span>
              ) : undefined,
              actions: (
                <Button size="lg" variant="ghost" onClick={() => setOpenRow(row)}>
                  Xem chi tiết
                </Button>
              ),
            }
          })}
        />
      )}

      <MailTimelineDetailDrawer code={code} row={openRow} onClose={() => setOpenRow(null)} />
    </>
  )
}

const MAIL_EVENT_LABEL: Record<'OPEN' | 'CLICK' | 'REPLY', string> = {
  OPEN: 'Mở thư',
  CLICK: 'Bấm liên kết',
  REPLY: 'Trả lời',
}

/** One run's full detail — a right-side panel, keeping the timeline in place
 *  (see `Drawer`'s own docblock for why). The header fields come straight off
 *  `row`, already loaded for the whole panel; the event sub-timeline is its own
 *  lazy request (`leadMailEventsQuery`, `enabled` only while the panel is
 *  open) — see that query's docblock for why it is not folded into `row`. */
function MailTimelineDetailDrawer({
  code,
  row,
  onClose,
}: {
  code: string
  row: LeadMailTimelineRow | null
  onClose: () => void
}) {
  const face = row ? deliveryFace(row) : null
  const signal = row ? signalOf(row) : null
  const { data: events, isPending: eventsPending } = useQuery(
    leadMailEventsQuery(code, row?.runId ?? null),
  )

  return (
    <Drawer
      open={row !== null}
      onClose={onClose}
      title={row?.subject ?? ''}
      meta={face && <Badge tone={face.tone}>{face.label}</Badge>}
    >
      {row && (
        <div className="flex flex-col gap-5 text-[12.5px] leading-[1.7]">
          <div className="flex flex-col gap-4">
            {/* The batch this letter rode out with — the name the run book
                lists it under, and the only way back from this panel to it. */}
            <DetailRow label="Lô gửi" value={row.label} />
            <DetailRow
              label="Nguồn gửi"
              value={row.campaignName ? `Chiến dịch · ${row.campaignName}` : 'Gửi riêng'}
            />
            {row.scheduledAt && <DetailRow label="Hẹn gửi" value={mailMoment(row.scheduledAt)} />}
            {row.sentAt && <DetailRow label="Đã gửi" value={mailMoment(row.sentAt)} />}
            {row.deliveredAt && (
              <DetailRow label="Đã tới hộp thư" value={mailMoment(row.deliveredAt)} />
            )}
            <DetailRow label="Tín hiệu tương tác" value={signal ?? 'Chưa có tín hiệu'} />
            {row.replyCount > 0 && (
              <DetailRow
                label="Đã trả lời"
                value={
                  row.lastReplyAt
                    ? `${row.replyCount} lần · gần nhất ${mailMoment(row.lastReplyAt)}`
                    : `${row.replyCount} lần`
                }
              />
            )}
            {row.failReason && (
              <DetailRow label="Không gửi được" value={row.failReason} tone="danger" />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px] uppercase tracking-wide">
              Diễn biến
            </span>
            {eventsPending ? (
              <Skeleton className="h-10 w-full" />
            ) : !events || events.rows.length === 0 ? (
              <p className="text-muted-foreground">Chưa có tín hiệu mở, bấm hay trả lời nào.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {events.rows.map((event, i) => (
                  <li key={`${event.kind}-${event.at}-${i}`} className="flex flex-wrap gap-2">
                    <MetaPill mono>{mailMoment(event.at)}</MetaPill>
                    <span className="font-medium">{MAIL_EVENT_LABEL[event.kind]}</span>
                    {event.detail && (
                      <span className="text-muted-foreground truncate">{event.detail}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Drawer>
  )
}

function DetailRow({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</span>
      <span className={tone === 'danger' ? 'text-destructive-foreground' : undefined}>{value}</span>
    </div>
  )
}

/** Two axes into one dot, in the reader's order.
 *
 *  `bad` outranks everything: a bounced or broken letter is the most important
 *  thing on the row and the only state that asks for an action (fix the
 *  address, or stop chasing). `warning` for a letter HELD BACK — the address
 *  was on the block list when its turn came — because that is not a pipe
 *  failure but a sign the list is rotting.
 *
 *  Signal comes after: `ok` once somebody clicked or opened, `current` once the
 *  letter landed with no signal yet, `next` while it is still queued. */
type MailDeliveryFace = {
  label: string
  tone: 'draft' | 'warning' | 'success' | 'danger'
  dot: StatusDotState
  at?: string
}

/** The state of the LETTER, not of the whole run it went out with. */
function deliveryFace(row: LeadMailTimelineRow): MailDeliveryFace {
  if (FAILED_MAIL[row.deliveryState]) {
    return { label: 'Gửi lỗi', tone: 'danger', dot: 'bad' }
  }
  if (row.runState === 'CANCELLED') {
    return { label: 'Đã huỷ', tone: 'draft', dot: 'next' }
  }
  if (DELIVERED_MAIL[row.deliveryState]) {
    const moment = row.deliveredAt ?? row.sentAt
    return {
      label: 'Đã gửi',
      tone: 'success',
      dot: 'ok',
      ...(moment
        ? { at: `${row.deliveredAt ? 'Đã tới hộp thư' : 'Gửi thành công'} · ${mailMoment(moment)}` }
        : {}),
    }
  }
  if (row.runState === 'SCHEDULED') {
    return {
      label: 'Đã hẹn gửi',
      tone: 'warning',
      dot: 'next',
      ...(row.scheduledAt ? { at: `Dự kiến · ${mailMoment(row.scheduledAt)}` } : {}),
    }
  }
  return {
    label: 'Đang gửi',
    tone: 'warning',
    dot: 'current',
    ...(row.scheduledAt ? { at: `Bắt đầu · ${mailMoment(row.scheduledAt)}` } : {}),
  }
}

/** One sentence about the signal — and the "no open recorded" one is the most
 *  important of them. See `MailTimelinePanel`'s docblock. */
function signalOf(row: LeadMailTimelineRow): string | null {
  if (row.clickCount > 0) {
    const count = row.clickCount === 1 ? 'Đã bấm liên kết' : `Đã bấm ${row.clickCount} lần`
    return row.lastClickAt ? `${count} · ${mailMoment(row.lastClickAt)}` : count
  }
  if (row.openCount > 0) {
    const count = `${row.openCount} tín hiệu mở`
    return row.lastOpenAt ? `${count} · gần nhất ${mailMoment(row.lastOpenAt)}` : count
  }
  if (DELIVERED_MAIL[row.deliveryState]) return 'Chưa ghi nhận lượt mở'
  return null
}

function mailMoment(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return dmy(iso)
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).format(date)
}
