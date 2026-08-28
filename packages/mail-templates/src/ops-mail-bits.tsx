import { Hr, Link, Text } from '@react-email/components'
import { COLOR_ACCENT, COLOR_ALERT, COLOR_BORDER, COLOR_INK, COLOR_MUTED } from './ops-mail-style'

/** Khối dựng dùng chung của hai mail sổ cơ hội.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO LÀ FILE THỨ BA CHỨ KHÔNG CHÉP `lead-intake-internal.tsx`
 *  ------------------------------------------------------------------
 *  `Field`, phép tra màu, phông và phép định dạng ngày đã được viết một lần cho
 *  mail lead intake. Thêm hai bản chép là ba chỗ để luật "bỏ hẳn dòng, đừng in
 *  N/A" trôi khỏi nhau — mà template mail thì trôi trong im lặng: không có gì
 *  render chúng ở CI, và người thấy khác biệt là người nhận mail.
 *
 *  `lead-intake-internal.tsx` cố tình KHÔNG được chuyển sang dùng file này
 *  trong cùng một thay đổi: nó đang chạy trên production từ 26/08 và bản in của
 *  nó là thứ hộp thư kinh doanh đang nhận. Dời nó là một thay đổi riêng, có
 *  trước/sau của riêng nó, không phải tác dụng phụ của việc thêm hai template.
 *
 *  Chỉ COMPONENT nằm ở đây. Màu, phông và bốn phép định dạng ở
 *  `ops-mail-style.ts` — `react-refresh/only-export-components` đòi thế, và nó
 *  đòi đúng: file có JSX chỉ xuất component. */

/** Một dòng có nhãn. KHÔNG vẽ gì nếu giá trị rỗng — luật "bỏ hẳn dòng, đừng in
 *  N/A" nằm ở đúng một chỗ này.
 *
 *  Nhãn và giá trị chung MỘT `<Text>` với ": " ở giữa, không phải hai span
 *  `display: block`: bản plain-text dựng từ CẤU TRÚC THẺ chứ không từ CSS đã
 *  tính, nên hai span sẽ đọc ngược lại thành "NhãnGiá trị" dính liền. */
export function Field({ label, value }: { label: string; value?: string }) {
  if (!value || !value.trim()) return null
  return (
    <Text style={{ margin: '0 0 8px', fontSize: 14, lineHeight: '20px', color: COLOR_INK }}>
      <span style={{ color: COLOR_MUTED }}>{label}: </span>
      {value}
    </Text>
  )
}

/** Tiêu đề của mail. Là `<Text>` làm việc của một heading chứ KHÔNG phải `<h2>`:
 *  bộ dựng plain-text viết hoa toàn bộ heading thật, và một dòng in hoa nhồi là
 *  đúng thứ luật 15 cấm. */
export function Heading({ children, tone }: { children: string; tone?: 'alert' }) {
  return (
    <Text
      style={{
        fontSize: 20,
        fontWeight: 700,
        color: tone === 'alert' ? COLOR_ALERT : COLOR_ACCENT,
        margin: '0 0 4px',
      }}
    >
      {children}
    </Text>
  )
}

export function Divider() {
  return <Hr style={{ borderColor: COLOR_BORDER, margin: '20px 0' }} />
}

/** Đường mở thẳng đối tượng trong CRM. In NGUYÊN đường dẫn làm chữ hiển thị,
 *  không giấu sau một chữ "Xem": mail nội bộ hay được chuyển tiếp, và người
 *  nhận thứ hai cần thấy nó trỏ vào đâu trước khi bấm. */
export function OpenLink({ url }: { url: string }) {
  return (
    <Text style={{ fontSize: 14, margin: 0, wordBreak: 'break-all' }}>
      <Link href={url} style={{ color: COLOR_ACCENT }}>
        {url}
      </Link>
    </Text>
  )
}

/** Đoạn văn nhiều dòng của người dùng gõ. Cắt theo xuống dòng và bỏ dòng trắng
 *  — một `white-space: pre-wrap` sẽ bị nửa số client bóc mất. */
export function Paragraphs({ text, keyPrefix }: { text: string; keyPrefix: string }) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  return (
    <>
      {lines.map((line, index) => (
        <Text
          key={`${keyPrefix}-${index}`}
          style={{ margin: '0 0 4px', fontSize: 14, lineHeight: '20px', color: COLOR_INK }}
        >
          {line}
        </Text>
      ))}
    </>
  )
}
