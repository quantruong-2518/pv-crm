import { useEffect, useState } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  MailGroupPreflightRequest,
  MailGroupPreflightResponse,
  MailGroupPreviewRequest,
  MailGroupSendRequest,
  MailGroupSendResponse,
  MailRunPatchResponse,
  MailSubjectKind,
  MailSubjectTimelineResponse,
  MasPreviewResponse,
} from '@pv/contracts'
import { api, isApiError, userMessage, type ApiError, type ApiNeed } from '@/app/api'
import { useCan } from '@/app/auth'
import { accountProfileQuery } from '@/data/accounts'
import { leadContactsQuery } from '@/data/contacts'
import { leadProfileQuery } from '@/data/lead-profile'
import { invalidateLeadState } from '@/data/lead-exit'
import { LETTERS_KEY } from '@/data/mas'

/** The group letter of a detail door (G1) — `/sales/mail/letters*`, the
 *  subject's `/letters` activity line (G8) and the creator's own stop door.
 *
 *  No `load:` anywhere: every door here has a real route, so this file is cut
 *  over by construction (`app/api/client.ts`). The `need`s are copied from the
 *  `@Need` of `mail-letter.controller.ts`, `mail-timeline.controller.ts` and
 *  `mas.controller.ts` word for word; the door's template picker is
 *  `doorTemplatesQuery` in `data/mas.ts`.
 *
 *  Preflight and preview are not queries for the reason `data/mas.ts` gives at
 *  `masPreflight`: the key would be the whole list or the whole letter, and a
 *  preflight is perishable. Both run through `useSettledPost`, whose answer is
 *  keyed to the exact request it describes (G2). */

const SEND_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.send-email', scoped: true }

/** One read route per book, each on that book's own view permission (ADR 0004). */
const TIMELINE: Record<MailSubjectKind, { path: string; need: ApiNeed }> = {
  lead: { path: 'leads', need: { branch: 'Sales', permission: 'lead.view', scoped: true } },
  opportunity: {
    path: 'opportunities',
    need: { branch: 'Sales', permission: 'opportunity.view', scoped: true },
  },
  contract: {
    path: 'contracts',
    need: { branch: 'Sales', permission: 'contract.view', scoped: true },
  },
}

/** The letters on one subject's activity line, newest first. Polls only while
 *  one of them is on its way — a letter held for tomorrow must not wake the
 *  browser every five seconds for a day. */
export const subjectLettersQuery = (door: MailSubjectKind, code: string) =>
  queryOptions({
    queryKey: [...LETTERS_KEY, door, code] as const,
    queryFn: ({ signal }) =>
      api.read<MailSubjectTimelineResponse>(
        `/sales/${TIMELINE[door].path}/${encodeURIComponent(code)}/letters`,
        { need: TIMELINE[door].need, signal },
      ),
    refetchInterval: (query) =>
      query.state.data?.rows.some((row) => row.state === 'SENDING') ? 5_000 : false,
  })

/** A contact the To line may name — the fields both source books share. */
export type LetterContact = {
  code: string
  name: string
  email?: string
  leadCode: string
  isPrimary: boolean
}

/** Who the To line may pick from: the whole company when the lead has one
 *  and the reader may open it (the server accepts any contact of the subject's
 *  account), else the lead's own contacts — the book every sender can read.
 *  The account code comes off the lead's object chain, a query the lead and
 *  deal screens already hold. */
export function useLetterContacts(leadCode: string) {
  const profile = useQuery(leadProfileQuery(leadCode))
  const canAccount = useCan('account.view')
  const accountCode = profile.data?.chain.find((link) => link.kind === 'AC')?.code
  const wide = canAccount && accountCode !== undefined
  const account = useQuery({ ...accountProfileQuery(accountCode ?? ''), enabled: wide })
  const lead = useQuery({
    ...leadContactsQuery(leadCode),
    enabled: !wide && !profile.isPending,
  })
  const rows: LetterContact[] | undefined = wide
    ? account.data?.contactRows
    : lead.data?.rows.map((row) => ({
        code: row.code,
        name: row.name,
        ...(row.email ? { email: row.email } : {}),
        leadCode: row.leadCode,
        isPrimary: row.isPrimary,
      }))
  return {
    rows,
    company: profile.data?.company,
    failed: wide ? account.isError : lead.isError,
  }
}

/** Long enough to sit through a burst of picks or a typed word, short enough
 *  that the answer lands before anybody reaches Send. */
const SETTLE_MS = 450

type Settled<T> = { key: string; value?: T; error?: string }

/** One POST re-asked whenever `body` settles, the previous one aborted. The
 *  body IS the key (serialised), so an answer is handed out only while it
 *  describes exactly what is on screen; `last` keeps the previous answer for a
 *  surface that may show it dimmed. `null` body = do not ask. */
function useSettledPost<T>(path: string, body: object | null, fallback: string) {
  const key = body === null ? '' : JSON.stringify(body)
  const [answer, setAnswer] = useState<Settled<T>>()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (key === '') return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      api
        .write<T>(path, {
          method: 'POST',
          body: JSON.parse(key),
          need: SEND_NEED,
          signal: controller.signal,
        })
        .then((value) => {
          if (!controller.signal.aborted) setAnswer({ key, value })
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return
          setAnswer({ key, error: isApiError(cause) ? userMessage(cause) : fallback })
        })
    }, SETTLE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [path, key, fallback, attempt])

  const current = key !== '' && answer?.key === key ? answer : undefined
  return {
    value: current?.value,
    last: answer?.value,
    lastKey: answer?.key,
    error: current?.error ?? '',
    pending: key !== '' && !current,
    retry: () => {
      setAnswer(undefined)
      setAttempt((n) => n + 1)
    },
  }
}

/** Who of these To contacts would receive the letter — `null` while the To
 *  list is empty, which is not a question worth a round trip. */
export function useLetterPreflight(body: MailGroupPreflightRequest | null) {
  const answer = useSettledPost<MailGroupPreflightResponse>(
    '/sales/mail/letters/preflight',
    body,
    'Không kiểm tra được người nhận.',
  )
  return {
    report: answer.value,
    /** Does not depend on the To list, so the previous answer's stands while
     *  the next one is asked — the mailbox line must not blink on every pick. */
    sender: (answer.value ?? answer.last)?.sender,
    error: answer.error,
    checking: answer.pending,
    retry: answer.retry,
  }
}

/** The letter as the server renders it, `{{contactName}}` from the first To. */
export function useLetterPreview(body: MailGroupPreviewRequest | null) {
  const answer = useSettledPost<MasPreviewResponse>(
    '/sales/mail/letters/preview',
    body,
    'Không dựng được bản xem trước.',
  )
  /* The envelope names a mailbox: an answer for the other mailbox must not
     stand in after the choice is toggled. */
  const same = answer.lastKey && JSON.parse(answer.lastKey).transport === body?.transport
  return {
    letter: answer.value ?? (same ? answer.last : undefined),
    error: answer.error,
    pending: answer.pending,
  }
}

/** File the run and queue the one letter. Resolves to QUEUED, never to sent —
 *  see `useMasSend`. A retry carries the same `letterId`, and the server
 *  answers with the run it already filed instead of mailing twice. */
export function useLetterSend() {
  const client = useQueryClient()

  return useMutation<MailGroupSendResponse, ApiError, MailGroupSendRequest>({
    mutationFn: (body) =>
      api.write<MailGroupSendResponse>('/sales/mail/letters', {
        method: 'POST',
        body,
        need: SEND_NEED,
      }),
    onSuccess: (_answer, body) => {
      void client.invalidateQueries({ queryKey: [...LETTERS_KEY, body.door, body.subjectCode] })
      void client.invalidateQueries({ queryKey: ['sales', 'mail-runs'] })
      /* A letter the owner schedules at the lead door is planned care: the
         lead moves to `verifying` (ADR 0063). */
      if (body.door === 'lead' && body.scheduledAt) invalidateLeadState(client)
    },
  })
}

/** G8 — the creator stops their own scheduled letter from its activity line.
 *  `PATCH /sales/mail/runs/:id/own`, on the permission they sent it with. */
export function useOwnLetterCancel() {
  const client = useQueryClient()

  return useMutation<MailRunPatchResponse, ApiError, string>({
    mutationFn: (runId) =>
      api.write<MailRunPatchResponse>(`/sales/mail/runs/${encodeURIComponent(runId)}/own`, {
        method: 'PATCH',
        body: { state: 'CANCELLED' },
        need: SEND_NEED,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: LETTERS_KEY })
      void client.invalidateQueries({ queryKey: ['sales', 'mail-runs'] })
    },
  })
}
