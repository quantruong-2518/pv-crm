import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LeadAttachmentsResponse,
  WORKSTREAM_DOCUMENT_MAX_BYTES,
  WORKSTREAM_DOCUMENT_MIME,
  WorkstreamDocumentDeclareResponse,
  type WorkstreamDocumentMime,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { sha256Of } from '@/data/comm-record-detail'
import { putOnceMore } from '@/data/lead-scan-run'

/** The documents shelf of a run — contract and doors in
 *  `packages/contracts/src/sales/workstream-document.ts`. Lead, deal and
 *  contract screens read the same list, keyed by the run's code. */
const NEED: ApiNeed = { branch: 'Sales', permission: 'workstream.view', scoped: true }

/** Presigned GETs die within minutes, so the list re-reads itself while open. */
const URL_SAFE_MS = 2 * 60_000
const REFRESH_MS = 5 * 60_000

const keyOf = (code: string) => ['sales', 'workstream-documents', code] as const
const baseOf = (code: string) => `/sales/workstreams/${encodeURIComponent(code)}/documents`

export const workstreamDocumentsQuery = (code: string) =>
  queryOptions({
    queryKey: keyOf(code),
    queryFn: ({ signal }) =>
      api.read(baseOf(code), { need: NEED, schema: LeadAttachmentsResponse, signal }),
    staleTime: URL_SAFE_MS,
    refetchInterval: REFRESH_MS,
  })

const EXTENSION_MIME: Record<string, WorkstreamDocumentMime> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

export const DOCUMENT_EXTENSIONS = Object.keys(EXTENSION_MIME)
export const DOCUMENT_MAX_BYTES = WORKSTREAM_DOCUMENT_MAX_BYTES

/** The wire mime of a picked file, from its type or else its extension. */
export function documentMimeOf(file: File): WorkstreamDocumentMime | null {
  const typed = WORKSTREAM_DOCUMENT_MIME.find((m) => m === file.type)
  if (typed) return typed
  const dot = file.name.lastIndexOf('.')
  return dot < 0 ? null : (EXTENSION_MIME[file.name.slice(dot).toLowerCase()] ?? null)
}

export const useWorkstreamDocuments = (code: string) => useQuery(workstreamDocumentsQuery(code))

/** `uploaded` is called only after the PUT landed, so a PUT that failed leaves
 *  an unlinked row for the sweeper rather than a document with no bytes. */
export function useUploadDocument(code: string) {
  return useMutation<void, ApiError, File>({
    mutationFn: async (file) => {
      const mime = documentMimeOf(file)
      if (!mime) throw new Error('Không nhận loại tệp này.')
      const declared = await api.write(baseOf(code), {
        body: { name: file.name, mime, bytes: file.size, sha256: await sha256Of(file) },
        need: NEED,
        schema: WorkstreamDocumentDeclareResponse,
      })
      await putOnceMore(declared.putUrl, file, mime)
      await api.write(`${baseOf(code)}/${encodeURIComponent(declared.id)}/uploaded`, {
        need: NEED,
      })
    },
  })
}

export const useRefreshDocuments = (code: string) => {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: keyOf(code) })
}

export function useDeleteDocument(code: string) {
  const client = useQueryClient()

  return useMutation<void, ApiError, string>({
    mutationFn: (id) =>
      api.write<void>(`${baseOf(code)}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        need: NEED,
      }),
    onSettled: () => client.invalidateQueries({ queryKey: keyOf(code) }),
  })
}
