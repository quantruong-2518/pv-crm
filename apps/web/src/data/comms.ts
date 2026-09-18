import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { Phone, type IconGlyph } from '@pv/ui'
import type {
  CommsChannel,
  IdentityListResponse,
  MessageCreate,
  MessageCreateResponse,
  ThreadListResponse,
  ThreadMessagesResponse,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'
import { invalidateLeadState } from '@/data/lead-exit'

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

const VIEW_NEED: ApiNeed = { permission: 'comm.view' }

/** The identity book sits behind a DIFFERENT permission from the conversation
 *  book, and that is deliberate rather than an omission: `comm.capture-manage`
 *  belongs to the marketing seat (plus the two seats holding everything).
 *  Mislinking one address silently re-files somebody else's conversation, so
 *  the book is not opened to everyone who may log a turn. The visible
 *  consequence is on the card: it has to SAY why the capture button is absent
 *  instead of hiding it. */
const IDENTITY_NEED: ApiNeed = { permission: 'comm.capture-manage' }

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
        need: VIEW_NEED,
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
        { need: VIEW_NEED, signal },
      ),
    enabled: threadId !== null,
  })

/** Look a person up in the identity book BY ADDRESS — the only filter that
 *  book has.
 *
 *  Not by `objectCode`, because `IdentityQuery` carries no such axis. Pulling
 *  the first page and filtering in the browser would, for any book longer than
 *  one page, let the screen claim a lead has no identity while its row sits on
 *  page two — the single most damaging false sentence a capture form can say,
 *  since it sends the user off to create a duplicate. So the filter runs on
 *  the server and the screen only asks what it can actually ask.
 *
 *  `paged()` carries `total`, so the caller can say "there are more, type
 *  something narrower" instead of quietly cutting the tail off. */
export const identitySearchQuery = (address: string) =>
  queryOptions({
    queryKey: [...COMMS_KEY, 'identities', address] as const,
    queryFn: ({ signal }) =>
      api.read<IdentityListResponse>(`/comms/identities?address=${encodeURIComponent(address)}`, {
        need: IDENTITY_NEED,
        signal,
      }),
    enabled: address.length > 0,
  })

/** Log one turn by hand. 201 answers with BOTH halves (`MessageCreateResponse`).
 *
 *  No `retry`, and do not add one: a call logged twice is two rows nothing can
 *  tell apart, and `mayReplay` already refuses to replay a POST that touched
 *  the wire. Stopping a PERSON's second press is the form's job (`isPending`).
 *
 *  `onSuccess` drops the whole thread list for the object rather than patching
 *  one row: `messageCount` and `lastAt` are properties of the thread, not of
 *  the turn, and `thread: 'new'` mints a header there was no row to patch. One
 *  extra read is cheaper than a count that lies. */
export function useCaptureMessage(objectCode: string) {
  const client = useQueryClient()

  return useMutation<MessageCreateResponse, ApiError, MessageCreate>({
    mutationFn: (body) =>
      api.write<MessageCreateResponse>('/comms/messages', {
        method: 'POST',
        body,
        need: VIEW_NEED,
      }),
    onSuccess: (written) => {
      void client.invalidateQueries({ queryKey: [...COMMS_KEY, 'threads', objectCode] })
      void client.invalidateQueries({ queryKey: [...COMMS_KEY, 'messages', written.thread.id] })
      /* A logged call by the owner moves the lead to `verifying` (ADR 0058). */
      invalidateLeadState(client)
    },
  })
}

/** One picture per channel. Four members borrow the sales department's own
 *  send-channel table so a channel looks the same everywhere in the app, plus
 *  the one member that table has no room for.
 *
 *  `CommsChannel` is wider than `WaveChannel` by exactly `phone` and narrower
 *  by the three POSTING channels (LinkedIn, Facebook, Website). The two unions
 *  answer two different questions — which road the system sends down, and which
 *  road a conversation actually happened on — so they can be borrowed from but
 *  not merged. */
export const COMMS_CHANNEL_ICON: Record<CommsChannel, IconGlyph> = {
  email: CHANNEL_ICON.email,
  'zalo-oa': CHANNEL_ICON['zalo-oa'],
  telegram: CHANNEL_ICON.telegram,
  'in-app': CHANNEL_ICON['in-app'],
  phone: Phone,
}

export const COMMS_CHANNEL_LABEL: Record<CommsChannel, string> = {
  email: CHANNEL_LABEL.email,
  'zalo-oa': CHANNEL_LABEL['zalo-oa'],
  telegram: CHANNEL_LABEL.telegram,
  'in-app': CHANNEL_LABEL['in-app'],
  phone: 'Điện thoại',
}

export const COMMS_CHANNELS = Object.keys(COMMS_CHANNEL_LABEL) as CommsChannel[]
