import { useEffect } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LeadAttachmentsResponse,
  LeadScanCommitResponse,
  LeadScanCreateResponse,
  LeadScanResponse,
  LeadScanStartResponse,
  type LeadScanCreateBody,
  type ScanBatchState,
} from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'

/** Module 2 · the SCAN door of the lead book — card photos and profile PDFs.
 *
 *  Contract and endpoint list: `packages/contracts/src/sales/lead-scan.ts`.
 *  This file owns the paths, the permission each asks, the polling rule and
 *  the cache a finished batch invalidates. Bytes never pass through here —
 *  they go straight to presigned URLs from `lead-scan-run.ts`.
 *
 *  POLLING, ONLY WHILE THE SERVER IS MOVING: `UPLOADING`, `READING` and
 *  `COMMITTING` change on their own; `READY` waits for a person and `DONE` /
 *  `FAILED` never change again, so polling there is load for nothing. */

/** The whole door writes into the book, so every call asks the write right —
 *  the same stance `lead-import.ts` takes for its dry run. */
const SCAN_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.edit' }

/** A lead's files follow the lead's own read fence, scope included. */
const ATTACHMENTS_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.view', scoped: true }

/** Same prefix `lead-import.ts` invalidates — page and facets both hang under it. */
const LEAD_BOOK_KEY = ['sales', 'lead-book'] as const

const POLL_MS = 2000
const MOVING: ReadonlySet<ScanBatchState> = new Set(['UPLOADING', 'READING', 'COMMITTING'])

const scanPath = (code: string) => `/sales/leads/scan/${encodeURIComponent(code)}`

export const scanBatchKey = (code: string) => ['sales', 'lead-scan', code] as const

export const scanBatchQuery = (code: string) =>
  queryOptions({
    queryKey: scanBatchKey(code),
    queryFn: ({ signal }) =>
      api.read(scanPath(code), { need: SCAN_NEED, schema: LeadScanResponse, signal }),
    refetchInterval: (query) =>
      query.state.data && MOVING.has(query.state.data.state) ? POLL_MS : false,
  })

/** The batch, polled while it moves; refreshes the lead book once it is DONE. */
export function useScanBatch(code: string) {
  const client = useQueryClient()
  const batch = useQuery({ ...scanBatchQuery(code), enabled: code !== '' })
  const done = batch.data?.state === 'DONE'
  useEffect(() => {
    if (done) void client.invalidateQueries({ queryKey: LEAD_BOOK_KEY })
  }, [done, client])
  return batch
}

export const createScanBatch = (body: LeadScanCreateBody) =>
  api.write('/sales/leads/scan', { body, need: SCAN_NEED, schema: LeadScanCreateResponse })

export const startScanBatch = (code: string, files: string[]) =>
  api.write(`${scanPath(code)}/start`, {
    body: { files },
    need: SCAN_NEED,
    schema: LeadScanStartResponse,
  })

/** 202 then poll: the refetch right after flips the batch to `COMMITTING`,
 *  which is what switches polling back on. */
export function useCommitScan(code: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.write(`${scanPath(code)}/commit`, { need: SCAN_NEED, schema: LeadScanCommitResponse }),
    onSuccess: () => client.invalidateQueries({ queryKey: scanBatchKey(code) }),
  })
}

/** The URLs inside are presigned GETs that die in about ten minutes, so the
 *  list goes stale well before them and re-reads itself while the card is open. */
const ATTACHMENT_URL_SAFE_MS = 2 * 60_000
const ATTACHMENT_REFRESH_MS = 5 * 60_000

export const leadAttachmentsQuery = (code: string) =>
  queryOptions({
    queryKey: ['sales', 'lead-attachments', code] as const,
    queryFn: ({ signal }) =>
      api.read(`/sales/leads/${encodeURIComponent(code)}/attachments`, {
        need: ATTACHMENTS_NEED,
        schema: LeadAttachmentsResponse,
        signal,
      }),
    staleTime: ATTACHMENT_URL_SAFE_MS,
    refetchInterval: ATTACHMENT_REFRESH_MS,
  })
