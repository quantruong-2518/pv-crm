import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { LeadAttachment } from '@pv/contracts'
import { Button, Download, Icon, Modal, Skeleton } from '@pv/ui'
import { loadPdfjs } from '@/data/lead-scan-prep'
import { documentBlobQuery } from '@/data/workstream-documents'

const SheetView = lazy(() => import('./document-sheet'))
const MarkdownView = lazy(() => import('./document-markdown'))

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const SHEET_MIME = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
/** Played or shown straight from the link — no bytes fetched, no CORS needed. */
const linkOnly = (mime: string) => mime.startsWith('image/') || mime.startsWith('audio/')

/** One document opened in place: PDF through pdf.js (already shipped for the
 *  scan door), Word through docx-preview, Excel through SheetJS, Markdown
 *  through react-markdown; images, audio and text as they are. Every library
 *  loads on first need, so the run pages never carry them. */
export function DocumentPreview({
  file,
  subtitle,
  onClose,
}: {
  file: LeadAttachment | null
  subtitle?: string
  onClose: () => void
}) {
  return (
    <Modal
      open={file !== null}
      onClose={onClose}
      width="xl"
      title={<span className="break-words">{file?.name}</span>}
      subtitle={subtitle}
      headerAction={file && <SaveButton file={file} />}
    >
      {file && <Viewer key={file.id} file={file} />}
    </Modal>
  )
}

function SaveButton({ file }: { file: LeadAttachment }) {
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const blob = await client.fetchQuery(documentBlobQuery(file)).catch(() => null)
    setBusy(false)
    // Bytes not readable here (storage refused): the link still downloads, under its key.
    if (!blob) return void window.open(file.url, '_blank', 'noopener')
    const href = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href, download: file.name }).click()
    setTimeout(() => URL.revokeObjectURL(href), 0)
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      className="pointer-coarse:h-12 -mt-1 shrink-0"
      disabled={busy}
      onClick={() => void save()}
    >
      <Icon icon={Download} size={16} />
      Tải xuống
    </Button>
  )
}

function Viewer({ file }: { file: LeadAttachment }) {
  const { mime } = file
  const {
    data: blob,
    isPending,
    isError,
  } = useQuery({
    ...documentBlobQuery(file),
    enabled: !linkOnly(mime),
  })

  if (mime.startsWith('image/'))
    return (
      <div className="bg-surface-ink/9 flex justify-center rounded-lg p-3">
        <img src={file.url} alt={file.name} className="h-auto max-w-full rounded-md" />
      </div>
    )
  if (mime.startsWith('audio/'))
    return (
      <div className="bg-surface-ink/9 rounded-lg p-4">
        <audio controls preload="metadata" src={file.url} className="w-full">
          <track kind="captions" />
        </audio>
      </div>
    )
  if (mime === 'application/msword')
    return <Note>Tệp Word đời cũ (.doc) chưa xem trước được. Bấm Tải xuống để mở trên máy.</Note>
  if (isPending) return <Skeleton className="h-96 w-full" />
  if (isError || !blob) return <Note>Không mở được tệp này. Bấm Tải xuống để xem trên máy.</Note>
  if (mime === 'application/pdf') return <Painted blob={blob} paint={paintPdf} />
  if (mime === WORD_MIME) return <Painted blob={blob} paint={paintDocx} />
  if (SHEET_MIME.has(mime))
    return (
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <SheetView blob={blob} />
      </Suspense>
    )
  if (mime === 'text/plain' || mime === 'text/markdown')
    return <TextView blob={blob} markdown={mime === 'text/markdown'} />
  return <Note>Loại tệp này chưa xem trước được. Bấm Tải xuống để xem trên máy.</Note>
}

type Paint = (blob: Blob, into: HTMLElement, alive: () => boolean) => Promise<unknown>

/** Both libraries write into a DOM node of their own rather than return JSX. */
function Painted({ blob, paint }: { blob: Blob; paint: Paint }) {
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const into = host.current
    if (!into) return
    let alive = true
    paint(blob, into, () => alive).catch(() => alive && setFailed(true))
    return () => {
      alive = false
      into.replaceChildren()
    }
  }, [blob, paint])

  if (failed) return <Note>Không đọc được nội dung tệp. Bấm Tải xuống để xem trên máy.</Note>
  return (
    <div
      ref={host}
      className="bg-surface-ink/9 flex flex-col gap-3 overflow-x-auto rounded-lg p-3 [&_.docx-wrapper]:bg-transparent [&_.docx-wrapper]:p-0"
    />
  )
}

const paintPdf: Paint = async (blob, into, alive) => {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
  try {
    const doc = await task.promise
    // Pages drawn one by one, so page 1 shows before a long file has finished.
    for (let n = 1; n <= doc.numPages && alive(); n++) {
      const page = await doc.getPage(n)
      const scale = (into.clientWidth / page.getViewport({ scale: 1 }).width) * devicePixelRatio
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      canvas.className = 'h-auto w-full rounded-md'
      into.append(canvas)
      await page.render({ canvas, viewport }).promise
    }
  } finally {
    void task.destroy()
  }
}

const paintDocx: Paint = async (blob, into, alive) => {
  const { renderAsync } = await import('docx-preview')
  if (!alive()) return
  await renderAsync(blob, into, undefined, { breakPages: true, ignoreLastRenderedPageBreak: true })
}

function TextView({ blob, markdown }: { blob: Blob; markdown: boolean }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    void blob.text().then(setText)
  }, [blob])
  if (text === null) return <Skeleton className="h-96 w-full" />
  if (markdown)
    return (
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <MarkdownView text={text} />
      </Suspense>
    )
  return (
    <pre className="bg-surface-ink/9 m-0 whitespace-pre-wrap break-words rounded-lg p-4 font-mono text-[13px] leading-[1.6]">
      {text}
    </pre>
  )
}

function Note({ children }: { children: string }) {
  return <p className="text-muted-foreground m-0 py-8 text-center text-[13px]">{children}</p>
}
