import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, FileDrop, Icon, Modal, Skeleton, Trash2, cn } from '@pv/ui'
import { COMM_MAX_AUDIO_BYTES, COMM_MAX_FILE_BYTES, type CommAttachment } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dmhm } from '@/lib/date'
import { message, translate, useI18n, type Lang } from '@/app/i18n'
import {
  COMM_FILE_EXTENSIONS,
  COMM_FILE_PICK_CAP,
  checkCommFile,
  commFileKindOf,
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
 *  delete is the owner's: while the record is open, or while editing it (ADR 0122). */

const MB = 1024 * 1024

const capHint = (lang: Lang) => {
  const audio = COMM_MAX_AUDIO_BYTES / MB
  const other = COMM_MAX_FILE_BYTES / MB
  return translate(
    message(
      `Ghi âm tối đa ${audio} MB, tệp khác tối đa ${other} MB.`,
      `Recordings up to ${audio} MB, other files up to ${other} MB.`,
      `녹음은 최대 ${audio}MB, 다른 파일은 최대 ${other}MB입니다.`,
    ),
    lang,
  )
}

export function CommFileDrop({ id }: { id: string }) {
  const { t, lang } = useI18n()
  const attach = useAttachCommFile(id)
  const [problem, setProblem] = useState<string>()

  const pick = (file: File) => {
    setProblem(undefined)
    const verdict = checkCommFile(file, lang)
    if ('problem' in verdict) return setProblem(verdict.problem)
    attach.mutate(
      { file, mime: verdict.mime },
      {
        onSuccess: () =>
          toastDone(
            t(message(`Đã đính kèm ${file.name}`, `Attached ${file.name}`, `${file.name} 첨부됨`)),
          ),
        onError: (error) =>
          setProblem(
            isApiError(error)
              ? userMessage(error)
              : t(
                  message(
                    'Không tải được tệp lên. Thử lại.',
                    'Could not upload the file. Try again.',
                    '파일을 업로드하지 못했습니다. 다시 시도해 주세요.',
                  ),
                ),
          ),
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
      hint={capHint(lang)}
    />
  )
}

/** The files of a record in the owner's form, each deletable by them. */
export function CommFileList({ id, canDelete }: { id: string; canDelete: boolean }) {
  const { t } = useI18n()
  const { data, isPending, error } = useQuery(commFilesQuery(id))
  const remove = useDeleteCommFile(id)
  const [asking, setAsking] = useState<CommAttachment | null>(null)

  if (isPending) return <Skeleton className="h-24 w-full" />
  if (error) {
    return (
      <p className="text-destructive-foreground text-[12.5px] leading-[1.6]">
        {t(message('Không đọc được tệp.', 'Could not read the files.', '파일을 읽지 못했습니다.'))}{' '}
        {isApiError(error) ? userMessage(error) : ''}
      </p>
    )
  }
  /* It sits under the drop zone, which already says there is room for one. */
  if (data.rows.length === 0) return null

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
          <li role="alert" className="text-destructive-foreground text-[12px]">
            {userMessage(remove.error)}
          </li>
        )}
      </ul>
      {data.rows.some((file) => file.url === null) && (
        <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.6]">
          {t(
            message(
              'Bạn chỉ xem được tên và dung lượng tệp.',
              'You can only see file names and sizes.',
              '파일 이름과 용량만 볼 수 있습니다.',
            ),
          )}
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
  const { t } = useI18n()
  return (
    <Modal
      open={file !== null}
      onClose={onCancel}
      className="h-auto sm:h-auto sm:max-w-[480px]"
      title={t(message('Xoá tệp này?', 'Delete this file?', '이 파일을 삭제할까요?'))}
      subtitle={file?.name}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button size="lg" variant="ghost" type="button" onClick={onCancel}>
            {t(message('Huỷ', 'Cancel', '취소'))}
          </Button>
          <Button
            size="lg"
            variant="destructive"
            type="button"
            disabled={busy}
            onClick={() => file && onConfirm(file)}
          >
            {t(message('Xoá tệp', 'Delete file', '파일 삭제'))}
          </Button>
        </div>
      }
    >
      <p className="text-muted-foreground m-0 text-[13px] leading-[1.6]">
        {t(
          message(
            'Xoá rồi không khôi phục được.',
            'A deleted file cannot be restored.',
            '삭제한 파일은 복구할 수 없습니다.',
          ),
        )}
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
  const { t, lang } = useI18n()
  const kind = commFileKindOf(file.mime, lang)
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
          type="button"
          size="sm"
          variant="ghost"
          aria-label={t(
            message(`Xoá tệp ${file.name}`, `Delete file ${file.name}`, `${file.name} 파일 삭제`),
          )}
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
