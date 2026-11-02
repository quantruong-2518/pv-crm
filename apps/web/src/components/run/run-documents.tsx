import { useRef, useState } from 'react'
import type { LeadAttachment, WorkstreamDocumentStep } from '@pv/contracts'
import { Button, Drawer, FileText, FileUp, Icon, Skeleton, Trash2, cn } from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { toastFail } from '@/app/toast'
import { dm } from '@/lib/date'
import { fileSizeLabel } from '@/data/comm-record-detail'
import {
  DOCUMENT_EXTENSIONS,
  checkFiles,
  useDeleteDocument,
  useRefreshDocuments,
  useUploadDocument,
  useWorkstreamDocuments,
} from '@/data/workstream-documents'
import { DocumentPreview } from './document-preview'
import { RunBlock } from './run-block'

const NEWEST = 5

/** The run's documents block, the same on the lead, the deal and the contract:
 *  a drop zone, the five newest, and the rest behind a "see more" drawer.
 *  `code` is the WORKSTREAM code. Scanned lead sources share the list, but only
 *  the uploader removes an upload here — a scan file has a batch. */
export function RunDocuments({
  workstreamCode,
  canEdit,
  contractCode,
}: {
  workstreamCode: string | null
  /** Only an explicit `false` shuts the drop zone and the remove buttons. */
  canEdit?: boolean
  /** On a contract page: uploads are tagged to it, so a closer's file lands on
   *  the contract they may write (ADR 0110). */
  contractCode?: string
}) {
  const allowed = useCan('workstream.view')
  return allowed && workstreamCode ? (
    <Documents code={workstreamCode} writable={canEdit !== false} contractCode={contractCode} />
  ) : null
}

function Documents({
  code,
  writable,
  contractCode,
}: {
  code: string
  writable: boolean
  contractCode?: string
}) {
  const { t } = useI18n()
  const { data, isPending, error } = useWorkstreamDocuments(code)
  const [all, setAll] = useState(false)
  const rows = [...(data?.rows ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <RunBlock title={t(message('Tài liệu', 'Documents', '문서'))}>
      {writable && (
        <DropZone
          code={code}
          step={contractCode ? { kind: 'contract', contractCode } : undefined}
        />
      )}
      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : error ? (
        <p className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]">
          {t(
            message(
              'Không đọc được tài liệu.',
              'Could not read the documents.',
              '문서를 불러오지 못했습니다.',
            ),
          )}{' '}
          {isApiError(error)
            ? userMessage(error)
            : t(message('Thử lại.', 'Try again.', '다시 시도해 주세요.'))}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
          {t(message('Chưa có tài liệu nào.', 'No documents yet.', '아직 문서가 없습니다.'))}
        </p>
      ) : (
        <>
          <DocList code={code} rows={rows.slice(0, NEWEST)} canRemove={writable} />
          {rows.length > NEWEST && (
            <Button
              size="sm"
              variant="ghost"
              className="pointer-coarse:h-12 self-start"
              onClick={() => setAll(true)}
            >
              {t(
                message(
                  `Xem thêm (${rows.length - NEWEST})`,
                  `Show more (${rows.length - NEWEST})`,
                  `더 보기 (${rows.length - NEWEST})`,
                ),
              )}
            </Button>
          )}
        </>
      )}
      <Drawer
        open={all}
        onClose={() => setAll(false)}
        width="lg"
        title={t(message('Tài liệu của hành trình', 'Journey documents', '진행 문서'))}
        subtitle={t(
          message(
            `${code} · ${rows.length} tài liệu, mới nhất trước`,
            `${code} · ${rows.length} documents, newest first`,
            `${code} · 문서 ${rows.length}건, 최신순`,
          ),
        )}
      >
        <DocList code={code} rows={rows} canRemove={writable} />
      </Drawer>
    </RunBlock>
  )
}

export function DocList({
  code,
  rows,
  canRemove = true,
}: {
  code: string
  rows: LeadAttachment[]
  canRemove?: boolean
}) {
  const { t } = useI18n()
  const remove = useDeleteDocument(code)
  const me = useSession((st) => st.actor?.id)
  const [openId, setOpenId] = useState<string | null>(null)
  // Looked up by id, so a list refetch hands the open preview its fresh link.
  const open = rows.find((file) => file.id === openId) ?? null

  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {rows.map((file) => (
        <li key={file.id} className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setOpenId(file.id)}
            className="motion-std hover:bg-surface-ink/8 pointer-coarse:min-h-12 flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left"
          >
            <span className="bg-surface-ink/9 flex size-10 shrink-0 items-center justify-center rounded-md">
              <Icon icon={FileText} size={16} className="text-muted-foreground" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-foreground truncate text-[13px]">{file.name}</span>
              <span className="text-muted-foreground tnum truncate text-[12px]">
                {metaOf(file)}
              </span>
            </span>
          </button>
          {canRemove && !file.batchCode && file.createdBy.id === me && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={t(
                message(`Xoá ${file.name}`, `Delete ${file.name}`, `${file.name} 삭제`),
              )}
              title={t(message('Xoá tài liệu', 'Delete document', '문서 삭제'))}
              className="pointer-coarse:size-12 size-8 shrink-0 px-0"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(file.id, {
                  onError: (e) =>
                    toastFail(
                      t(
                        message(
                          'Không xoá được tài liệu.',
                          'Could not delete the document.',
                          '문서를 삭제하지 못했습니다.',
                        ),
                      ),
                      userMessage(e),
                    ),
                })
              }
            >
              <Icon icon={Trash2} size={16} />
            </Button>
          )}
        </li>
      ))}
      <DocumentPreview
        file={open}
        subtitle={open ? metaOf(open) : undefined}
        onClose={() => setOpenId(null)}
      />
    </ul>
  )
}

const metaOf = (file: LeadAttachment) =>
  `${fileSizeLabel(file.bytes)} · ${file.createdBy.name} · ${dm(file.createdAt)}`

/** Many files, one at a time: the contract has no batch door, and a failure
 *  names its own file instead of sinking the rest. `step` tags every upload. */
export function DropZone({ code, step }: { code: string; step?: WorkstreamDocumentStep }) {
  const { t } = useI18n()
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
        failed.push(
          `“${file.name}”: ${isApiError(e) ? userMessage(e) : t(message('không tải lên được.', 'could not be uploaded.', '업로드하지 못했습니다.'))}`,
        )
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
  const { t } = useI18n()
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
          {busy
            ? t(message('Đang tải lên…', 'Uploading…', '업로드 중…'))
            : over
              ? t(message('Thả để tải lên', 'Drop to upload', '놓으면 업로드됩니다'))
              : t(
                  message(
                    'Kéo thả tài liệu vào đây',
                    'Drag documents here',
                    '여기로 문서를 끌어 놓으세요',
                  ),
                )}
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
          {t(message('Chọn tệp', 'Choose files', '파일 선택'))}
        </Button>
        <p className="text-muted-foreground m-0 text-[11.5px]">
          {t(
            message(
              'PDF, Word, Excel, ảnh, ghi âm, văn bản · ghi âm tối đa 50 MB, tệp khác 5 MB',
              'PDF, Word, Excel, images, recordings, text · recordings up to 50 MB, other files 5 MB',
              'PDF, Word, Excel, 이미지, 녹음, 텍스트 · 녹음 최대 50 MB, 기타 파일 5 MB',
            ),
          )}
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
