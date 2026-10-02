import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Paperclip } from '@pv/ui'
import { Chip, Icon, Skeleton } from '@pv/ui'
import type { LeadAttachment } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { leadAttachmentsQuery } from '@/data/lead-scan'
import { opportunityProfileQuery } from '@/data/opportunities'
import { RunBlock } from './run-block'
import type { RunSubject } from './run-subject'

/** The files block of the run rail (ADR 0078 §1) — one copy for the lead's
 *  scanned files and the deal's paperclip list.
 *
 *  Lead: the scan door's files, each a small thumbnail and a link to its
 *  presigned `url`, opened in a new tab and never copied (it dies within
 *  minutes). No add button: the lead has no upload door outside the scan flow.
 *  Deal: names only until storage is decided (ADR 0077), and no edit button —
 *  the description card's edit button edits files with it, one door. A contract has
 *  no file store: nothing is drawn. */
export function RunFiles({ subject }: { subject: RunSubject }) {
  if (subject.kind === 'lead') return <LeadFiles code={subject.code} />
  if (subject.kind === 'opportunity') return <DealFiles code={subject.code} />
  return null
}

function LeadFiles({ code }: { code: string }) {
  const { data, isPending, error } = useQuery(leadAttachmentsQuery(code))
  const rows = data?.rows ?? []
  const batches = [...new Set(rows.flatMap((r) => (r.batchCode ? [r.batchCode] : [])))]

  return (
    <RunBlock title="Tệp">
      <FilesBody loading={isPending} error={error} empty={rows.length === 0}>
        {rows.map((file) => (
          <li key={file.id} className="min-w-0">
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="motion-std hover:bg-surface-ink/8 pointer-coarse:min-h-12 flex min-w-0 items-center gap-3 rounded-md p-1"
            >
              <span className="bg-surface-ink/9 flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md">
                <Thumb url={file.thumbUrl} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-foreground truncate text-[13px]">{file.name}</span>
                <span className="text-muted-foreground tnum truncate text-[12px]">
                  {fileMeta(file)}
                </span>
              </span>
            </a>
          </li>
        ))}
      </FilesBody>
      {batches.map((batch) => (
        <p key={batch} className="text-muted-foreground m-0 flex items-center gap-2 text-[12px]">
          Nạp cùng lô <Chip>{batch}</Chip>
        </p>
      ))}
    </RunBlock>
  )
}

function DealFiles({ code }: { code: string }) {
  const { data: op, isPending, error } = useQuery(opportunityProfileQuery(code))
  const files = op?.attachments ?? []

  return (
    <RunBlock title="Tệp">
      <FilesBody loading={isPending} error={error} empty={files.length === 0}>
        {files.map((f) => (
          <li key={f.name} className="text-foreground flex min-w-0 items-center gap-2 text-[13px]">
            <Icon icon={Paperclip} size={16} className="text-muted-foreground shrink-0" />
            <span className="min-w-0 break-words">{f.name}</span>
          </li>
        ))}
      </FilesBody>
    </RunBlock>
  )
}

function FilesBody({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean
  error: Error | null
  empty: boolean
  children: ReactNode
}) {
  if (loading) return <Skeleton className="h-16 w-full" />
  if (error) {
    return (
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        Không đọc được tệp. {isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'}
      </p>
    )
  }
  if (empty) {
    return <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">Chưa có tệp nào.</p>
  }
  return <ul className="m-0 flex list-none flex-col gap-2 p-0">{children}</ul>
}

/** "PDF · 1,2 MB · 3 trang" — comma decimal (law 6), never locale-dependent. */
function fileMeta(file: LeadAttachment): string {
  const kind =
    file.mime === 'application/pdf' ? 'PDF' : file.mime.startsWith('image/') ? 'Ảnh' : file.mime
  const mb = file.bytes / 1_048_576
  const size =
    mb >= 1
      ? `${mb.toFixed(1).replace('.', ',')} MB`
      : `${Math.max(1, Math.round(file.bytes / 1024))} KB`
  return [kind, size, file.pages ? `${file.pages} trang` : null].filter(Boolean).join(' · ')
}

/* A thumbnail upload is best-effort, so its object may be missing: fall back. */
function Thumb({ url }: { url: string | null }) {
  const [broken, setBroken] = useState(false)
  return url && !broken ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="size-full object-cover"
      onError={() => setBroken(true)}
    />
  ) : (
    <Icon icon={FileText} size={16} className="text-muted-foreground" />
  )
}
