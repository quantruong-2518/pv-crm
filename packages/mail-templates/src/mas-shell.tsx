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
 *  thrown error, not a made-up hex — same rule as everywhere else in the repo.
 *
 *  (Same helper as `lead-intake-internal.tsx`, duplicated rather than shared:
 *  the two files have no third caller yet to justify a shared module.) */
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
const COLOR_ACCENT = paletteHex('Azure')
const COLOR_BG = paletteHex('White')

/** System font stack, not a webfont link — several corporate mail clients
 *  (Outlook desktop chief among them) strip `<link>`/`@import` from email
 *  `<head>`, so a webfont would silently fall back anyway. */
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export type MasShellData = {
  subject: string
  /** Đoạn văn, mỗi phần tử một <Text>. Đã thay biến trộn xong trước khi vào đây. */
  paragraphs: string[]
  cta?: { label: string; url: string }
  /** Bắt buộc với mail marketing — link huỷ đăng ký. */
  unsubscribeUrl: string
  /** Chân thư: tên và địa chỉ công ty. */
  sender: { name: string; address: string }
}

// Sample copy for local preview only — see `mas-shell-placeholder.ts` for why
// it isn't exported from this file (`PLACEHOLDER_PARAGRAPHS`, re-exported
// below so callers still find it next to the component that uses it).
export { PLACEHOLDER_PARAGRAPHS } from './mas-shell-placeholder'

/** Marketing mail shell for bulk sends (MAS) — CONTENT comes in through props,
 *  nothing here is hard-coded copy. Single column, light background, dark
 *  text — legible in the narrow preview pane most inboxes use by default. */
export function MasShellEmail(data: MasShellData) {
  return (
    <Html lang="vi">
      <Head />
      <Preview>{data.paragraphs[0] ?? data.subject}</Preview>
      <Body style={{ backgroundColor: COLOR_BG, margin: 0, padding: 0, fontFamily: FONT_STACK }}>
        <Container style={{ maxWidth: 560, margin: '0 auto', padding: 0 }}>
          {/* Header band — Azure background, white text. */}
          <Section style={{ backgroundColor: COLOR_ACCENT, padding: '20px 24px' }}>
            <Text style={{ fontSize: 18, fontWeight: 700, color: COLOR_BG, margin: 0 }}>
              Pebble Vina
            </Text>
          </Section>

          {/* Body — white background, navy text, slate for secondary copy. */}
          <Section style={{ padding: '24px' }}>
            {data.paragraphs.map((paragraph, index) => (
              <Text
                key={`paragraph-${index}`}
                style={{ margin: '0 0 16px', fontSize: 14, lineHeight: '22px', color: COLOR_INK }}
              >
                {paragraph}
              </Text>
            ))}

            {data.cta ? (
              // Mail clients don't render real <button>s reliably — a padded
              // <Link> styled as a block is the standard email-CTA pattern.
              <Section style={{ margin: '8px 0 0' }}>
                <Link
                  href={data.cta.url}
                  style={{
                    display: 'inline-block',
                    backgroundColor: COLOR_ACCENT,
                    color: COLOR_BG,
                    fontSize: 14,
                    fontWeight: 700,
                    textDecoration: 'none',
                    padding: '12px 24px',
                    borderRadius: 4,
                  }}
                >
                  {data.cta.label}
                </Link>
              </Section>
            ) : null}
          </Section>

          <Hr style={{ borderColor: COLOR_BORDER, margin: '0 24px 20px' }} />

          {/* Footer — sender identity + mandatory unsubscribe link. */}
          <Section style={{ padding: '0 24px 24px' }}>
            <Text style={{ fontSize: 12, color: COLOR_MUTED, margin: '0 0 4px' }}>
              {data.sender.name}
            </Text>
            <Text style={{ fontSize: 12, color: COLOR_MUTED, margin: '0 0 12px' }}>
              {data.sender.address}
            </Text>
            <Text style={{ fontSize: 12, margin: 0 }}>
              <Link href={data.unsubscribeUrl} style={{ color: COLOR_MUTED }}>
                Huỷ nhận thư từ Pebble Vina
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
