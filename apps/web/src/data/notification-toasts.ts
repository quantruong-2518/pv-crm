import { NOTIFICATION_KIND_LABEL, type NotificationRow } from '@pv/contracts'
import { toast } from '@/app/toast'

/** Important notifications pop up as toasts (ADR 0093 §3).
 *
 *  The stream carries no rows, so new ones are found by diffing the bell's
 *  first page against a snapshot of ids: `ready` (connect, reconnect, tab
 *  shown) only re-takes the snapshot, `changed` toasts what is new. Ids, never
 *  `createdAt`: one announce shares one timestamp. Only while the stream is
 *  live, so the polling fallback never toasts.
 *
 *  Each tab that saw a row claims its id over a BroadcastChannel; the earliest
 *  claim shows it, so two open windows do not pop the same row twice. */

const MAX_TOASTS = 3
/** Long enough for a sibling tab's claim to arrive, short enough to feel instant. */
const CLAIM_WAIT_MS = 200

let snapshot: { userId: string; ids: Set<string> } | null = null

/** The server's effective value: the admin's switch on `/admin/notifications`,
 *  else the contract default. An overdue installment pops as its own banner
 *  (`contract-overdue-banner.ts`, ADR 0096), so it never toasts too. */
const toasts = (row: NotificationRow) =>
  row.important && row.kind !== 'contract-installment-overdue'

/** `null` forgets it, so the next `changed` only re-takes it. The channel
 *  opens here, not at the first claim: a channel hears only what is posted
 *  after it opens, and `ready` always comes before any `changed`. */
export function snapshotNotifications(userId: string, rows: NotificationRow[] | null) {
  snapshot = rows ? { userId, ids: new Set(rows.map((row) => row.id)) } : null
  if (rows) portFor(userId)
}

/** `open` returns what "Xem" does, or `null` when the reader may not open the
 *  target; the toast then shows without the action. */
export function toastNewNotifications(
  userId: string,
  rows: NotificationRow[],
  live: boolean,
  open: (row: NotificationRow) => (() => void) | null,
) {
  /* No snapshot for this reader yet: every row would look new. */
  if (snapshot?.userId !== userId) return snapshotNotifications(userId, rows)
  const known = snapshot.ids
  const fresh = rows.filter((row) => !known.has(row.id))
  fresh.forEach((row) => known.add(row.id))
  if (!live) return
  /* Rows are newest first: keep the newest three, push the oldest first so the newest lands last. */
  const due = fresh.filter((row) => row.readAt === null && toasts(row)).slice(0, MAX_TOASTS)
  for (const row of due.reverse()) {
    void claim(userId, row.id).then((won) => {
      if (won) show(row, open(row))
    })
  }
}

function show(row: NotificationRow, onOpen: (() => void) | null) {
  toast(NOTIFICATION_KIND_LABEL[row.kind], {
    tone: 'info',
    detail: row.subject.label ?? undefined,
    action: onOpen ? { label: 'Xem', onClick: onOpen } : undefined,
  })
}

type Claim = { id: string; at: number; tab: string }

const TAB = Math.random().toString(36).slice(2)
let channel: { userId: string; port: BroadcastChannel } | null = null
/** The earliest claim another tab made, per id. */
const rivals = new Map<string, Claim>()

const beats = (a: Claim, b: Claim) => a.at < b.at || (a.at === b.at && a.tab < b.tab)

function portFor(userId: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (channel?.userId !== userId) {
    channel?.port.close()
    rivals.clear()
    const port = new BroadcastChannel(`pv-notification-toast:${userId}`)
    port.onmessage = (event: MessageEvent<Claim>) => {
      const prev = rivals.get(event.data.id)
      if (!prev || beats(event.data, prev)) rivals.set(event.data.id, event.data)
    }
    channel = { userId, port }
  }
  return channel.port
}

/** Without BroadcastChannel every tab shows its own: a double toast beats a lost one. */
async function claim(userId: string, id: string): Promise<boolean> {
  const port = portFor(userId)
  if (!port) return true
  if (rivals.has(id)) return false
  const mine: Claim = { id, at: Date.now(), tab: TAB }
  port.postMessage(mine)
  await new Promise((resolve) => window.setTimeout(resolve, CLAIM_WAIT_MS))
  const rival = rivals.get(id)
  return !rival || beats(mine, rival)
}
