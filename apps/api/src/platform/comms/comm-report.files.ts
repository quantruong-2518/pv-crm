import { inflateRawSync } from 'node:zlib'
import { TRANSCRIPT_MAX } from '@pv/contracts'
import type { AiPart } from '@api/platform/ai/ai-client'

/** One comm file as the model will get it (ADR 0132 §4): words as text, a PDF
 *  or an image as a file part, null when it has nothing to read.
 *
 *  The mime is what the uploader declared, so it is checked against the bytes.
 *  A vendor refuses a file it cannot open, and that refusal is final for the
 *  whole press, so a bad file has to stop here. A PDF is checked, never parsed:
 *  a parser inflates its streams with no cap, so a 10 KB file could fill the
 *  process. A password-protected PDF stops here too: no vendor could read it. */

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** The first bytes of each image type a comm record accepts. */
const IMAGE_MAGIC: Record<string, string> = {
  'image/png': '\x89PNG',
  'image/jpeg': '\xff\xd8\xff',
  'image/webp': 'RIFF',
}
const WEBP_MARK = 'WEBP'
const PDF_MAGIC = '%PDF-'

/** Chosen value: `TRANSCRIPT_MAX` of text is a few MB of XML, and this is held in memory. */
const DOCX_MAX_INFLATED = 20 * 1024 * 1024
const DOCX_BODY = 'word/document.xml'
const XML_ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

const ZIP_END = Buffer.from('PK\x05\x06', 'latin1')
const ZIP_CENTRAL = 0x02014b50
const ZIP_LOCAL = 0x04034b50

export const isAudio = (mime: string): boolean => mime.startsWith('audio/')

const words = (text: string): AiPart | null => {
  const kept = text.trim().slice(0, TRANSCRIPT_MAX)
  return kept ? { text: kept } : null
}

/** The DOCX body straight off its zip. Parsers build a tree of every tag, so a
 *  9 KB upload could take the API process down; this reads one part, bounded, and
 *  scans it (`docxText`). Declared inflated sizes decide nothing. */
function docxBody(bytes: Buffer): string {
  const end = bytes.lastIndexOf(ZIP_END)
  if (end < 0) throw new Error('docx: no end of central directory')
  let at = bytes.readUInt32LE(end + 16)
  for (let left = bytes.readUInt16LE(end + 10); left > 0; left -= 1) {
    if (bytes.readUInt32LE(at) !== ZIP_CENTRAL) throw new Error('docx: bad central entry')
    const nameLength = bytes.readUInt16LE(at + 28)
    if (bytes.toString('utf8', at + 46, at + 46 + nameLength) === DOCX_BODY) {
      return entryContent(bytes, at).toString('utf8')
    }
    at += 46 + nameLength + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32)
  }
  throw new Error('docx: no document part')
}

/** A stored entry stays inside the bytes already in memory; a deflate stream ends by itself. */
function entryContent(bytes: Buffer, at: number): Buffer {
  const local = bytes.readUInt32LE(at + 42)
  if (bytes.readUInt32LE(local) !== ZIP_LOCAL) throw new Error('docx: bad local entry')
  const data = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
  const method = bytes.readUInt16LE(at + 10)
  if (method === 0) return bytes.subarray(data, data + bytes.readUInt32LE(at + 20))
  if (method !== 8) throw new Error('docx: unknown compression')
  return inflateRawSync(bytes.subarray(data), { maxOutputLength: DOCX_MAX_INFLATED })
}

/** Runs of `w:t` joined, one line per paragraph. A scan, not a regex: `<[^>]*>` goes
 *  quadratic on a crafted run of `<`, and the loop stops once the cap is reached. */
function docxText(xml: string): string {
  const out: string[] = []
  let chars = 0
  let at = xml.indexOf('<')
  while (at >= 0 && chars < TRANSCRIPT_MAX) {
    const close = xml.indexOf('>', at)
    if (close < 0) break
    const next = xml.indexOf('<', close)
    const tag = xml.slice(at + 1, close)
    const run = next > close && (tag === 'w:t' || tag.startsWith('w:t '))
    const piece = tag === '/w:p' ? '\n' : run ? xml.slice(close + 1, next) : ''
    out.push(piece)
    chars += piece.length
    at = next
  }
  return out.join('').replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, unescapeXml)
}

function unescapeXml(whole: string, name: string): string {
  if (name[0] !== '#') return XML_ENTITY[name] ?? whole
  const hex = name[1]?.toLowerCase() === 'x'
  return String.fromCodePoint(parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10))
}

const startsWith = (bytes: Buffer, magic: string): boolean =>
  bytes.toString('latin1', 0, magic.length) === magic

/** Throws on a file that does not parse: the caller files it under `unread`. */
export function partOf(mime: string, bytes: Buffer): AiPart | null {
  /* `fatal`: a binary or UTF-16 file must not reach the model as mojibake. */
  if (mime === 'text/plain') return words(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  if (mime === DOCX) return words(docxText(docxBody(bytes)))
  if (mime === 'application/pdf') {
    const readable = startsWith(bytes, PDF_MAGIC) && !bytes.includes('/Encrypt')
    return readable ? { file: { mime, bytes } } : null
  }
  const magic = IMAGE_MAGIC[mime]
  const fits = magic !== undefined && startsWith(bytes, magic)
  const webp = mime !== 'image/webp' || bytes.toString('latin1', 8, 12) === WEBP_MARK
  return fits && webp ? { file: { mime, bytes } } : null
}
