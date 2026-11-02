import { useQuery } from '@tanstack/react-query'
import { Icon, Separator, Skeleton, cn } from '@pv/ui'
import type { CommAttachment } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { commFileKindOf, commFilesQuery, fileSizeLabel } from '@/data/comm-record-detail'
import { STEP_LABEL } from './comm-next-step-fields'

/** The files of a record on the read view — confirmed, unreached, or open and
 *  seen by somebody other than its owner: a recording plays in place, the rest
 *  open in a new tab. Nothing at all when there are none, and the rule above it
 *  goes too. Presigned links are short-lived: opened, never copied. */
export function CommFileShowcase({ id }: { id: string }) {
  const { t } = useI18n()
  const { data, isPending } = useQuery(commFilesQuery(id))
  if (isPending) return <Skeleton className="h-16 w-full" />
  const rows = data?.rows ?? []
  if (rows.length === 0) return null
  const audio = rows.filter((file) => file.mime.startsWith('audio/'))
  const other = rows.filter((file) => !file.mime.startsWith('audio/'))

  return (
    <>
      <Separator />
      <div className="flex min-w-0 flex-col gap-3">
        <span className={STEP_LABEL}>
          {t(message('Ghi âm và tệp đính kèm', 'Recordings and attachments', '녹음 및 첨부 파일'))}{' '}
          <span className="text-muted-foreground font-normal">
            ·{' '}
            {t(
              message(
                `${rows.length} tệp`,
                `${rows.length} ${rows.length === 1 ? 'file' : 'files'}`,
                `파일 ${rows.length}개`,
              ),
            )}
          </span>
        </span>
        {audio.map((file) => (
          <div key={file.id} className="bg-muted flex min-w-0 flex-col gap-2 rounded-lg p-3">
            <span className="flex min-w-0 items-center justify-between gap-3">
              <span title={file.name} className="min-w-0 truncate text-[13px] font-medium">
                {file.name}
              </span>
              <span className="text-muted-foreground tnum shrink-0 text-[12px]">
                {fileSizeLabel(file.bytes)}
              </span>
            </span>
            {file.url && (
              <audio controls preload="metadata" src={file.url} className="w-full">
                <track kind="captions" />
              </audio>
            )}
          </div>
        ))}
        {other.length > 0 && (
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {other.map((file) => (
              <li key={file.id} className="min-w-0">
                <FileTile file={file} />
              </li>
            ))}
          </ul>
        )}
        {rows.some((file) => file.url === null) && (
          <p className="text-muted-foreground m-0 text-[12px] leading-[1.6]">
            {t(
              message(
                'Bạn chỉ xem được tên và dung lượng tệp.',
                'You can only see file names and sizes.',
                '파일 이름과 용량만 볼 수 있습니다.',
              ),
            )}
          </p>
        )}
      </div>
    </>
  )
}

function FileTile({ file }: { file: CommAttachment }) {
  const { lang } = useI18n()
  const kind = commFileKindOf(file.mime, lang)
  const body = (
    <>
      <span className="bg-surface-ink/9 flex size-10 shrink-0 items-center justify-center rounded-md">
        <Icon icon={kind.icon} size={20} className="text-muted-foreground" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span title={file.name} className="truncate text-[13px] font-medium">
          {file.name}
        </span>
        <span className="text-muted-foreground tnum text-[12px]">
          {kind.label} · {fileSizeLabel(file.bytes)}
        </span>
      </span>
    </>
  )
  const tile =
    'bg-muted text-foreground pointer-coarse:min-h-12 flex min-w-0 items-center gap-3 rounded-lg p-2 pr-3 no-underline'
  return file.url ? (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(tile, 'motion-std hover:bg-surface-ink/9')}
    >
      {body}
    </a>
  ) : (
    <span className={tile}>{body}</span>
  )
}
