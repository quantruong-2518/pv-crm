import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Chip,
  CircleAlert,
  Icon,
  Inbox,
  Skeleton,
  StatusDot,
  type StatusDotState,
} from '@pv/ui'
import type { MailRunRecipientRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { dmhm } from '@/lib/date'
import { DELIVERED_MAIL, FAILED_MAIL, mailRunRecipientsQuery } from '@/data/mail-runs'

/** WHO GOT THIS WAVE — the panel that opens under one row of the wave table.
 *
 *  ------------------------------------------------------------------
 *  ONE WAVE IS ONE BATCH, AND THIS IS THE OTHER HALF OF EVERY NUMBER
 *  ------------------------------------------------------------------
 *  The wave row says `sent 3 · delivered 1 · bounced 1`. Every question that
 *  follows — WHICH one bounced, whose address needs fixing, who never opened
 *  it — had no door before 30/08: a reader had to open lead profiles one at a
 *  time and read their mail timelines, which means knowing in advance which
 *  lead to open.
 *
 *  ------------------------------------------------------------------
 *  NOT A `DataTable`, THOUGH IT IS A LIST
 *  ------------------------------------------------------------------
 *  Law 8 (`docs/luat-thiet-ke.md` §1) puts every table on `.glass-b`, and this
 *  panel is already INSIDE one — nesting a second pane of glass would be a
 *  fifth background layer, which law 12 forbids. So this is a flat list divided
 *  by hairlines, and the wave table above stays the only thing here wearing
 *  glass.
 *
 *  ------------------------------------------------------------------
 *  NOTHING IS PREFETCHED — MOUNTING THIS COMPONENT IS THE `enabled`
 *  ------------------------------------------------------------------
 *  The screen builds this for the one wave a reader expanded, so a ten-wave
 *  campaign costs one round trip instead of ten. The poll beat lives in
 *  `mailRunRecipientsQuery` and follows the state of the LETTERS, not of the
 *  batch. */
export function WaveRecipients({ runId }: { runId: string }) {
  const { data, isPending, error } = useQuery(mailRunRecipientsQuery(runId))
  const rows = data?.rows ?? []

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 px-3 py-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-warning px-3 py-4 text-[12px]">
        Không đọc được danh sách người nhận của đợt này.{' '}
        {isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'}
      </p>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 px-3 py-4 text-[12px]">
        <Icon icon={Inbox} size={16} />
        Đợt này chưa có lá thư nào rời hàng đợi.
      </div>
    )
  }

  const failed = rows.filter((r) => FAILED_MAIL[r.deliveryState]).length
  const opened = rows.filter((r) => r.openCount > 0).length

  return (
    <div className="flex flex-col gap-2 px-3">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="text-foreground font-medium">{rows.length} người nhận</span>
        <span aria-hidden="true">·</span>
        <span>{opened} đã mở</span>
        {failed > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-warning">{failed} không tới nơi</span>
          </>
        )}
      </div>

      <ul className="divide-white/6 divide-y">
        {rows.map((row) => (
          <RecipientLine key={row.leadCode} row={row} />
        ))}
      </ul>
    </div>
  )
}

function RecipientLine({ row }: { row: MailRunRecipientRow }) {
  const face = deliveryFace(row)

  return (
    <li className="grid items-center gap-x-3 gap-y-1 py-2 text-[12px] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-center gap-2">
        <StatusDot state={face.dot} label={face.label} />
        <span className="truncate" title={row.company}>
          {row.company}
        </span>
        <Chip className="hidden shrink-0 xl:inline-flex">{row.leadCode}</Chip>
      </div>

      <div className="min-w-0">
        <span className="block truncate" title={row.email}>
          {row.email}
        </span>
        <span className="text-muted-foreground block truncate text-[11px]">{row.contactName}</span>
      </div>

      {/* The most important sentence on the line: "no open recorded" is an
          answer, an empty cell is not — see `signalOf`. */}
      <span className="text-muted-foreground min-w-0 truncate text-[11px]">{signalOf(row)}</span>

      <div className="flex items-center justify-start gap-2 md:justify-end">
        <Badge tone={face.tone}>{face.label}</Badge>
        {face.at && (
          <span className="text-muted-foreground whitespace-nowrap text-[11px]">{face.at}</span>
        )}
        {row.failReason && (
          <span
            className="text-warning inline-flex items-center gap-1 text-[11px]"
            title={row.failReason}
          >
            <Icon icon={CircleAlert} size={14} />
            <span className="hidden max-w-[220px] truncate lg:inline">{row.failReason}</span>
          </span>
        )}
      </div>
    </li>
  )
}

type DeliveryFace = {
  label: string
  tone: 'draft' | 'warning' | 'success' | 'danger'
  dot: StatusDotState
  at?: string
}

/** Two axes into one label, in the reading order the lead profile's mail
 *  timeline already settled (`lead-parts.tsx#deliveryFace`): a failed letter
 *  comes before everything because it is the only one asking for an action,
 *  then "it arrived", then "still on its way".
 *
 *  One branch is missing here on purpose — the state of the BATCH. The parent
 *  row prints that in its own `Badge`, and a letter reading "cancelled" under a
 *  wave reading "sent" is two sentences contradicting each other on one
 *  screen. */
function deliveryFace(row: MailRunRecipientRow): DeliveryFace {
  if (FAILED_MAIL[row.deliveryState]) {
    return { label: 'Không tới nơi', tone: 'danger', dot: 'bad' }
  }
  if (DELIVERED_MAIL[row.deliveryState]) {
    const at = row.deliveredAt ?? row.sentAt
    return {
      label: row.deliveredAt ? 'Đã tới hộp thư' : 'Đã gửi',
      tone: 'success',
      dot: 'ok',
      ...(at ? { at: dmhm(at) } : {}),
    }
  }
  return { label: 'Đang gửi', tone: 'warning', dot: 'current' }
}

/** The recipient's signal, or the sentence saying there is not one yet.
 *
 *  The "no open recorded" line matters more than it looks: an empty cell reads
 *  as data that has not loaded, while a sentence reads as a fact. It can only
 *  be said once the letter ARRIVED — one still on its way has nothing to have
 *  failed to record. */
function signalOf(row: MailRunRecipientRow): string {
  if (row.clickCount > 0) {
    const count = row.clickCount === 1 ? 'Đã bấm liên kết' : `Đã bấm ${row.clickCount} lần`
    return row.lastClickAt ? `${count} · ${dmhm(row.lastClickAt)}` : count
  }
  if (row.openCount > 0) {
    const count = `${row.openCount} tín hiệu mở`
    return row.lastOpenAt ? `${count} · ${dmhm(row.lastOpenAt)}` : count
  }
  return DELIVERED_MAIL[row.deliveryState] ? 'Chưa ghi nhận lượt mở' : '—'
}
