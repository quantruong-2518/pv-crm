import { useQuery } from '@tanstack/react-query'
import { Badge, Check, Chip, CircleAlert, Icon, Inbox, Skeleton, cn } from '@pv/ui'
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
 *  THE PANEL BORROWS THE PARENT ROW'S COLUMNS — `template`
 *  ------------------------------------------------------------------
 *  This used to be a grid of its own (`1.4fr 1.5fr 1fr auto`), so a company
 *  name began where no header stood, a badge floated between two columns, and
 *  the four counters the parent row right-aligns had nothing under them at
 *  all. Handing the SAME `grid-template-columns` string down puts every child
 *  cell under the header that names it — the four counters included, and that
 *  is where this panel stops being a list and becomes the arithmetic: one tick
 *  per recipient under sent · delivered · opened · bounced, and the ticks in a
 *  column add up to the number the parent row prints above them.
 *
 *  `-mx-1` cancels the `px-1` `DataTable` puts on the panel cell — 4px nobody
 *  can see on its own, and fatal to a column meant to line up.
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
export function WaveRecipients({ runId, template }: { runId: string; template: string }) {
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
    <div className="-mx-1">
      {/* The caption rides the same grid, so it starts under the name column —
          above the names it is counting, not adrift in the left margin. */}
      <div
        className="text-muted-foreground grid items-center gap-3 py-1 text-[11px]"
        style={{ gridTemplateColumns: template }}
      >
        <span />
        <span className="min-w-0 truncate">
          <span className="text-foreground font-medium">{rows.length} người nhận</span> · {opened}{' '}
          đã mở
          {failed > 0 && <span className="text-warning"> · {failed} không tới nơi</span>}
        </span>
      </div>

      <ul className="divide-white/6 divide-y">
        {rows.map((row) => (
          <RecipientLine key={row.leadCode} row={row} template={template} />
        ))}
      </ul>
    </div>
  )
}

function RecipientLine({ row, template }: { row: MailRunRecipientRow; template: string }) {
  const face = deliveryFace(row)

  return (
    <li
      className="grid min-h-11 items-center gap-3 py-2 text-[12px]"
      style={{ gridTemplateColumns: template }}
    >
      {/* `pl-6` lands the lead code under the parent's `#N` chip rather than
          under its disclosure arrow — an indent that says "this belongs to the
          row above" without a rule having to say it. */}
      <span className="flex min-w-0 pl-6">
        <Chip className="truncate">{row.leadCode}</Chip>
      </span>

      <div className="min-w-0">
        <span className="block truncate" title={row.company}>
          {row.company}
        </span>
        <span
          className="text-muted-foreground block truncate text-[11px]"
          title={`${row.email} · ${row.contactName}`}
        >
          {row.email} · {row.contactName}
        </span>
      </div>

      <span className="min-w-0">
        <Badge tone={face.tone}>{face.label}</Badge>
      </span>

      {/* Two lines under the time column, and the second is never both at
          once: a letter that failed has no open signal to report, and a letter
          still reporting signals has no failure to explain. */}
      <div className="min-w-0">
        <span className="block truncate">{face.at ?? '—'}</span>
        <span
          className={cn(
            'block truncate text-[11px]',
            row.failReason ? 'text-warning' : 'text-muted-foreground',
          )}
          title={row.failReason}
        >
          {row.failReason ? (
            <>
              <Icon icon={CircleAlert} size={14} className="mr-1 align-[-2px]" />
              {row.failReason}
            </>
          ) : (
            signalOf(row)
          )}
        </span>
      </div>

      {/* The parent's four counters, one recipient at a time. Each test is the
          one the parent SUMS rather than the nearest-looking one: the arrival
          tick is `deliveredAt`, not `DELIVERED_MAIL` — a letter merely accepted
          by the provider counts as sent and not yet as arrived, and that gap is
          what a reader opens this panel to see. */}
      <Mark on={row.sentAt !== undefined} label="đã gửi" />
      <Mark on={row.deliveredAt !== undefined} label="tới nơi" />
      <Mark on={row.openCount > 0} label="đã mở" />
      <Mark on={Boolean(FAILED_MAIL[row.deliveryState])} label="bounce" warn />
    </li>
  )
}

/** One cell of the tick columns. A middle dot rather than an empty cell, for
 *  the reason `signalOf` writes a sentence: nothing at all reads as data that
 *  has not loaded. `Icon` is `aria-hidden`, so the word reaches a screen reader
 *  through `sr-only` instead. */
function Mark({ on, label, warn }: { on: boolean; label: string; warn?: boolean }) {
  return (
    <span className="flex justify-end">
      <span className="sr-only">{on ? label : `không ${label}`}</span>
      {on ? (
        <Icon icon={Check} size={14} className={warn ? 'text-warning' : 'text-success'} />
      ) : (
        <span aria-hidden="true" className="text-muted-foreground/40">
          ·
        </span>
      )}
    </span>
  )
}

type DeliveryFace = {
  label: string
  tone: 'draft' | 'warning' | 'success' | 'danger'
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
    return { label: 'Không tới nơi', tone: 'danger' }
  }
  if (DELIVERED_MAIL[row.deliveryState]) {
    const at = row.deliveredAt ?? row.sentAt
    return {
      label: row.deliveredAt ? 'Đã tới hộp thư' : 'Đã gửi',
      tone: 'success',
      ...(at ? { at: dmhm(at) } : {}),
    }
  }
  return { label: 'Đang gửi', tone: 'warning' }
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
