import { useRef, useState } from 'react'
import { Button, FileUp, Icon, Smartphone, cn } from '@pv/ui'
import { message, useI18n } from '@/app/i18n'

/** The multi-file drop zone of the scan door, and the one-file picker a
 *  failed row uses to replace its file.
 *
 *  Not `FileDrop` from `@pv/ui`: that one takes exactly ONE file and owns its
 *  copy and its single button, while a scan batch is a whole set of files with a
 *  second, camera-only picker. The edge is `.drop-dots` — the same borderless
 *  drag-drop signifier `FileDrop` draws (law 4). A multi-file `FileDrop` is
 *  the shared request that retires this file.
 *
 *  Checks nothing: every file goes to `onFiles`, which screens and explains. */

function open(input: HTMLInputElement | null) {
  if (!input) return
  /* Cleared first, or re-picking the same files fires no `change`. */
  input.value = ''
  input.click()
}

export function ScanDropZone({
  accept,
  captureAccept,
  footnote,
  onFiles,
}: {
  accept: string
  captureAccept: string
  footnote: string
  onFiles: (files: File[]) => void
}) {
  const picker = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const { t } = useI18n()
  const [over, setOver] = useState(false)
  /* Counted, not toggled: crossing a child fires the parent's `dragleave`. */
  const depth = useRef(0)

  const take = (list: FileList | null) => {
    if (list && list.length > 0) onFiles(Array.from(list))
  }

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault()
        depth.current += 1
        setOver(true)
      }}
      onDragOver={(e) => {
        /* Without this the browser opens the file in the tab and the page is gone. */
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
        take(e.dataTransfer.files)
      }}
      className={cn(
        'drop-dots motion-std relative flex flex-col items-center gap-4 rounded-lg px-4 py-12 text-center',
        over ? 'glass-ai' : 'bg-surface-ink/[4.5%]',
      )}
    >
      <Icon
        icon={FileUp}
        size={64}
        className={over ? 'text-accent-foreground' : 'text-muted-foreground opacity-60'}
      />
      <div className="flex flex-col gap-2">
        <p className="text-[15px] font-semibold">
          {over
            ? t(message('Thả để tải lên', 'Drop to upload', '놓아서 업로드'))
            : t(
                message(
                  'Kéo thả tệp vào đây',
                  'Drag and drop files here',
                  '파일을 여기로 끌어다 놓으세요',
                ),
              )}
        </p>
        <p className="text-muted-foreground text-[12.5px]">
          {t(
            message(
              'Danh thiếp, ảnh chụp, PDF hồ sơ. Thả được nhiều tệp một lần.',
              'Business cards, photos, PDF profiles. You can drop several files at once.',
              '명함, 사진, PDF 자료. 여러 파일을 한 번에 놓을 수 있습니다.',
            ),
          )}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="md" className="pointer-coarse:h-12" onClick={() => open(picker.current)}>
          {t(message('Chọn tệp', 'Choose files', '파일 선택'))}
        </Button>
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={() => open(camera.current)}
        >
          <Icon icon={Smartphone} size={16} />
          {t(message('Chụp bằng điện thoại', 'Take a photo with your phone', '휴대폰으로 촬영'))}
        </Button>
      </div>
      <p className="text-muted-foreground text-[11.5px]">{footnote}</p>

      <input
        ref={picker}
        type="file"
        multiple
        accept={accept}
        onChange={(e) => take(e.target.files)}
        className="hidden"
      />
      <input
        ref={camera}
        type="file"
        accept={captureAccept}
        capture="environment"
        onChange={(e) => take(e.target.files)}
        className="hidden"
      />
    </div>
  )
}

/** One file for one failed row to replace its file: the same two pickers, single-select. */
export function ScanReplacePicker({
  accept,
  captureAccept,
  name,
  onFile,
}: {
  accept: string
  captureAccept: string
  /** The file being replaced — names both buttons for a screen reader. */
  name: string
  onFile: (file: File) => void
}) {
  const { t } = useI18n()
  const picker = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const take = (list: FileList | null) => {
    const file = list?.[0]
    if (file) onFile(file)
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        className="pointer-coarse:h-12"
        aria-label={t(message(`Thay ${name}`, `Replace ${name}`, `${name} 교체`))}
        onClick={() => open(picker.current)}
      >
        {t(message('Thay tệp', 'Replace file', '파일 교체'))}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={t(
          message(
            `Chụp ảnh thay cho ${name}`,
            `Take a photo to replace ${name}`,
            `${name} 대신 사진 촬영`,
          ),
        )}
        title={t(message('Chụp ảnh thay', 'Take a replacement photo', '교체할 사진 촬영'))}
        className="pointer-coarse:size-12 size-8 px-0"
        onClick={() => open(camera.current)}
      >
        <Icon icon={Smartphone} size={16} />
      </Button>
      <input
        ref={picker}
        type="file"
        accept={accept}
        onChange={(e) => take(e.target.files)}
        className="hidden"
      />
      <input
        ref={camera}
        type="file"
        accept={captureAccept}
        capture="environment"
        onChange={(e) => take(e.target.files)}
        className="hidden"
      />
    </span>
  )
}
