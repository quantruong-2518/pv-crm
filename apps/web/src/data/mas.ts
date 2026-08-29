import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  LeadMailTimelineResponse,
  MailTemplateListResponse,
  MasPreflightResponse,
  MasSendRequest,
  MasSendResponse,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** Module 5 · MAS mail — the four doors the compose panel and the lead
 *  timeline call. `/sales/mail/*` plus one lead-side read.
 *
 *  ------------------------------------------------------------------
 *  NO `load:` ON ANY OF THE FOUR — THESE ARE CUT OVER
 *  ------------------------------------------------------------------
 *  Every door here has a real route on `apps/api`, so none of them carries a
 *  frozen fixture. Dropping `load` IS the ritual that cuts a query to the
 *  server (`app/api/client.ts`), and a fixture behind a route that exists would
 *  be a second answer nobody could tell from the first. The five queries still
 *  reading fixtures are listed in `docs/fix-later.md`; these are not among them.
 *
 *  ------------------------------------------------------------------
 *  THREE PERMISSIONS, ONE PER QUESTION THE DOOR ACTUALLY ASKS
 *  ------------------------------------------------------------------
 *  | Door                | `need`                                   |
 *  | ------------------- | ---------------------------------------- |
 *  | templates           | `chiến-dịch.xem`                         |
 *  | preflight · send    | `lead.gửi-mail` · scoped                 |
 *  | lead timeline       | `lead.xem` · scoped                      |
 *
 *  The server also carries `PATCH /sales/mail/runs/:id` (cancel a batch, needs
 *  `chiến-dịch.bắn`). It is deliberately NOT wired here: the only screen that
 *  could reach it is a run list, and no screen reads the run list yet. A query
 *  no component calls is a permission declaration nobody maintains.
 *
 *  Spelled to match `@Need(...)` on the server word for word, so a route whose
 *  scope axis is on and a query that forgot it can be spotted by diffing two
 *  lines. On this side the flag cuts nothing — the browser has no rows to cut
 *  and must never be what decides — it exists so the two declarations read the
 *  same. The fence that holds is `requireAccess`, plus the server's own guard.
 *
 *  ------------------------------------------------------------------
 *  WHAT THIS FILE REFUSES TO DO
 *  ------------------------------------------------------------------
 *  It never caches a preflight. The whole point of that endpoint is that the
 *  answer decays — a hard bounce can land between the preview and the send —
 *  and a `queryOptions` with a `staleTime` would put a photograph on screen
 *  under a heading that promises a fact. See `masPreflight`. */

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

const TEMPLATES_NEED: ApiNeed = { branch: 'Sales', permission: 'chiến-dịch.xem' }
const SEND_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.gửi-mail', scoped: true }
const TIMELINE_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.xem', scoped: true }

/** Prefix of every mail-timeline key, so one send can invalidate all of them
 *  without knowing which leads it just wrote to. */
export const LEAD_MAIL_KEY = ['sales', 'lead-mail'] as const

/** The picker's catalogue. `GET /sales/mail/templates`.
 *
 *  Long `staleTime`: a template list is a handful of rows a human edits by
 *  hand, months apart, and the panel opens and closes many times in one
 *  session. Refetching it on every open would be a request per click for an
 *  answer that has not changed since the deployment.
 *
 *  Not `queryOptions(() => …)` of anything — the catalogue takes no argument.
 *  It is the same list for every caller, which is exactly why the endpoint is
 *  not `scoped`: a template belongs to the department, not to a person. */
export const masTemplatesQuery = queryOptions({
  queryKey: ['sales', 'mail-templates'] as const,
  queryFn: ({ signal }) =>
    api.read<MailTemplateListResponse>('/sales/mail/templates', {
      need: TEMPLATES_NEED,
      signal,
    }),
  staleTime: 10 * 60 * 1000,
})

/** Who would actually receive this. `POST /sales/mail/preflight`.
 *
 *  ------------------------------------------------------------------
 *  A FUNCTION, NOT A QUERY, AND THAT IS THE DESIGN
 *  ------------------------------------------------------------------
 *  Three reasons it is not wrapped in `queryOptions`, in order of weight:
 *
 *   · The answer is perishable. It reports who is blocked, and an address can
 *     hard-bounce between this call and the send. TanStack would hold the old
 *     verdict under a heading that says "3 bị chặn" while a fourth has just
 *     been added. The server re-runs the whole decision inside the transaction
 *     that writes the rows precisely because this reading cannot be trusted —
 *     caching it in the browser as well would be a third copy of a fact that
 *     already has two.
 *   · The key would be the audience, and an audience is up to 200 codes. Every
 *     tick of a checkbox mints a new key and leaves the old entry in the cache.
 *   · It is a `POST` only because 200 codes do not fit in a query string, and
 *     `mayReplay` will not replay a POST that reached the wire. A read that
 *     cannot be retried does not behave like a query and should not look like
 *     one.
 *
 *  So the panel calls this once per step transition and holds the answer in its
 *  own state, where its lifetime is obvious: it lives as long as the panel. */
export function masPreflight(
  leadCodes: readonly string[],
  signal?: AbortSignal,
): Promise<MasPreflightResponse> {
  return api.write<MasPreflightResponse>('/sales/mail/preflight', {
    method: 'POST',
    body: { leadCodes: [...leadCodes] },
    need: SEND_NEED,
    signal,
  })
}

/** Open a batch and hand it to the queue. `POST /sales/mail/runs`.
 *
 *  ------------------------------------------------------------------
 *  THIS RESOLVES TO "QUEUED", NOT TO "SENT" — NOTHING HERE MAY SAY OTHERWISE
 *  ------------------------------------------------------------------
 *  The 201 means N rows were written to the ledger. A worker polls every twelve
 *  seconds and mail leaves the building seconds to minutes later. Any caller
 *  printing "Đã gửi" on this promise is printing something that has not
 *  happened yet, and then has no word left for the letter that bounces.
 *  `MasSendResponse.queued` is the honest number and it is the SERVER's, not a
 *  count of what was picked: the audience is judged again inside the write.
 *
 *  ------------------------------------------------------------------
 *  WHAT `onSuccess` INVALIDATES, AND WHY IT IS ONE PREFIX
 *  ------------------------------------------------------------------
 *  Every lead in the batch now has one more entry on its mail timeline, and
 *  this mutation does not know which lead's card is on screen. Invalidating the
 *  whole `['sales','lead-mail']` prefix costs one refetch of the one timeline
 *  actually mounted, and gets it right without threading the audience through
 *  to a cache key. The run list is not touched here — no screen reads it yet.
 *
 *  No retry, and none should be added: `mayReplay` already refuses to replay a
 *  POST that reached the wire. That refusal is what the run id exists to make
 *  survivable — a genuinely repeated request collides on `event_key` and
 *  reports `queued: 0` rather than mailing everybody twice — but a second
 *  automatic attempt would still be a second batch on the screen. Guarding the
 *  second HUMAN click is the panel's job (`isPending`). */
export function useMasSend() {
  const client = useQueryClient()

  return useMutation<MasSendResponse, ApiError, MasSendRequest>({
    mutationFn: (body) =>
      api.write<MasSendResponse>('/sales/mail/runs', {
        method: 'POST',
        body,
        need: SEND_NEED,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: LEAD_MAIL_KEY })
    },
  })
}

/** One lead's whole mail history. `GET /sales/leads/:code/mail`.
 *
 *  A FUNCTION of the code, and `code` is inside `queryKey` — same rule as
 *  `leadProfileQuery`: a timeline is not one value but one value per lead, and
 *  a key that forgot the code would draw the previous lead's letters on the
 *  next lead opened. On a card that says "đã gửi 3 lá thư" that is not a
 *  refresh bug, it is a wrong sentence about a real customer.
 *
 *  Not paged, because the endpoint is not: see `LeadMailTimelineResponse`. */
export const leadMailTimelineQuery = (code: string) =>
  queryOptions({
    queryKey: [...LEAD_MAIL_KEY, code] as const,
    queryFn: ({ signal }) =>
      api.read<LeadMailTimelineResponse>(`/sales/leads/${encodeURIComponent(code)}/mail`, {
        need: TIMELINE_NEED,
        signal,
      }),
    /* Chỉ theo dõi sát khi worker đang thực sự xử lý đợt gửi. Một đợt hẹn cho
       ngày mai không được đánh thức trình duyệt mỗi 5 giây suốt một ngày. */
    refetchInterval: (query) =>
      query.state.data?.rows.some(
        (row) =>
          row.runState === 'SENDING' ||
          row.deliveryState === 'sending' ||
          row.deliveryState === 'delayed',
      )
        ? 5_000
        : false,
  })
