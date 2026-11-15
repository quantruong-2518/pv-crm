import { Section } from '@react-email/components'
import { BrandShell, Bullets, CtaButton, FallbackLink, Note, ShellHeading } from './brand-shell'

/** THE MORNING BRIEF LETTER: counts and a link, never a record.
 *
 *  A mail leaves our control (forwarding, relays, lock-screen previews), so it
 *  carries no customer name, code or AI text. The props cannot hold one, which
 *  is stronger than a caller promising not to pass one.
 *
 *  The caller names each row, from the one label table in `@pv/contracts`; this
 *  package does not import contracts and keeps no section list of its own. */
export type AssistantBriefData = {
  /** Non-zero rows only, in the order they print. */
  rows: { label: string; count: number }[]
  total: number
  /** The total is a floor: some section was cut. */
  atLeast?: boolean
  openUrl: string
  assetBaseUrl: string
}

export function AssistantBriefEmail({
  rows,
  total,
  atLeast,
  openUrl,
  assetBaseUrl,
}: AssistantBriefData) {
  return (
    <BrandShell preview="Việc hôm nay của bạn" assetBaseUrl={assetBaseUrl}>
      <ShellHeading>{`Hôm nay bạn có ${atLeast ? 'ít nhất ' : ''}${total} việc`}</ShellHeading>
      <Bullets items={rows.map((row) => `${row.label}: ${row.count}`)} />
      <CtaButton href={openUrl}>Mở CRM</CtaButton>
      <Section style={{ margin: '0 0 20px' }}>
        <Note>Nếu nút không hoạt động, hãy sao chép liên kết sau và dán vào trình duyệt:</Note>
        <FallbackLink url={openUrl} />
      </Section>
    </BrandShell>
  )
}
