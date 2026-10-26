import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CommRecordCreateResponse,
  DebriefListResponse,
  DebriefView,
  type CommRecordCreateBody,
  type LeadProfile,
  type MailSubjectKind,
} from '@pv/contracts'
import { api, userMessage, type ApiError } from '@/app/api'
import { toastDone } from '@/app/toast'
import { COMM_RECORDS_KEY, clearCommDraft, commClosed } from '@/data/comm-record-detail'
import { COMM_VIEW_NEED } from '@/data/comms'
import { invalidateLeadState } from '@/data/lead-exit'

/** Comm records on one subject or one workstream run (ADR 0075) — doors listed
 *  in `@pv/contracts` `comms/debrief.ts`; the record page reads its own.
 *
 *  Every key starts with `COMM_RECORDS_KEY`, shared with the record page, so a
 *  write on either side drops the other's copy by prefix. Bare `comm.view`, as
 *  in `data/comms.ts`: the server checks reach on the subject itself. */

/** The comms of every subject in one workstream run — lead, deals, contract.
 *  Under `COMM_RECORDS_KEY` like the subject keys, so a confirm drops it too. */
export const workstreamCommRecordsQuery = (workstreamCode: string) =>
  queryOptions({
    queryKey: [...COMM_RECORDS_KEY, 'workstream', workstreamCode] as const,
    /* Each read files an audit line (who read this content), so it is re-read
       only when a write drops it — not on a clock or a tab switch. */
    staleTime: Infinity,
    queryFn: ({ signal }) =>
      api.read(`/comms/debriefs?workstreamCode=${encodeURIComponent(workstreamCode)}`, {
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

/** The call / chat / mail buttons: an empty record first, the action after
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
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: COMM_RECORDS_KEY })
      /* The record opens a turn on the subject, and a logged turn may move a
         lead to `working` (ADR 0063) — the server decides, the cache follows. */
      invalidateLeadState(client)
      /* Likewise a deal moves to `engaged` on its first logged turn (ADR 0126). */
      void client.invalidateQueries({ queryKey: ['sales', 'ops'] })
      void client.invalidateQueries({ queryKey: ['sales', 'ops-book'] })
    },
  })
}

/** The unreached button: closes an open record for good, with no body. The
 *  cache follows a close, so the record page re-renders as closed. No `retry`,
 *  as for a close: a replay finds it already closed and answers 409. */
export function useMarkCommUnreached() {
  const client = useQueryClient()

  return useMutation<DebriefView, ApiError, string>({
    mutationFn: (id) =>
      api.write(`/comms/debriefs/${encodeURIComponent(id)}/unreached`, {
        method: 'POST',
        need: COMM_VIEW_NEED,
        schema: DebriefView,
      }),
    /* Toast here, not per call: the page re-renders as closed and the dialog
       with it, so a per-call callback would never fire. */
    onSuccess: (view) => {
      commClosed(client, view)
      clearCommDraft(view.id)
      toastDone('Đã đóng lượt liên hệ')
    },
  })
}

/** Where one record opens. The route belongs to the record screen. */
export const commRecordPath = (id: string) => `/comms/${encodeURIComponent(id)}`
export const workstreamCommsPath = (code: string) =>
  `/sales/workstreams/${encodeURIComponent(code)}/comms`

/** How a subject kind is named inside a sentence. */
export const COMM_SUBJECT_NOUN: Record<MailSubjectKind, string> = {
  lead: 'lead',
  opportunity: 'cơ hội',
  contract: 'hợp đồng',
}

/** One wording for "this caller could not confirm a comm here", shared by the
 *  buttons and the dialog so the two never say it differently. */
export const notConfirmableReason = (kind: MailSubjectKind) =>
  `Bạn không xác nhận được lượt liên hệ trên ${COMM_SUBJECT_NOUN[kind]} này.`

/** A lead's own contact person, as the comm buttons take it — no `code`, since
 *  that person has no `sales.contact` row. */
export const leadContactOf = (lead: LeadProfile) => ({
  name: lead.contactName || lead.company,
  title: lead.contactTitle,
  phone: lead.phone,
  email: lead.email,
})
