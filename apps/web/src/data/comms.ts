import { queryOptions } from '@tanstack/react-query'
import { Phone, Users, type IconGlyph } from '@pv/ui'
import {
  type ThreadChannel,
  type ThreadListResponse,
  type ThreadMessagesResponse,
} from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'

/** The conversation book — the four doors under `/comms`, turn 1 of `comms`.
 *
 *  NO `load:`. All four have a real route on `apps/api`, and an absent `load`
 *  is the ritual that cuts a query over to the server (`app/api/client.ts`).
 *
 *  ------------------------------------------------------------------
 *  NO `branch` AND NO `scoped`, COPIED WORD FOR WORD OFF `@Need(...)`
 *  ------------------------------------------------------------------
 *  `thread.controller.ts` declares a bare `comm.view` on all four doors: a
 *  conversation with a supplier is this same table the day Supply opens, so
 *  naming a branch here would license the book to Sales and lock it against
 *  every branch after. The branch axis still runs — E2 reads it off the OBJECT
 *  a thread hangs on, server-side.
 *
 *  `scoped` is absent because `comms.thread` has no owner column to cut by;
 *  the scope fence stands on the `platform.object` row the thread hangs on. A
 *  flag no repository reads would be a promise pointing at nothing.
 *
 *  ------------------------------------------------------------------
 *  `comm.view-content` APPEARS NOWHERE IN THIS FILE
 *  ------------------------------------------------------------------
 *  The second permission does not decide whether a call is allowed — it decides
 *  which branch of `MessageContent` comes back. Declaring it in a `need` would
 *  refuse the manager who is entitled to the turn COUNT and not to the words.
 *  The server already answered with `state: 'hidden'`; the screen draws that
 *  answer rather than asking E2 a second time and risking a different one. */

export const COMM_VIEW_NEED: ApiNeed = { permission: 'comm.view' }

/** Key prefix for the whole module, so one write can drop exactly its part. */
export const COMMS_KEY = ['comms'] as const

/** The threads hanging on ONE object, each carrying its own `messageCount`.
 *
 *  `objectCode` is IN the `queryKey` — the trap `leadProfileQuery` documents:
 *  a key that forgets the code paints the conversation of the customer just
 *  viewed onto the next customer's profile. Here that is not a refresh glitch,
 *  it is content leaking between two real companies. */
export const objectThreadsQuery = (objectCode: string) =>
  queryOptions({
    queryKey: [...COMMS_KEY, 'threads', objectCode] as const,
    queryFn: ({ signal }) =>
      api.read<ThreadListResponse>(`/comms/threads?objectCode=${encodeURIComponent(objectCode)}`, {
        need: COMM_VIEW_NEED,
        signal,
      }),
  })

/** The turns inside one thread. `null` means no thread is open, and `enabled`
 *  keeps the read from firing until somebody actually opens one.
 *
 *  A read that reveals a body writes one `platform.audit` line server-side
 *  (§5c), so firing it unconditionally would foul the very log built to answer
 *  "who read my customer's conversation". */
export const threadMessagesQuery = (threadId: string | null) =>
  queryOptions({
    queryKey: [...COMMS_KEY, 'messages', threadId] as const,
    queryFn: ({ signal }) =>
      api.read<ThreadMessagesResponse>(
        `/comms/threads/${encodeURIComponent(threadId ?? '')}/messages`,
        { need: COMM_VIEW_NEED, signal },
      ),
    enabled: threadId !== null,
  })

/** One picture per channel. Four members borrow the sales department's own
 *  send-channel table so a channel looks the same everywhere in the app, plus
 *  the one member that table has no room for.
 *
 *  `CommsChannel` is wider than `WaveChannel` by exactly `phone` and narrower
 *  by the three POSTING channels (LinkedIn, Facebook, Website). The two unions
 *  answer two different questions — which road the system sends down, and which
 *  road a conversation actually happened on — so they can be borrowed from but
 *  not merged. */
export const COMMS_CHANNEL_ICON: Record<ThreadChannel, IconGlyph> = {
  email: CHANNEL_ICON.email,
  'zalo-oa': CHANNEL_ICON['zalo-oa'],
  telegram: CHANNEL_ICON.telegram,
  'in-app': CHANNEL_ICON['in-app'],
  phone: Phone,
  meeting: Users,
}

export const COMMS_CHANNEL_LABEL: Record<ThreadChannel, string> = {
  email: CHANNEL_LABEL.email,
  /* Not the send table's "Zalo OA": a comm on this key is mostly a person's
     own Zalo opened from a contact row, and naming it OA would misstate it. */
  'zalo-oa': 'Zalo',
  telegram: CHANNEL_LABEL.telegram,
  'in-app': CHANNEL_LABEL['in-app'],
  phone: 'Điện thoại',
  meeting: 'Gặp mặt',
}
