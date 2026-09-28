import type * as Pdfjs from 'pdfjs-dist'
import {
  SCAN_ACCEPT_MIME,
  SCAN_IMAGE_EDGE_PX,
  SCAN_MAX_FILES,
  SCAN_MAX_RAW_BYTES,
  SCAN_THUMB_EDGE_PX,
  type ScanFileDeclared,
} from '@pv/contracts'
import type { PrepFailure, PrepReply, PrepRequest } from './scan-prep.worker'

/** Browser-side preparation of one scan batch: screen, hash, shrink, thumb.
 *
 *  Cost and speed are the reason this exists: a phone photo is 3–6 MB and the
 *  model reads a 2048px WebP just as well, so every image is shrunk here before
 *  a byte leaves the machine. The pixel work runs in `scan-prep.worker.ts`;
 *  this file keeps the two steps that need the DOM (heic2any, pdf.js canvas)
 *  and loads both libraries lazily, so neither lands in the lead book's bundle.
 *
 *  A PDF is uploaded untouched — only its page count and a page-1 thumbnail
 *  are read. A PDF whose thumbnail fails still uploads, with `hasThumb: false`.
 *  `bytes` / `thumbBytes` / `mime` are the EXACT bodies PUT later — the presigned
 *  URL binds length and type, so any other body is refused by storage. */

export type AcceptMime = (typeof SCAN_ACCEPT_MIME)[number]

/* Some systems hand a HEIC file over with an empty `type`; the extension is
   the only other thing the browser knows about it. */
const MIME_BY_EXTENSION: Record<string, AcceptMime> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
}

const EXTENSION_LABEL: Record<AcceptMime, string> = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
  'image/heic': 'HEIC',
  'image/heif': 'HEIC',
  'application/pdf': 'PDF',
}

export const MAX_RAW_MB = SCAN_MAX_RAW_BYTES / 1024 / 1024

/** "JPG · PNG · … · PDF", read off the accept list so a new type prints itself. */
export const ACCEPT_LABEL = [...new Set(SCAN_ACCEPT_MIME.map((m) => EXTENSION_LABEL[m]))].join(
  ' · ',
)

/** The `accept` attribute: mimes plus the two extensions some pickers need. */
export const ACCEPT_ATTR = [...SCAN_ACCEPT_MIME, '.heic', '.heif'].join(',')
export const CAPTURE_ACCEPT_ATTR = SCAN_ACCEPT_MIME.filter((m) => m.startsWith('image/')).join(',')

const isAccepted = (type: string): type is AcceptMime =>
  (SCAN_ACCEPT_MIME as readonly string[]).includes(type)

export function mimeOf(file: File): AcceptMime | null {
  if (isAccepted(file.type)) return file.type
  const dot = file.name.lastIndexOf('.')
  return MIME_BY_EXTENSION[dot < 0 ? '' : file.name.slice(dot + 1).toLowerCase()] ?? null
}

export type Picked = { file: File; mime: AcceptMime }

/** Cheap checks before any byte is read. `rejected` is ready-to-show Vietnamese. */
export function screenPicked(files: readonly File[]): { accepted: Picked[]; rejected: string[] } {
  const accepted: Picked[] = []
  const rejected: string[] = []
  let overflow = 0
  for (const file of files) {
    const mime = mimeOf(file)
    if (!mime) rejected.push(`${file.name} không phải ảnh hay PDF`)
    else if (file.size === 0) rejected.push(`${file.name} rỗng`)
    else if (file.size > SCAN_MAX_RAW_BYTES) rejected.push(`${file.name} lớn hơn ${MAX_RAW_MB} MB`)
    else if (accepted.length >= SCAN_MAX_FILES) overflow += 1
    else accepted.push({ file, mime })
  }
  if (overflow > 0) rejected.push(`${overflow} tệp vượt trần ${SCAN_MAX_FILES} tệp một lô`)
  return { accepted, rejected }
}

// ---------------------------------------------------------------------------
// Worker client
// ---------------------------------------------------------------------------

let worker: Worker | null = null
let nextId = 0
const waiting = new Map<number, (reply: PrepReply) => void>()

function callWorker(request: Omit<PrepRequest, 'id' | 'edge' | 'thumbEdge'>): Promise<PrepReply> {
  if (!worker) {
    worker = new Worker(new URL('./scan-prep.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<PrepReply>) => {
      waiting.get(event.data.id)?.(event.data)
      waiting.delete(event.data.id)
    }
  }
  const id = (nextId += 1)
  const message: PrepRequest = {
    ...request,
    id,
    edge: SCAN_IMAGE_EDGE_PX,
    thumbEdge: SCAN_THUMB_EDGE_PX,
  }
  return new Promise((resolve) => {
    waiting.set(id, resolve)
    worker?.postMessage(message)
  })
}

/** Fifty decoded bitmaps' worth of heap goes back once the batch is prepared. */
export function releasePrepWorker(): void {
  worker?.terminate()
  worker = null
  waiting.clear()
}

// ---------------------------------------------------------------------------
// The two DOM-bound steps
// ---------------------------------------------------------------------------

async function decodeHeic(file: File): Promise<Blob> {
  const { default: heic2any } = await import('heic2any')
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
  const first = Array.isArray(out) ? out[0] : out
  if (!first) throw new Error('heic-empty')
  return first
}

let pdfjsReady: Promise<typeof Pdfjs> | null = null

function loadPdfjs(): Promise<typeof Pdfjs> {
  pdfjsReady ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, workerUrl]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default
    return pdfjs
  })
  return pdfjsReady
}

const THUMB_QUALITY = 0.7

async function readPdf(file: File): Promise<{ pages?: number; thumb: Blob | null }> {
  try {
    const pdfjs = await loadPdfjs()
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    const doc = await task.promise
    try {
      const page = await doc.getPage(1)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({
        scale: SCAN_THUMB_EDGE_PX / Math.max(base.width, base.height),
      })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, viewport }).promise
      const thumb = await new Promise<Blob | null>((done) =>
        canvas.toBlob(done, 'image/jpeg', THUMB_QUALITY),
      )
      return { pages: doc.numPages, thumb: thumb?.type === 'image/jpeg' ? thumb : null }
    } finally {
      void task.destroy()
    }
  } catch {
    /* Encrypted or broken: the server still gets the file and says what it read. */
    return { thumb: null }
  }
}

// ---------------------------------------------------------------------------
// One file
// ---------------------------------------------------------------------------

export type Prepared = {
  upload: Blob
  thumb: Blob | null
  declared: ScanFileDeclared
}

const FAILURE_TEXT: Record<PrepFailure, string> = {
  decode: 'Không mở được ảnh này',
}

/** Throws an `Error` whose message is the Vietnamese line for the row. */
export async function prepareFile({ file, mime }: Picked): Promise<Prepared> {
  const name = file.name.slice(0, 255)

  if (mime === 'application/pdf') {
    const [reply, pdf] = await Promise.all([
      callWorker({ original: file, decoded: null, image: false }),
      readPdf(file),
    ])
    if ('failure' in reply) throw new Error(FAILURE_TEXT[reply.failure])
    return {
      upload: file,
      thumb: pdf.thumb,
      declared: {
        name,
        mime,
        bytes: file.size,
        sha256: reply.sha256,
        pages: pdf.pages,
        hasThumb: pdf.thumb !== null,
        thumbBytes: pdf.thumb?.size,
      },
    }
  }

  let decoded: Blob | null = null
  if (mime === 'image/heic' || mime === 'image/heif') {
    try {
      decoded = await decodeHeic(file)
    } catch {
      throw new Error(FAILURE_TEXT.decode)
    }
  }
  const reply = await callWorker({ original: file, decoded, image: true })
  if ('failure' in reply) throw new Error(FAILURE_TEXT[reply.failure])
  if (!reply.image) throw new Error(FAILURE_TEXT.decode)
  const { blob, thumb, width, height } = reply.image
  return {
    upload: blob,
    thumb,
    declared: {
      name,
      mime: blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp',
      bytes: blob.size,
      sha256: reply.sha256,
      width,
      height,
      hasThumb: true,
      thumbBytes: thumb.size,
    },
  }
}

/** Runs `task` over `items` with at most `limit` in flight, results in input order. */
export async function inPool<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const lane = async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await task(items[index] as T, index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
  return results
}
