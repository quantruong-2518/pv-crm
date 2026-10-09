import { describe, expect, it } from 'vitest'
import { buildRfc822, Rfc822AddressError } from './gmail-rfc822'

const NOW = new Date('2026-10-09T03:04:05Z')
const DELIVERY = '0b9f6c1e-3a52-4d0c-9d57-1f2a3b4c5d6e'

const letter = {
  from: '"Nguyễn Văn An" <an.nguyen@pebblevina.com>',
  to: ['lan@khach.vn', 'Chị Lan <lan2@khach.vn>'],
  cc: ['sales@pebblevina.com'],
  subject: 'Báo giá tấm pin mặt trời — đợt tháng mười, kèm lịch khảo sát hiện trường',
  text: 'Chào chị Lan,\nĐây là báo giá.',
  html: '<p>Chào chị Lan,</p><p>Đây là báo giá.</p>',
  headers: { 'X-PV-Delivery': DELIVERY },
}

function split(raw: string): { head: string[]; body: string } {
  const at = raw.indexOf('\r\n\r\n')
  /* Unfold continuation lines so each header is one entry. */
  return { head: raw.slice(0, at).replace(/\r\n /g, ' ').split('\r\n'), body: raw.slice(at + 4) }
}

function decodeWords(value: string): string {
  return value
    .split(' ')
    .map((word) => Buffer.from(word.replace(/^=\?UTF-8\?B\?|\?=$/g, ''), 'base64').toString('utf8'))
    .join('')
}

describe('buildRfc822', () => {
  const raw = buildRfc822(letter, NOW, 'BOUNDARY')
  const { head, body } = split(raw)
  const field = (name: string) =>
    head.find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2)

  it('uses CRLF only and stays 7-bit', () => {
    expect(raw.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect([...raw].every((char) => char.charCodeAt(0) < 128)).toBe(true)
  })

  it('carries the fixed headers, the delivery id, and no Reply-To', () => {
    expect(field('X-PV-Delivery')).toBe(DELIVERY)
    expect(field('MIME-Version')).toBe('1.0')
    expect(field('Date')).toBe('Fri, 09 Oct 2026 03:04:05 +0000')
    expect(field('Content-Type')).toBe('multipart/alternative; boundary="BOUNDARY"')
    expect(head.some((line) => /^reply-to:/i.test(line))).toBe(false)
  })

  it('encodes a non-ASCII subject as RFC 2047 words that decode back whole', () => {
    const subject = field('Subject') ?? ''
    for (const word of subject.split(' ')) {
      expect(word).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/)
      expect(word.length).toBeLessThanOrEqual(75)
    }
    expect(decodeWords(subject)).toBe(letter.subject)
  })

  it('encodes a non-ASCII display name and leaves the address bare', () => {
    const from = field('From') ?? ''
    expect(from.endsWith(' <an.nguyen@pebblevina.com>')).toBe(true)
    expect(decodeWords(from.slice(0, from.lastIndexOf(' <')))).toBe('Nguyễn Văn An')
    expect(field('Cc')).toBe('sales@pebblevina.com')
    const to = field('To') ?? ''
    expect(to.startsWith('lan@khach.vn, ')).toBe(true)
    expect(to.endsWith(' <lan2@khach.vn>')).toBe(true)
  })

  it('quotes an ASCII display name', () => {
    const one = buildRfc822({ ...letter, from: 'An "PV" Nguyen <an@pebblevina.com>' }, NOW, 'B')
    expect(one.split('\r\n')[0]).toBe('From: "An \\"PV\\" Nguyen" <an@pebblevina.com>')
  })

  it('sends text then html, base64, lines no longer than 76', () => {
    const parts = body.split('--BOUNDARY').slice(1, 3)
    expect(parts).toHaveLength(2)
    const [text, html] = parts.map((part) => {
      const [partHead = '', encoded = ''] = part.split('\r\n\r\n')
      for (const line of encoded.split('\r\n')) expect(line.length).toBeLessThanOrEqual(76)
      return { partHead, decoded: Buffer.from(encoded, 'base64').toString('utf8') }
    })
    expect(text?.partHead).toContain('Content-Type: text/plain; charset=UTF-8')
    expect(text?.decoded).toBe(letter.text)
    expect(html?.partHead).toContain('Content-Type: text/html; charset=UTF-8')
    expect(html?.decoded).toBe(letter.html)
    expect(body.trimEnd().endsWith('--BOUNDARY--')).toBe(true)
  })

  it.each([
    ['subject', { subject: 'Hello\r\nBcc: thief@evil.test' }],
    ['header value', { headers: { 'X-PV-Delivery': `${DELIVERY}\r\nBcc: thief@evil.test` } }],
    ['header name', { headers: { 'X-PV-Delivery\r\nBcc': 'thief@evil.test' } }],
  ])('CR/LF in the %s cannot open a new header', (_where, patch) => {
    const injected = split(buildRfc822({ ...letter, ...patch }, NOW, 'B')).head
    expect(injected.some((line) => /^bcc:/i.test(line))).toBe(false)
  })

  it.each([
    ['CR/LF after the From mailbox', { from: 'An <an@pebblevina.com>\r\nBcc: thief@evil.test' }],
    ['LF inside a To entry', { to: ['lan@khach.vn\nBcc: thief@evil.test'] }],
    ['two addresses in one To entry', { to: ['lan@khach.vn, thief@evil.test'] }],
    ['semicolon list in one Cc entry', { cc: ['lan@khach.vn;thief@evil.test'] }],
    ['space inside an address', { to: ['lan @khach.vn'] }],
    ['bracket inside an address', { to: ['Lan <lan@khach.vn> <thief@evil.test>'] }],
    ['two @ signs', { to: ['lan@khach.vn@evil.test'] }],
    ['no @ at all', { to: ['lan.khach.vn'] }],
    ['empty entry', { to: ['lan@khach.vn', ''] }],
  ])('refuses to build: %s', (_what, patch) => {
    expect(() => buildRfc822({ ...letter, ...patch }, NOW, 'B')).toThrow(Rfc822AddressError)
  })

  it('names no address in the refusal', () => {
    try {
      buildRfc822({ ...letter, to: ['lan@khach.vn, thief@evil.test'] }, NOW, 'B')
    } catch (error) {
      expect((error as Error).message).not.toContain('@')
    }
  })

  it('folds a long recipient list instead of one endless line', () => {
    const many = Array.from({ length: 50 }, (_, i) => `khach-hang-so-${i}@cong-ty-khach-hang.vn`)
    const long = buildRfc822({ ...letter, to: many }, NOW, 'B')
    for (const line of long.split('\r\n')) expect(line.length).toBeLessThanOrEqual(998)
    expect(
      split(long)
        .head.find((line) => line.startsWith('To: '))
        ?.split(', '),
    ).toHaveLength(50)
  })
})
