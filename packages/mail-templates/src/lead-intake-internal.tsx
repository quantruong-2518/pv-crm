import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { BRAND_PALETTE } from '@pv/tokens'

/** Looks up a brand hex value by name in the token table.
 *
 *  Email HTML has no `var(--*)` support — most mail clients strip `<style>`
 *  custom properties, some strip `<style>` entirely — so this file is the one
 *  place server-side allowed to hold a RESOLVED hex string. It never types one
 *  itself, though: the literal lives in `@pv/tokens`, read here by name, which
 *  is what keeps `aurora/no-raw-hex` clean on this file. Missing a color is a
 *  thrown error, not a made-up hex — same rule as everywhere else in the repo. */
function paletteHex(name: string): string {
  const swatch = BRAND_PALETTE.find((entry) => entry.name === name)
  if (!swatch) {
    throw new Error(`Thiếu token màu "${name}" trong BRAND_PALETTE — báo lại, đừng bịa hex mới.`)
  }
  return swatch.hex
}

const COLOR_INK = paletteHex('Deep Navy')
const COLOR_MUTED = paletteHex('Slate Gray')
const COLOR_BORDER = paletteHex('Light Gray')
const COLOR_ACCENT = paletteHex('Pebble Blue')
const COLOR_BG = paletteHex('White')

/** System font stack, not a webfont link — several corporate mail clients
 *  (Outlook desktop chief among them) strip `<link>`/`@import` from email
 *  `<head>`, so a webfont would silently fall back anyway. */
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export type LeadIntakeInternalUtm = {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
}

/** Everything `renderLeadIntakeInternal` needs. Every optional field here is
 *  OMITTED from the mail body when empty (see `Field` below) rather than
 *  printed as "N/A" — a blank UTM set is a direct visit, not a data gap. */
export type LeadIntakeInternalData = {
  leadCode: string
  company: string
  contactName: string
  email: string
  phone?: string
  pain?: string
  landingPage: string
  utm?: LeadIntakeInternalUtm
  receivedAt: string
  leadUrl: string
}

function formatReceivedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date)
}

/** One labeled line. Renders nothing at all for an empty/whitespace value —
 *  the "drop the row, never print N/A" rule lives in exactly this one place.
 *
 *  Label and value share one `<Text>` with a literal ": " between them rather
 *  than a stacked `display: block` span: the plain-text fallback is built
 *  from HTML tag structure, not computed CSS, so a `display: block` span
 *  reads back as "LabelValue" glued together with no separator at all. */
function Field({ label, value }: { label: string; value?: string }) {
  if (!value || !value.trim()) return null
  return (
    <Text style={{ margin: '0 0 8px', fontSize: 14, lineHeight: '20px', color: COLOR_INK }}>
      <span style={{ color: COLOR_MUTED }}>{label}: </span>
      {value}
    </Text>
  )
}

/** Mail body for "a new lead landed on a landing page", sent to the internal
 *  sales inbox. Single column, light background, dark text — legible in the
 *  narrow preview pane most inboxes use by default, not just full-width. */
export function LeadIntakeInternalEmail(data: LeadIntakeInternalData) {
  const painLines = data.pain
    ? data.pain.split(/\r?\n/).filter((line) => line.trim().length > 0)
    : []

  const utmRows: Array<[string, string | undefined]> = [
    ['Nguồn (utm_source)', data.utm?.source],
    ['Kênh (utm_medium)', data.utm?.medium],
    ['Chiến dịch (utm_campaign)', data.utm?.campaign],
    ['Nội dung (utm_content)', data.utm?.content],
    ['Từ khoá (utm_term)', data.utm?.term],
  ]
  const hasUtm = utmRows.some(([, value]) => Boolean(value && value.trim()))

  return (
    <Html lang="vi">
      <Head />
      <Preview>{`${data.company} · ${data.contactName} vừa gửi form trên ${data.landingPage}`}</Preview>
      <Body
        style={{ backgroundColor: COLOR_BG, margin: 0, padding: '24px 0', fontFamily: FONT_STACK }}
      >
        <Container style={{ maxWidth: 560, margin: '0 auto', padding: '0 24px' }}>
          {/* A `<Text>` doing a heading's visual job, not an `<h2>`: the plain-text
              fallback's default formatter uppercases real headings, which reads as
              the exact "chữ in hoa nhồi" this mail is required to avoid. */}
          <Text style={{ fontSize: 20, fontWeight: 700, color: COLOR_ACCENT, margin: '0 0 4px' }}>
            Lead landing page mới
          </Text>
          <Text style={{ fontSize: 12, color: COLOR_MUTED, margin: '0 0 24px' }}>
            Mã lead {data.leadCode}
          </Text>

          <Section>
            <Field label="Công ty" value={data.company} />
            <Field label="Người liên hệ" value={data.contactName} />
            <Field label="Email" value={data.email} />
            <Field label="Điện thoại" value={data.phone} />
          </Section>

          {painLines.length > 0 ? (
            <Section style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: COLOR_MUTED, margin: '0 0 2px' }}>
                Vấn đề khách gặp phải
              </Text>
              {painLines.map((line, index) => (
                <Text
                  key={`pain-${index}`}
                  style={{ margin: '0 0 4px', fontSize: 14, lineHeight: '20px', color: COLOR_INK }}
                >
                  {line}
                </Text>
              ))}
            </Section>
          ) : null}

          <Hr style={{ borderColor: COLOR_BORDER, margin: '20px 0' }} />

          <Section>
            <Field label="Landing page" value={data.landingPage} />
            {hasUtm
              ? utmRows.map(([label, value]) => <Field key={label} label={label} value={value} />)
              : null}
          </Section>

          <Hr style={{ borderColor: COLOR_BORDER, margin: '20px 0' }} />

          <Text style={{ fontSize: 12, color: COLOR_MUTED, margin: '0 0 12px' }}>
            Nhận lúc {formatReceivedAt(data.receivedAt)}
          </Text>
          <Text style={{ fontSize: 14, margin: 0, wordBreak: 'break-all' }}>
            <Link href={data.leadUrl} style={{ color: COLOR_ACCENT }}>
              {data.leadUrl}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
