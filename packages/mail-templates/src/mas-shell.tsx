import type { ReactNode } from 'react'
import { Link } from '@react-email/components'
import { BookingButton, BrandShell, Bullets, CtaButton, Para } from './brand-shell'
import { mailBlocksPreview, type MailBlock, type MailRun } from './mail-markup'
import { COLOR_PRIMARY } from './ops-mail-style'

// Sample copy for local preview only — see `mas-shell-placeholder.ts` for why
// it isn't exported from this file (`PLACEHOLDER_PARAGRAPHS`, re-exported
// below so callers still find it next to the component that uses it).
export { PLACEHOLDER_PARAGRAPHS } from './mas-shell-placeholder'

/** KHUNG TIẾP THỊ (MAS) — thư gửi ra ngoài, hàng loạt, nội dung tới từ CSDL.
 *
 *  ==================================================================
 *  FILE NÀY TỪNG TỰ VẼ CẢ LÁ THƯ; GIỜ NÓ CHỈ CÒN ĐỔ NỘI DUNG
 *  ==================================================================
 *  Bản trước tự dựng `<Html>`, tự khai bảng màu bằng một `paletteHex` chép
 *  tay, tự khai phông, tự vẽ dải đầu thư bằng chữ và tự vẽ chân thư. Hệ quả
 *  không phải là "dài dòng" mà là: đây là lá thư DUY NHẤT khách nhìn thấy, và
 *  nó là lá duy nhất KHÔNG mang logo, không có `contact@pebblevina.com`, và
 *  đứng ngoài mọi phép sửa nhận diện làm ở chỗ khác.
 *
 *  Giờ nó ngồi trên `BrandShell` như mọi lá khác. Hai chỗ nó phải khác, và cả
 *  hai đều đi qua slot có sẵn của khung:
 *
 *   · `footerNote` — liên kết huỷ đăng ký. BẮT BUỘC với thư thương mại, và
 *     đây là lá duy nhất được phép có nó: gắn liên kết huỷ vào thư giao dịch
 *     là mời người ta tắt thứ họ không tắt được.
 *   · `sender` — danh tính ĐÃ CHỤP của lô, không phải hằng số hôm nay. Một lô
 *     duyệt dưới một địa chỉ phải đi ra dưới đúng địa chỉ đó; cùng lý do
 *     `mail_run.from_address` là một cột.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG CÓ CTA THÌ KHÔNG VẼ NÚT
 *  ------------------------------------------------------------------
 *  `cta_label`/`cta_url` trong `sales.mail_template` là một cặp nullable, có
 *  ràng buộc `mail_template_cta_pair` giữ cho hai cột cùng có hoặc cùng
 *  không. Một hàng template không có CTA là hợp lệ — thư nuôi dưỡng thuần
 *  chữ là một dạng thật — nên chỗ này KHÔNG bịa ra một đích đến. Muốn mọi mẫu
 *  MAS đều phải có nút thì đó là một ràng buộc CSDL, không phải một `??` ở
 *  đây. */
export type MasShellData = {
  subject: string
  /** Thân thư đã phân tích thành khối — xem `mail-markup.ts`. Biến trộn đã thay
   *  xong TRƯỚC khi vào đây, và thay vào text của từng run chứ không thay vào
   *  một chuỗi rồi đọc lại: giá trị trộn không đổi được cấu trúc lá thư. */
  blocks: MailBlock[]
  cta?: { label: string; url: string }
  /** The booking link — the SECOND button, an address with no label of its own.
   *
   *  The label is `BOOKING_LABEL` below rather than a column: every letter this
   *  company sends should word this button identically, so a recipient on their
   *  third letter recognises it without reading it. Merge values inside the URL
   *  were substituted and percent-encoded in `mas-letter.ts` before arriving. */
  bookingUrl?: string
  /** Bắt buộc với mail marketing — link huỷ đăng ký. */
  unsubscribeUrl: string
  /** Chân thư: tên và địa chỉ công ty, bản đã chụp của lô. */
  sender: { name: string; address: string }
  /** Gốc URL công khai của ảnh nhận diện — xem `PV_BRAND_ASSET_URL`. */
  assetBaseUrl: string
}

/** The one sentence the booking button says, in every letter.
 *
 *  A constant rather than a field the writer fills in — `MailBookingUrl` in
 *  `@pv/contracts` carries the full argument. Changing the wording here changes
 *  it system-wide, which is exactly the property wanted. */
const BOOKING_LABEL = 'Chọn khung giờ'

export function MasShellEmail(data: MasShellData) {
  return (
    <BrandShell
      preview={mailBlocksPreview(data.blocks) || data.subject}
      assetBaseUrl={data.assetBaseUrl}
      sender={data.sender}
      footerNote={
        <>
          Bạn nhận thư này vì đã để lại thông tin cho {data.sender.name}.{' '}
          <Link href={data.unsubscribeUrl} style={{ color: COLOR_PRIMARY }}>
            Huỷ nhận thư
          </Link>
        </>
      }
    >
      {data.blocks.map((block, index) =>
        block.kind === 'list' ? (
          <Bullets key={`block-${index}`} items={block.items.map(renderRuns)} />
        ) : (
          <Para key={`block-${index}`}>{withLineBreaks(block.lines)}</Para>
        ),
      )}

      {/* HIERARCHY FOLLOWS WHAT IS PRESENT, NOT WHAT KIND OF BUTTON IT IS.
          The outlined button is the SECONDARY one, and secondary only means
          anything with a primary beside it. A letter whose only invitation is
          to book, drawn as the faintest thing on the page, is a letter talking
          itself down — so with no CTA the booking link becomes the primary. */}
      {data.cta ? (
        <>
          <CtaButton href={data.cta.url}>{data.cta.label}</CtaButton>
          {data.bookingUrl ? (
            <BookingButton href={data.bookingUrl}>{BOOKING_LABEL}</BookingButton>
          ) : null}
        </>
      ) : data.bookingUrl ? (
        <CtaButton href={data.bookingUrl}>{BOOKING_LABEL}</CtaButton>
      ) : null}
    </BrandShell>
  )
}

/** A SINGLE NEWLINE HAS TO BECOME A `<br />` OR IT SIMPLY DISAPPEARS.
 *
 *  The parser splits blocks on BLANK lines, so a paragraph block still carries
 *  whatever single newlines the writer typed inside it. Handing those straight
 *  to `<Text>` lets HTML collapse each into a space — and the worst casualty is
 *  not a bullet list, it is the SIGN-OFF, which nearly every letter has. Two
 *  lines typed as a greeting and a name go out welded into one line.
 *
 *  No compiler catches it, no test renders a mail template, and the first
 *  person to see it is the customer. Found by reading the new server-rendered
 *  preview, which is the entire argument for that preview existing.
 *
 *  `<br />` and NOT `white-space: pre-line`: Outlook for Windows lays HTML out
 *  with Word's engine and ignores that property, and Outlook is exactly where
 *  Vietnamese B2B mail gets opened. Every client understands a `<br>`. */
function withLineBreaks(lines: readonly MailRun[][]): ReactNode[] {
  return lines.flatMap((runs, index) =>
    index === 0 ? renderRuns(runs) : [<br key={`br-${index}`} />, ...renderRuns(runs)],
  )
}

/** Emphasis as real tags, and the text of every run as a React CHILD.
 *
 *  That last part is the whole safety property of this path: React escapes
 *  children, so the only tags in the output are the ones written literally
 *  here. Nothing a salesperson typed, and nothing `substitute` pasted in from a
 *  lead's own record, can add one — see the header of `mail-markup.ts`. */
function renderRuns(runs: readonly MailRun[]): ReactNode[] {
  return runs.map((run, index) => {
    if (run.kind === 'bold') return <strong key={`run-${index}`}>{run.text}</strong>
    if (run.kind === 'italic') return <em key={`run-${index}`}>{run.text}</em>
    return run.text
  })
}
