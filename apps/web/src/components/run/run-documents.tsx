import { useRef, useState } from 'react'
import type { LeadAttachment, WorkstreamDocumentStep } from '@pv/contracts'
import { Button, Drawer, FileText, FileUp, Icon, Skeleton, Trash2, cn } from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { toastFail } from '@/app/toast'
import { fileSizeLabel } from '@/data/comm-record-detail'
import {
  DOCUMENT_EXTENSIONS,
  checkFiles,
  useDeleteDocument,
  useRefreshDocuments,
  useUploadDocument,
  useWorkstreamDocuments,
} from '@/data/workstream-documents'
import { RunBlock } from './run-block'

const NEWEST = 5

/** The run's documents block, the same on the lead, the deal and the contract:
 *  a drop zone, the five newest, and the rest behind a "see more" drawer.
 *  `code` is the WORKSTREAM code. Scanned lead sources share the list, but only
 *  the uploader removes an upload here — a scan file has a batch. */
export function RunDocuments({ workstreamCode }: { workstreamCode: string | null }) {
  const allowed = useCan('workstream.view')
  return allowed && workstreamCode ? <Documents code={workstreamCode} /> : null
}

function Documents({ code }: { code: string }) {
  const { data, isPending, error } = useWorkstreamDocuments(code)
  const [all, setAll] = useState(false)
  const rows = [...(data?.rows ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <RunBlock title="Tài liệu">
      <DropZone code={code} />
      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : error ? (
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
          Không đọc được tài liệu. {isApiError(error) ? userMessage(error) : 'Thử lại.'}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
          Chưa có tài liệu nào.
        </p>
      ) : (
        <>
          <DocList code={code} rows={rows.slice(0, NEWEST)} />
          {rows.length > NEWEST && (
            <Button
              size="sm"
              variant="ghost"
              className="pointer-coarse:h-12 self-start"
              onClick={() => setAll(true)}
            >
              Xem thêm ({rows.length - NEWEST})
            </Button>
          )}
        </>
      )}
      <Drawer
        open={all}
        onClose={() => setAll(false)}
        width="lg"
        title="Tài liệu của hành trình"
        subtitle={`${code} · ${rows.length} tài liệu, mới nhất trước`}
      >
        <DocList code={code} rows={rows} />
      </Drawer>
    </RunBlock>
  )
}

export function DocList({ code, rows }: { code: string; rows: LeadAttachment[] }) {
  const remove = useDeleteDocument(code)
  const me = useSession((st) => st.actor?.id)

  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {rows.map((file) => (
        <li key={file.id} className="flex min-w-0 items-center gap-1">
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="motion-std hover:bg-surface-ink/8 pointer-coarse:min-h-12 flex min-w-0 flex-1 items-center gap-3 rounded-md p-1"
          >
            <span className="bg-surface-ink/9 flex size-10 shrink-0 items-center justify-center rounded-md">
              <Icon icon={FileText} size={16} className="text-muted-foreground" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-foreground truncate text-[13px]">{file.name}</span>
              <span className="text-muted-foreground tnum truncate text-[12px]">
                {fileSizeLabel(file.bytes)} · {file.createdBy.name} · {dayOf(file.createdAt)}
              </span>
            </span>
          </a>
          {!file.batchCode && file.createdBy.id === me && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Xoá ${file.name}`}
              title="Xoá tài liệu"
              className="pointer-coarse:size-12 size-8 shrink-0 px-0"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(file.id, {
                  onError: (e) => toastFail('Không xoá được tài liệu.', userMessage(e)),
                })
              }
            >
              <Icon icon={Trash2} size={16} />
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Many files, one at a time: the contract has no batch door, and a failure
 *  names its own file instead of sinking the rest. `step` tags every upload. */
export function DropZone({ code, step }: { code: string; step?: WorkstreamDocumentStep }) {
  const upload = useUploadDocument(code)
  const refresh = useRefreshDocuments(code)
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const take = async (list: FileList | null) => {
    const picked = Array.from(list ?? [])
    if (picked.length === 0 || busy) return
    setBusy(true)
    const { ok, problems: failed } = checkFiles(picked)
    for (const file of ok) {
      await upload.mutateAsync({ file, step }).catch((e: unknown) => {
        failed.push(`“${file.name}”: ${isApiError(e) ? userMessage(e) : 'không tải lên được.'}`)
      })
    }
    await refresh()
    setProblems(failed)
    setBusy(false)
  }

  return <DropArea busy={busy} problems={problems} onPick={(list) => void take(list)} />
}

/** The drop surface alone, for a caller that decides what to do with the files. */
export function DropArea({
  busy,
  problems,
  onPick,
}: {
  busy: boolean
  problems: string[]
  onPick: (list: FileList | null) => void
}) {
  const picker = useRef<HTMLInputElement>(null)
  const depth = useRef(0)
  const [over, setOver] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragEnter={(e) => {
          e.preventDefault()
          depth.current += 1
          setOver(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1)
          if (depth.current === 0) setOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          depth.current = 0
          setOver(false)
          onPick(e.dataTransfer.files)
        }}
        className={cn(
          'drop-dots motion-std relative flex flex-col items-center gap-2 rounded-lg px-4 py-5 text-center',
          over && 'bg-surface-ink/[4.5%]',
        )}
      >
        <Icon icon={FileUp} size={24} className="text-muted-foreground" />
        <p className="m-0 text-[13px] font-semibold">
          {busy ? 'Đang tải lên…' : over ? 'Thả để tải lên' : 'Kéo thả tài liệu vào đây'}
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12"
          disabled={busy}
          onClick={() => {
            if (picker.current) picker.current.value = ''
            picker.current?.click()
          }}
        >
          Chọn tệp
        </Button>
        <p className="text-muted-foreground m-0 text-[11.5px]">
          PDF, Word, ảnh, văn bản · tối đa 5 MB mỗi tệp
        </p>
        <input
          ref={picker}
          type="file"
          multiple
          accept={DOCUMENT_EXTENSIONS.join(',')}
          onChange={(e) => onPick(e.target.files)}
          className="hidden"
        />
      </div>
      {problems.map((p) => (
        <p
          key={p}
          role="alert"
          className="text-destructive-foreground m-0 text-[12px] leading-[1.5]"
        >
          {p}
        </p>
      ))}
    </div>
  )
}

const dayOf = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
