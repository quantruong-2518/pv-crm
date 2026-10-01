import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  FileDrop,
  FileText,
  Icon,
  ImageFrame,
  Modal,
  Skeleton,
  Trash2,
  cn,
  type IconGlyph,
} from '@pv/ui'
import {
  COMM_MAX_AUDIO_BYTES,
  COMM_MAX_FILE_BYTES,
  type CommAttachment,
  type CommAttachmentMime,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dmhm } from '@/lib/date'
import {
  COMM_FILE_EXTENSIONS,
  COMM_FILE_PICK_CAP,
  checkCommFile,
  commFilesQuery,
  fileSizeLabel,
  useAttachCommFile,
  useDeleteCommFile,
} from '@/data/comm-record-detail'

/** Files on one comm record — the drop zone and the list (ADR 0075 §4).
 *
 *  `FileDrop` checks extension and the larger cap; the per-type cap (audio
 *  50 MB, the rest 15 MB, both from the contract) is checked here, because the
 *  drop molecule knows one ceiling and a recording may legitimately be longer
 *  than any document. Recordings are kept forever (ADR 0075 §6), so the only
 *  delete is the owner's, while the record is not done. */

const MB = 1024 * 1024

const CAP_HINT = `Ghi âm tối đa ${COMM_MAX_AUDIO_BYTES / MB} MB · tài liệu và ảnh tối đa ${COMM_MAX_FILE_BYTES / MB} MB.`

export function CommFileDrop({ id }: { id: string }) {
  const attach = useAttachCommFile(id)
  const [problem, setProblem] = useState<string>()

  const pick = (file: File) => {
    setProblem(undefined)
    const verdict = checkCommFile(file)
    if ('problem' in verdict) return setProblem(verdict.problem)
    attach.mutate(
      { file, mime: verdict.mime },
      {
        onSuccess: () => toastDone(`Đã đính kèm ${file.name}`),
        onError: (error) =>
          setProblem(isApiError(error) ? userMessage(error) : 'Không tải được tệp lên. Thử lại.'),
      },
    )
  }

  return (
    <FileDrop
      accept={COMM_FILE_EXTENSIONS}
      maxBytes={COMM_FILE_PICK_CAP}
      onPick={pick}
      busy={attach.isPending}
      error={problem}
      hint={CAP_HINT}
    />
  )
}

const KIND: Record<string, string> = {
  'text/plain': 'Văn bản',
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
}

function kindOf(mime: CommAttachmentMime): { label: string; icon: IconGlyph } {
  if (mime.startsWith('audio/')) return { label: 'Ghi âm', icon: FileText }
  if (mime.startsWith('image/')) return { label: 'Ảnh', icon: ImageFrame }
  return { label: KIND[mime] ?? mime, icon: FileText }
}

export function CommFileList({ id, canDelete }: { id: string; canDelete: boolean }) {
  const { data, isPending, error } = useQuery(commFilesQuery(id))
  const remove = useDeleteCommFile(id)
  const [asking, setAsking] = useState<CommAttachment | null>(null)

  if (isPending) return <Skeleton className="h-24 w-full" />
  if (error) {
    return (
      <p className="text-warning text-[12.5px] leading-[1.6]">
        Không đọc được tệp của lượt liên hệ này. {isApiError(error) ? userMessage(error) : ''}
      </p>
    )
  }
  if (data.rows.length === 0) {
    return <p className="text-muted-foreground text-[12.5px] leading-[1.6]">Chưa có tệp nào.</p>
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {data.rows.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            onDelete={canDelete ? () => setAsking(file) : undefined}
            busy={remove.isPending}
          />
        ))}
        {remove.error && (
          <li role="alert" className="text-warning text-[12px]">
            {userMessage(remove.error)}
          </li>
        )}
      </ul>
      {data.rows.some((file) => file.url === null) && (
        <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.6]">
          Vai của bạn không mở được nội dung tệp, chỉ xem được tên và dung lượng.
        </p>
      )}
      <DeleteConfirm
        file={asking}
        busy={remove.isPending}
        onCancel={() => setAsking(null)}
        onConfirm={(file) => remove.mutate(file.id, { onSuccess: () => setAsking(null) })}
      />
    </>
  )
}

/** Deleting cannot be undone, so it asks once, naming the file. */
function DeleteConfirm({
  file,
  busy,
  onCancel,
  onConfirm,
}: {
  file: CommAttachment | null
  busy: boolean
  onCancel: () => void
  onConfirm: (file: CommAttachment) => void
}) {
  return (
    <Modal
      open={file !== null}
      onClose={onCancel}
      className="h-auto sm:h-auto sm:max-w-[480px]"
      title="Xoá tệp này?"
      subtitle={file?.name}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button size="lg" variant="ghost" type="button" onClick={onCancel}>
            Huỷ
          </Button>
          <Button
            size="lg"
            variant="destructive"
            type="button"
            disabled={busy}
            onClick={() => file && onConfirm(file)}
          >
            Xoá tệp
          </Button>
        </div>
      }
    >
      <p className="text-muted-foreground m-0 text-[13px] leading-[1.6]">
        Tệp bị xoá khỏi lượt liên hệ và không khôi phục được.
      </p>
    </Modal>
  )
}

function FileRow({
  file,
  onDelete,
  busy,
}: {
  file: CommAttachment
  onDelete?: () => void
  busy: boolean
}) {
  const kind = kindOf(file.mime)
  const name =
    'text-foreground pointer-coarse:min-h-12 flex items-center truncate text-[12.5px] font-semibold'
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-md p-2">
      <span className="bg-surface-ink/9 flex size-10 shrink-0 items-center justify-center rounded-md">
        <Icon icon={kind.icon} size={20} className="text-muted-foreground" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {file.url ? (
          /* Presigned and short-lived: opened, never copied anywhere. */
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            title={file.name}
            className={cn(name, 'hover:underline')}
          >
            {file.name}
          </a>
        ) : (
          <span title={file.name} className={name}>
            {file.name}
          </span>
        )}
        <span className="text-muted-foreground tnum truncate text-[11.5px]">
          {kind.label} · {fileSizeLabel(file.bytes)} · {file.createdBy.name} ·{' '}
          {dmhm(file.createdAt)}
        </span>
      </span>
      {onDelete && (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Xoá tệp ${file.name}`}
          className="pointer-coarse:size-12 size-10 px-0"
          disabled={busy}
          onClick={onDelete}
        >
          <Icon icon={Trash2} size={16} />
        </Button>
      )}
    </li>
  )
}
