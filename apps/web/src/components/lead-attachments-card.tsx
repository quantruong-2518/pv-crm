import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Chip, FileText, GlassCard, Icon, MetaPill, SectionTitle, Skeleton } from '@pv/ui'
import type { LeadAttachment } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { leadAttachmentsQuery } from '@/data/lead-scan'

/** The source files hanging on one lead — card photos and profile PDFs from
 *  the scan door, for now the only door that attaches anything.
 *
 *  Links open the presigned `url` in a new tab and are never copied anywhere:
 *  they die within minutes, which is why the query re-reads itself
 *  (`leadAttachmentsQuery`). An empty lead gets a sentence, not an
 *  `EmptyState` — there is no button here that attaches a file. */
export function LeadAttachmentsCard({ code }: { code: string }) {
  const { data, isPending, error } = useQuery(leadAttachmentsQuery(code))
  const rows = data?.rows ?? []
  const batches = [...new Set(rows.flatMap((r) => (r.batchCode ? [r.batchCode] : [])))]

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Tệp đính kèm">
      <SectionTitle
        size="detail"
        actions={
          data && (
            <MetaPill mono className="tnum">
              {rows.length}
            </MetaPill>
          )
        }
      >
        Tệp đính kèm
      </SectionTitle>

      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : error ? (
        <p className="text-warning text-[12.5px] leading-[1.6]">
          Không đọc được tệp của lead này.{' '}
          {isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
          Chưa có tệp nào. Ảnh danh thiếp và hồ sơ nạp qua “Nạp từ ảnh” sẽ nằm ở đây.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {rows.map((file) => (
            <li key={file.id} className="min-w-0">
              <AttachmentTile file={file} />
            </li>
          ))}
        </ul>
      )}

      {batches.map((batch) => (
        <p key={batch} className="text-muted-foreground flex items-center gap-2 text-[12px]">
          Nạp cùng lô <Chip>{batch}</Chip>
        </p>
      ))}
    </GlassCard>
  )
}

function AttachmentTile({ file }: { file: LeadAttachment }) {
  const kind =
    file.mime === 'application/pdf' ? 'PDF' : file.mime.startsWith('image/') ? 'Ảnh' : file.mime
  const meta = [kind, sizeLabel(file.bytes), file.pages ? `${file.pages} trang` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      title={file.name}
      className="motion-std hover:bg-surface-ink/8 flex flex-col gap-2 rounded-md p-1"
    >
      <span className="bg-surface-ink/9 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md">
        <Thumb url={file.thumbUrl} />
      </span>
      <span className="truncate text-[12px] font-semibold">{file.name}</span>
      <span className="text-muted-foreground tnum truncate text-[11.5px]">{meta}</span>
    </a>
  )
}

/** "1,2 MB" · "340 KB" — comma decimal (law 6), never locale-dependent. */
function sizeLabel(bytes: number): string {
  const mb = bytes / 1_048_576
  return mb >= 1
    ? `${mb.toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
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
    <Icon icon={FileText} size={26} className="text-muted-foreground" />
  )
}
