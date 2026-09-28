import { useRef, useState } from 'react'
import { Button, FileUp, Icon, Smartphone, cn } from '@pv/ui'

/** The multi-file drop zone of the scan door.
 *
 *  Not `FileDrop` from `@pv/ui`: that one takes exactly ONE file and owns its
 *  copy and its single button, while a scan batch is up to fifty files with a
 *  second, camera-only picker. The edge is `.drop-dots` — the same borderless
 *  drag-drop signifier `FileDrop` draws (law 4). A multi-file `FileDrop` is
 *  the shared request that retires this file.
 *
 *  Checks nothing: every file goes to `onFiles`, which screens and explains. */
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
  const [over, setOver] = useState(false)
  /* Counted, not toggled: crossing a child fires the parent's `dragleave`. */
  const depth = useRef(0)

  const open = (input: HTMLInputElement | null) => {
    if (!input) return
    /* Cleared first, or re-picking the same files fires no `change`. */
    input.value = ''
    input.click()
  }
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
          {over ? 'Thả ra là nhận' : 'Kéo thả tệp vào đây'}
        </p>
        <p className="text-muted-foreground text-[12.5px]">
          Danh thiếp, ảnh chụp, PDF hồ sơ — thả nhiều tệp một lần
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="md" className="pointer-coarse:h-12" onClick={() => open(picker.current)}>
          Chọn tệp
        </Button>
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={() => open(camera.current)}
        >
          <Icon icon={Smartphone} size={16} />
          Chụp bằng điện thoại
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
