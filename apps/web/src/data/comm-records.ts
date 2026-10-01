import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CommRecordCreateResponse,
  DebriefListResponse,
  type CommRecordCreateBody,
  type LeadProfile,
  type TouchSubject,
} from '@pv/contracts'
import { api, userMessage, type ApiError } from '@/app/api'
import { COMM_RECORDS_KEY } from '@/data/comm-record-detail'
import { COMMS_KEY, COMM_VIEW_NEED } from '@/data/comms'
import { invalidateLeadState } from '@/data/lead-exit'

/** Comm records on one lead or opportunity (ADR 0075) — two of the doors listed
 *  in `@pv/contracts` `comms/debrief.ts`; the record page reads its own.
 *
 *  Every key starts with `COMM_RECORDS_KEY`, shared with the record page, so a
 *  write on either side drops the other's copy by prefix. Bare `comm.view`, as
 *  in `data/comms.ts`: the server checks reach on the subject itself. */

/** The object's comm timeline. The code is in the key: a key without it would
 *  paint one customer's calls onto the next profile opened. */
export const subjectCommRecordsQuery = (subjectCode: string) =>
  queryOptions({
    queryKey: [...COMM_RECORDS_KEY, 'subject', subjectCode] as const,
    queryFn: ({ signal }) =>
      api.read(`/comms/debriefs?subjectCode=${encodeURIComponent(subjectCode)}`, {
        need: COMM_VIEW_NEED,
        signal,
        schema: DebriefListResponse,
      }),
  })

/** The same list without summaries (`summary=none`): rows, states and threads
 *  only, and no audit line — for counts and joins, where nobody reads content. */
export const subjectCommIndexQuery = (subjectCode: string) =>
  queryOptions({
    queryKey: [...COMM_RECORDS_KEY, 'subject-index', subjectCode] as const,
    queryFn: ({ signal }) =>
      api.read(`/comms/debriefs?subjectCode=${encodeURIComponent(subjectCode)}&summary=none`, {
        need: COMM_VIEW_NEED,
        signal,
        schema: DebriefListResponse,
      }),
  })

/** Why a create was refused. The server words its 403 (cannot confirm here),
 *  409 (mailbox owned by someone else) and 400 (contact) itself, and a canned
 *  permission line would hide which of the three it was. */
export const commCreateFailure = (error: ApiError): string =>
  error.serverTitle ?? userMessage(error)

/** The call / Zalo / mail buttons: an empty record first, the action after
 *  201. No `retry` — a second POST is a second record nothing can tell apart. */
export function useCreateCommRecord() {
  const client = useQueryClient()

  return useMutation<CommRecordCreateResponse, ApiError, CommRecordCreateBody>({
    mutationFn: (body) =>
      api.write('/comms/debriefs', {
        method: 'POST',
        body,
        need: COMM_VIEW_NEED,
        schema: CommRecordCreateResponse,
      }),
    onSuccess: (_written, body) => {
      void client.invalidateQueries({ queryKey: COMM_RECORDS_KEY })
      void client.invalidateQueries({ queryKey: [...COMMS_KEY, 'threads', body.subjectCode] })
      /* The record opens a turn on the subject, and a logged turn may move a
         lead to `working` (ADR 0063) — the server decides, the cache follows. */
      invalidateLeadState(client)
    },
  })
}

/** Where one record opens. The route belongs to the record screen. */
export const commRecordPath = (id: string) => `/comms/${encodeURIComponent(id)}`

/** How a subject kind is named inside a sentence. */
export const COMM_SUBJECT_NOUN: Record<TouchSubject, string> = {
  lead: 'lead',
  opportunity: 'cơ hội',
}

/** One wording for "this caller could not confirm a comm here", shared by the
 *  buttons and the dialog so the two never say it differently. */
export const notConfirmableReason = (kind: TouchSubject) =>
  `Bạn không xác nhận được lượt liên hệ trên ${COMM_SUBJECT_NOUN[kind]} này, nên không ghi lại ở đây được.`

/** A lead's own contact person, as the comm buttons take it — no `code`, since
 *  that person has no `sales.contact` row. */
export const leadContactOf = (lead: LeadProfile) => ({
  name: lead.contactName || lead.company,
  title: lead.contactTitle,
  phone: lead.phone,
  email: lead.email,
})
