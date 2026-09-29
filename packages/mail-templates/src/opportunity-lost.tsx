import { Section, Text } from '@react-email/components'
import { BrandShell, CtaButton, Eyebrow, FallbackLink, Para, ShellHeading } from './brand-shell'
import { Divider, Field, Paragraphs } from './ops-mail-bits'
import { COLOR_MUTED, FONT_STACK, formatMoment, formatMoney } from './ops-mail-style'

/** Template 2 · "Cơ hội đã dừng" — to the internal mailbox (ADR 0069 §1, §13).
 *
 *  A stop is final, so this letter carries a lesson, not a rescue: the REASON
 *  stands on top, before the money, readable from the inbox preview. The one
 *  button opens the deal's profile to read that reason in context — "Xem hồ sơ
 *  đơn", a promise to read, not to reopen.
 *
 *  `stopReason` arrives as a LABEL (the composer resolves the catalogue id, and
 *  `other` reads "Khác"); `stopNote` is this deal's own sentence. Each field is
 *  still checked, since older rows may lack one. Alert tone on the heading only.
 *
 *  No compiler renders this and no test runs it: look at `pnpm mail:preview`. */
export type OpportunityLostData = {
  opCode: string
  leadCode: string
  account: string
  name: string
  amount: number | null
  currency: string | null
  /** The catalogue label of the reason, already resolved. */
  stopReason?: string
  /** Label of the rung the deal stopped on. */
  stoppedAt?: string
  /** This deal's own sentence. */
  stopNote?: string
  saleOwners: string[]
  bdOwners: string[]
  /** ISO with offset. */
  closedAt: string
  /** Days the deal lived, open to close; omitted when unknown. */
  daysOpen?: number
  opUrl: string
  /** Public base URL of the brand images — see `PV_BRAND_ASSET_URL`. */
  assetBaseUrl: string
}

export function OpportunityLostEmail(data: OpportunityLostData) {
  const money = formatMoney(data.amount, data.currency)
  const headline = data.stopReason ?? data.stopNote ?? 'chưa ghi lý do'

  return (
    <BrandShell
      preview={`${data.account} · cơ hội đã dừng · ${headline}`}
      assetBaseUrl={data.assetBaseUrl}
    >
      <ShellHeading tone="alert">Cơ hội đã dừng</ShellHeading>
      <Eyebrow>
        {data.opCode} · từ lead {data.leadCode} · dừng lúc {formatMoment(data.closedAt)}
      </Eyebrow>

      <Section>
        <Text
          style={{ fontSize: 12, color: COLOR_MUTED, margin: '0 0 2px', fontFamily: FONT_STACK }}
        >
          Vì sao dừng
        </Text>
        <Field label="Dừng ở" value={data.stoppedAt} />
        <Field label="Lý do" value={data.stopReason} />
        {data.stopNote && data.stopNote.trim() ? (
          <Paragraphs text={data.stopNote} keyPrefix="note" />
        ) : null}
      </Section>

      <Divider />

      <Section>
        <Field label="Khách" value={data.account} />
        <Field label="Tên đơn" value={data.name} />
        <Field label="Giá trị đơn" value={money} />
        <Field
          label="Đơn sống được"
          value={data.daysOpen === undefined ? undefined : `${data.daysOpen} ngày`}
        />
      </Section>

      <Divider />

      <Section>
        <Field label="Sale đứng đơn" value={data.saleOwners.join(' · ')} />
        <Field label="BD mở cửa" value={data.bdOwners.join(' · ')} />
      </Section>

      <Divider />

      <Para>
        Cơ hội này không mở lại được. Khách vẫn còn trong sổ — chăm lại thì đi từ lead, và đọc lại
        lý do trên trước lần chào tiếp theo.
      </Para>
      {/* The button opens the deal, not the customer: the reason is read in the
          deal's full context first. One button, one job. */}
      <CtaButton href={data.opUrl}>Xem hồ sơ đơn {data.opCode}</CtaButton>
      <FallbackLink url={data.opUrl} />
    </BrandShell>
  )
}
