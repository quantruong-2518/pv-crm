/** The off-main-thread half of scan preprocessing — hash, decode, shrink.
 *
 *  Why a worker: a 12 MP phone photo decodes into ~48 MB of pixels, and fifty
 *  of them on the main thread freeze the page the user is watching progress
 *  on. Everything here is pure CPU with no DOM, so it moves off.
 *
 *  Re-encoding to WebP is also the EXIF strip: nothing of the original file
 *  but its pixels survives `convertToBlob`. The hash is taken over the
 *  ORIGINAL bytes, so the same picked file keys the same no matter how the
 *  browser encodes it.
 *
 *  Limits arrive in the message rather than being imported from
 *  `@pv/contracts`, which would drag zod into this bundle for four numbers. */

export type PrepRequest = {
  id: number
  original: Blob
  /** Already-decoded pixels (HEIC goes through heic2any first); null = use `original`. */
  decoded: Blob | null
  /** false = hash only (a PDF travels as-is). */
  image: boolean
  edge: number
  thumbEdge: number
}

export type PrepImage = { blob: Blob; thumb: Blob; width: number; height: number }

/** Codes, not sentences — the main thread owns the Vietnamese. */
export type PrepFailure = 'decode'

export type PrepReply =
  { id: number; sha256: string; image: PrepImage | null } | { id: number; failure: PrepFailure }

const IMAGE_QUALITY = 0.82
const THUMB_QUALITY = 0.7

/* The DOM lib types `self` as a Window; this file only runs as a worker. */
type WorkerScope = {
  onmessage: ((event: MessageEvent<PrepRequest>) => void) | null
  postMessage: (reply: PrepReply) => void
}
const scope = self as unknown as WorkerScope

class PrepError extends Error {
  constructor(readonly failure: PrepFailure) {
    super(failure)
  }
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Long edge capped at `edge`, never upscaled — a small photo stays small. */
async function encode(bitmap: ImageBitmap, edge: number, quality: number, webp: boolean) {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) throw new PrepError('decode')
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  let blob = webp ? await canvas.convertToBlob({ type: 'image/webp', quality }) : null
  /* WebKit (every iOS browser) cannot encode WebP and quietly returns PNG;
     JPEG at the same quality is the portable fallback. */
  if (blob?.type !== 'image/webp')
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
  if (blob.type !== 'image/jpeg' && blob.type !== 'image/webp') throw new PrepError('decode')
  return { blob, width, height }
}

async function shrink(source: Blob, edge: number, thumbEdge: number): Promise<PrepImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  } catch {
    throw new PrepError('decode')
  }
  try {
    const full = await encode(bitmap, edge, IMAGE_QUALITY, true)
    const thumb = await encode(bitmap, thumbEdge, THUMB_QUALITY, false)
    return { blob: full.blob, thumb: thumb.blob, width: full.width, height: full.height }
  } finally {
    bitmap.close()
  }
}

scope.onmessage = (event) => {
  const { id, original, decoded, image, edge, thumbEdge } = event.data
  void (async () => {
    try {
      const [sha256, shrunk] = await Promise.all([
        sha256Hex(original),
        image ? shrink(decoded ?? original, edge, thumbEdge) : Promise.resolve(null),
      ])
      scope.postMessage({ id, sha256, image: shrunk })
    } catch (error) {
      scope.postMessage({ id, failure: error instanceof PrepError ? error.failure : 'decode' })
    }
  })()
}
