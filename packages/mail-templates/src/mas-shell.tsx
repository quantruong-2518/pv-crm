import { Link } from '@react-email/components'
import { BrandShell, CtaButton, Para } from './brand-shell'
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
  /** Đoạn văn, mỗi phần tử một <Text>. Đã thay biến trộn xong trước khi vào đây. */
  paragraphs: string[]
  cta?: { label: string; url: string }
  /** Bắt buộc với mail marketing — link huỷ đăng ký. */
  unsubscribeUrl: string
  /** Chân thư: tên và địa chỉ công ty, bản đã chụp của lô. */
  sender: { name: string; address: string }
  /** Gốc URL công khai của ảnh nhận diện — xem `PV_BRAND_ASSET_URL`. */
  assetBaseUrl: string
}

export function MasShellEmail(data: MasShellData) {
  return (
    <BrandShell
      preview={data.paragraphs[0] ?? data.subject}
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
      {data.paragraphs.map((paragraph, index) => (
        <Para key={`paragraph-${index}`}>{paragraph}</Para>
      ))}

      {data.cta ? <CtaButton href={data.cta.url}>{data.cta.label}</CtaButton> : null}
    </BrandShell>
  )
}
