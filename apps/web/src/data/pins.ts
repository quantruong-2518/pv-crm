import { useEffect } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  PIN_MAX,
  PinListResponse,
  PinSetResponse,
  type PinSetBody,
  type PinSubject,
} from '@pv/contracts'
import { api, isApiError, userMessage, type ApiError, type ApiNeed } from '@/app/api'
import { useSession } from '@/app/auth'
import { dropLegacyPins, legacyPinsOf } from '@/app/desk'
import { toastFail } from '@/app/toast'
import { OPPORTUNITY_BOOK_KEY } from './opportunities'

/** The caller's own pins — `GET /pins?subject=` and `POST /pins`. They lived in
 *  this browser (`app/desk.ts`) until 08/10, so a pin made on one machine was
 *  missing on the next. Each subject declares its book's view permission, the
 *  same `need` every sibling read of that book declares.
 *
 *  The books list pins through their own `pinned` filter, so a pin change makes
 *  the book's PAGE stale; counts and facets do not take `pinned` and keep. */

const PIN_NEED: Record<PinSubject, ApiNeed> = {
  lead: { branch: 'Sales', permission: 'lead.view' },
  opportunity: { branch: 'Sales', permission: 'opportunity.view' },
}

const BOOK_PAGE_KEY: Record<PinSubject, readonly string[]> = {
  lead: ['sales', 'lead-book', 'page'],
  opportunity: [...OPPORTUNITY_BOOK_KEY, 'page'],
}

const SUBJECT_NOUN: Record<PinSubject, string> = { lead: 'lead', opportunity: 'cơ hội' }

const NO_CODES: readonly string[] = []

export const pinsQuery = (subject: PinSubject) =>
  queryOptions({
    queryKey: ['pins', subject] as const,
    queryFn: ({ signal }) =>
      api.read<PinListResponse>(`/pins?subject=${subject}`, {
        need: PIN_NEED[subject],
        schema: PinListResponse,
        signal,
      }),
  })

/** Codes pinned by the signed-in person, newest pin first. */
export function usePins(subject: PinSubject): { codes: readonly string[] } {
  useLegacyPinMove(subject)
  const { data } = useQuery(pinsQuery(subject))
  return { codes: data?.codes ?? NO_CODES }
}

type SetPins = { codes: readonly string[]; pinned: boolean }

/** Idempotent set, drawn at once: the list is patched before the server answers
 *  and put back if it refuses. */
export function useSetPins(subject: PinSubject) {
  const client = useQueryClient()
  const { queryKey } = pinsQuery(subject)

  return useMutation<PinSetResponse, ApiError, SetPins, { before?: PinListResponse }>({
    mutationFn: ({ codes, pinned }) =>
      api.write<PinSetResponse>('/pins', {
        method: 'POST',
        body: { subject, codes: [...codes], pinned } satisfies PinSetBody,
        need: PIN_NEED[subject],
        schema: PinSetResponse,
      }),
    onMutate: async ({ codes, pinned }) => {
      await client.cancelQueries({ queryKey })
      const before = client.getQueryData(queryKey)
      const kept = (before?.codes ?? []).filter((code) => !codes.includes(code))
      client.setQueryData(queryKey, { codes: pinned ? [...codes, ...kept] : kept })
      return { before }
    },
    onError: (_error, _input, context) => client.setQueryData(queryKey, context?.before),
    onSettled: () => {
      void client.invalidateQueries({ queryKey })
      void client.invalidateQueries({ queryKey: BOOK_PAGE_KEY[subject] })
    },
  })
}

/** One record's pin, shared by the row's button and the lead profile's menu. */
export function usePinToggle(subject: PinSubject, code: string) {
  const client = useQueryClient()
  const pinned = usePins(subject).codes.includes(code)
  const setPins = useSetPins(subject)
  const toggle = () =>
    setPins.mutate(
      { codes: [code], pinned: !pinned },
      {
        /* A pin the server skipped (no reach on that record) is a refusal, not a no-op. */
        onSuccess: ({ changed }) => {
          if (pinned || changed.includes(code)) return
          client.setQueryData<PinListResponse>(pinsQuery(subject).queryKey, (list) => ({
            codes: (list?.codes ?? []).filter((c) => c !== code),
          }))
          toastFail(`Không ghim được ${SUBJECT_NOUN[subject]} này.`)
        },
        onError: (error) =>
          toastFail(
            `Không ${pinned ? 'bỏ ghim' : 'ghim'} được.`,
            isApiError(error) ? userMessage(error) : undefined,
          ),
      },
    )
  return { pinned, toggle }
}

/** Actors whose browser pins were already offered this page load — every row's
 *  pin cell mounts this hook, and one send per load is enough. */
const moved = new Set<string>()

/** One-time move of the pins an older build kept in this browser (lead pins
 *  only — the desk never pinned anything else). Tried once per page load; a
 *  refused send keeps them locally for the next load rather than losing them
 *  (a 409 included — nothing here retries within the load). Only the codes
 *  sent are dropped, so pins older than `PIN_MAX` stay local. */
function useLegacyPinMove(subject: PinSubject) {
  const client = useQueryClient()
  const actorId = useSession((s) => s.actor?.id)

  useEffect(() => {
    if (subject !== 'lead' || !actorId || moved.has(actorId)) return
    moved.add(actorId)
    const codes = legacyPinsOf(actorId)
    if (codes.length === 0) return
    /* The contract caps one set at `PIN_MAX`; the newest local pins are the last ones. */
    const sent = codes.slice(-PIN_MAX)
    const body: PinSetBody = { subject, codes: sent, pinned: true }
    api
      .write<PinSetResponse>('/pins', { method: 'POST', body, need: PIN_NEED[subject] })
      .then(() => {
        dropLegacyPins(actorId, sent)
        void client.invalidateQueries({ queryKey: pinsQuery(subject).queryKey })
        void client.invalidateQueries({ queryKey: BOOK_PAGE_KEY[subject] })
      })
      .catch(() => undefined)
  }, [subject, actorId, client])
}
