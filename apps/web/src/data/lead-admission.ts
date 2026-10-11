import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LeadAdmissionCheckResponse,
  type AdmissionChoice,
  type AdmissionMatch,
  type LeadAdmissionCheckBody,
  type LeadCreate,
} from '@pv/contracts'
import { api, userMessage, type ApiError, type ApiNeed } from '@/app/api'
import { useCreateLead } from '@/data/lead-create'

/** Module 2 · the admission gate as the hand-typed door meets it.
 *
 *      POST /sales/leads/admission/check    `lead.edit` · read-only
 *
 *  The form asks first and creates second: any verdict but `new-account` stops
 *  at a panel, and the create then carries what the person was shown (`seen`)
 *  so the server can refuse if the book moved in between.
 *
 *  A 409 is answered by asking AGAIN, never by reading the refusal's body: the
 *  error layer does not carry it, and a fresh read is the designed path. The
 *  create is never replayed on its own — a second lead nobody chose is the
 *  very thing this gate exists to stop. */

const CHECK_PATH = '/sales/leads/admission/check'

/** Same words as `@Need` on the check route; no `scoped`, as on the create. */
const CHECK_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.edit' }

export function checkAdmission(body: LeadAdmissionCheckBody): Promise<AdmissionMatch> {
  return api.write<AdmissionMatch>(CHECK_PATH, {
    method: 'POST',
    body,
    need: CHECK_NEED,
    schema: LeadAdmissionCheckResponse,
  })
}

/** Built from the PARSED create body, so the gate compares the same normalised
 *  values the create would store. The manual form holds exactly one person. */
const checkBodyOf = (lead: LeadCreate): LeadAdmissionCheckBody => ({
  company: lead.company,
  taxCode: lead.taxCode,
  people: [{ contactName: lead.contactName, email: lead.email, phone: lead.phone }],
})

export type AdmissionAction = AdmissionChoice['action']

/** What the panel draws: the match, and whether it replaced an older one. */
export type AdmissionPanel = { match: AdmissionMatch; bookChanged: boolean }

type Held = AdmissionPanel & { body: LeadCreate }

export function useLeadAdmission(on: {
  /** The lead that was created, or the one that received the person. */
  done: (code: string) => void
  /** `message` is the sentence to print; `error.errors` may name boxes. */
  refused: (error: ApiError, message: string) => void
  /** A panel went up and nothing was written. */
  stopped: () => void
}) {
  const client = useQueryClient()
  const create = useCreateLead()
  const check = useMutation<AdmissionMatch, ApiError, LeadAdmissionCheckBody>({
    mutationFn: checkAdmission,
  })
  const [held, setHeld] = useState<Held | null>(null)
  /* Bumped whenever the form changes: an answer about a form that no longer
     exists must not put a panel up. */
  const turn = useRef(0)

  const ask = (body: LeadCreate, conflict?: ApiError) => {
    const asked = turn.current
    check.mutate(checkBodyOf(body), {
      onSuccess: (match) => {
        if (turn.current !== asked) return on.stopped()
        if (match.verdict !== 'new-account') {
          setHeld({ body, match, bookChanged: conflict !== undefined })
          return on.stopped()
        }
        /* A 409 the gate does not explain was about something else: say the
           server's sentence and stop rather than create behind the refusal. */
        if (conflict) {
          setHeld(null)
          return on.refused(conflict, userMessage(conflict))
        }
        send(body)
      },
      onError: (error) => on.refused(error, userMessage(error)),
    })
  }

  const send = (body: LeadCreate, admission?: AdmissionChoice) =>
    create.mutate(admission ? { ...body, admission } : body, {
      onSuccess: (lead) => {
        if (admission?.action === 'add-contact') {
          /* The lead already existed, so its cached profile is now stale. */
          void client.invalidateQueries({ queryKey: ['sales', 'leads', lead.code] })
          void client.invalidateQueries({ queryKey: ['sales', 'lead-profile', lead.code] })
          void client.invalidateQueries({ queryKey: ['sales', 'lead-touches', lead.code] })
        }
        on.done(lead.code)
      },
      onError: (error) => {
        if (error.kind === 'conflict') return ask(body, error)
        /* The gate's own 403 says who to turn to; `userMessage` would replace
           it with the generic permission line. */
        const own = admission && error.kind === 'forbidden' ? error.serverTitle : undefined
        on.refused(error, own ?? userMessage(error))
      },
    })

  return {
    panel: held as AdmissionPanel | null,
    pending: check.isPending || create.isPending,
    /** Submit: ask the gate, create only on `new-account`. */
    start: (body: LeadCreate) => ask(body),
    /** A button on the panel: create with what the person was shown. */
    choose: (action: AdmissionAction) => {
      if (!held) return
      const { body, match } = held
      send(body, {
        action,
        seen: {
          verdict: match.verdict,
          leadCode: match.lead?.code,
          accountCode: match.account?.code,
        },
      })
    },
    /** The form changed under the panel, so what was seen no longer holds. */
    clear: () => {
      turn.current += 1
      setHeld(null)
    },
  }
}
