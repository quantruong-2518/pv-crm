import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, GlassCard, Icon, cn } from '@pv/ui'
import type { DebriefView, MessageRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { dmhm } from '@/lib/date'
import { CommFileDrop, CommFileList } from '@/components/comm-files'
import { exchangesCount, filesCount } from '@/data/comm-ai-report'
import { commFilesQuery, commNoun, fileSizeLabel } from '@/data/comm-record-detail'
import { threadMessagesQuery } from '@/data/comms'

/** The right column of the fill form: what the call itself holds, apart from what
 *  the owner writes. Turns and files stay folded behind their counts. On a phone
 *  the whole panel folds to one line at the end of the form. */

const hasText = (row: MessageRow) =>
  row.content.state === 'hidden' ||
  (row.content.state === 'visible' && row.content.bodyText.trim() !== '')

export function CommCallPanel({ record, minutes }: { record: DebriefView; minutes: ReactNode }) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const files = useQuery(commFilesQuery(record.id))
  const turns = useQuery(threadMessagesQuery(record.threadId))
  const rows = files.data?.rows ?? []
  const audio = rows.filter((file) => file.mime.startsWith('audio/'))
  const spoken = (turns.data?.rows ?? []).filter(hasText).reverse()
  const noun = commNoun(record.channel, lang)
  const title = noun.charAt(0).toUpperCase() + noun.slice(1)
  const turnCount = t(exchangesCount(spoken.length))
  const fileCount = t(filesCount(rows.length))
  /* Recordings play in their own rows above, so the folded list is for the rest. */
  const others = rows.some((file) => !file.mime.startsWith('audio/'))

  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col p-5 sm:p-6" aria-label={title}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="pointer-coarse:min-h-12 motion-std flex min-w-0 items-center justify-between gap-3 text-left lg:hidden"
      >
        <span className="tnum min-w-0 truncate text-[13px] font-medium">
          {title} · {turnCount} · {fileCount}
        </span>
        <Icon icon={ChevronDown} size={16} className={cn(open && 'rotate-180')} />
      </button>
      <div className={cn('flex min-w-0 flex-col gap-5', !open && 'max-lg:hidden', open && 'pt-4')}>
        <h2 className="m-0 text-[16px] font-semibold leading-[1.5] max-lg:hidden">{title}</h2>
        {audio.map((file) => (
          <div key={file.id} className="flex min-w-0 flex-col gap-2">
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
        {turns.error && (
          <Problem
            text={t(
              message(
                'Không tải được các lượt trao đổi.',
                'Could not load the exchanges.',
                '대화 내역을 불러오지 못했습니다.',
              ),
            )}
            error={turns.error}
          />
        )}
        {files.error && (
          <Problem
            text={t(
              message(
                'Không đọc được tệp.',
                'Could not read the files.',
                '파일을 읽지 못했습니다.',
              ),
            )}
            error={files.error}
          />
        )}
        {spoken.length > 0 && (
          <Fold label={turnCount}>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {spoken.map((row) => (
                <li key={row.id} className="flex flex-col gap-1">
                  <span className="text-muted-foreground tnum text-[12px]">{dmhm(row.at)}</span>
                  <p className="m-0 whitespace-pre-wrap break-words text-[13px] leading-[1.6]">
                    {row.content.state === 'visible'
                      ? row.content.bodyText
                      : t(
                          message(
                            'Vai của bạn không xem được nội dung lượt này.',
                            'Your role cannot view the content of this exchange.',
                            '현재 역할로는 이 대화의 내용을 볼 수 없습니다.',
                          ),
                        )}
                  </p>
                </li>
              ))}
            </ul>
          </Fold>
        )}
        {others && (
          <Fold label={fileCount}>
            <CommFileList id={record.id} canDelete />
          </Fold>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-[13px] font-medium">
            {t(message('Thêm ghi âm hoặc tệp', 'Add a recording or file', '녹음 또는 파일 추가'))}
            <span className="text-muted-foreground tnum font-normal">
              {' '}
              · {t(message('không bắt buộc', 'optional', '선택 사항'))}
            </span>
          </span>
          <CommFileDrop id={record.id} />
        </div>
        {minutes}
      </div>
    </GlassCard>
  )
}

function Problem({ text, error }: { text: string; error: unknown }) {
  return (
    <p role="alert" className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]">
      {text} {isApiError(error) ? userMessage(error) : ''}
    </p>
  )
}

/** A row that opens: its count is the label. */
function Fold({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="pointer-coarse:min-h-12 motion-std flex min-h-8 min-w-0 items-center justify-between gap-3 text-left text-[14px]"
      >
        <span className="tnum">{label}</span>
        <Icon icon={ChevronDown} size={16} className={cn(open && 'rotate-180')} />
      </button>
      {open && children}
    </div>
  )
}
