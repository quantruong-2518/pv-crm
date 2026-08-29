import { BRAND_PALETTE } from '@pv/tokens'

/** Màu, phông và bốn phép định dạng dùng chung của hai mail sổ cơ hội.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO TÁCH KHỎI `ops-mail-bits.tsx`
 *  ------------------------------------------------------------------
 *  `react-refresh/only-export-components`: một file có JSX thì chỉ được xuất
 *  component. Hằng số và hàm thuần đi chỗ khác — cùng đường tách mà
 *  `components/ops-fields.tsx` và `data/ops.ts` đã đi bên `apps/web`, và cùng
 *  lý do. Ở đây nó còn tiện thêm một bậc: `apps/api` bị eslint cấm nhập React,
 *  nên bốn hàm dưới đây là thứ máy chủ dùng lại được, còn file `.tsx` thì không.
 *
 *  ------------------------------------------------------------------
 *  MÀU ĐỌC TỪ BẢNG TOKEN, KHÔNG GÕ HEX
 *  ------------------------------------------------------------------
 *  HTML của email không có `var(--*)` — phần lớn client bóc `<style>`, một số
 *  bóc cả khối — nên đây là một trong hai chỗ trong repo được phép giữ chuỗi
 *  hex đã giải. Nó vẫn không TỰ gõ hex nào: chữ số nằm ở `@pv/tokens`, đọc ra
 *  theo tên. Thiếu một màu là NÉM, không phải bịa một hex mới (luật 1). */

function paletteHex(name: string): string {
  const swatch = BRAND_PALETTE.find((entry) => entry.name === name)
  if (!swatch) {
    throw new Error(`Thiếu token màu "${name}" trong BRAND_PALETTE — báo lại, đừng bịa hex mới.`)
  }
  return swatch.hex
}

export const COLOR_INK = paletteHex('Deep Navy')
export const COLOR_MUTED = paletteHex('Slate Gray')
export const COLOR_BORDER = paletteHex('Light Gray')
export const COLOR_ACCENT = paletteHex('Pebble Blue')
export const COLOR_BG = paletteHex('White')
export const COLOR_ALERT = paletteHex('Flag Red')

/** Mặt phẳng LÕM — nền chân thư và nền hộp số liệu, để một khối lùi lại một
 *  bậc so với nền trắng mà không cần vẽ viền (luật 4).
 *
 *  Cùng hex với `COLOR_BORDER` hôm nay, và vẫn là hai hằng số: một cái là
 *  đường kẻ, một cái là mặt phẳng. Bảng token chưa có ô "surface" riêng, nên
 *  cả hai cùng đọc `Light Gray` — ngày nào bảng có thì đúng một dòng dưới đây
 *  đổi, thay vì phải đi tìm xem chỗ nào trong bốn template đang dùng
 *  `COLOR_BORDER` với nghĩa nào. */
export const COLOR_SURFACE = paletteHex('Light Gray')

/** MÀU CỦA HÀNH ĐỘNG — nền nút, màu liên kết. Khác `COLOR_ACCENT` một cách
 *  cố ý, và bảng token đã nói trước điều đó: ô `Azure` mang ghi chú "resolves
 *  --primary for @pv/mail-templates", tức nó sinh ra chính cho chỗ này, còn
 *  `Pebble Blue` là màu nhận diện.
 *
 *  Khác biệt không phải là khẩu vị. Dải đầu thư dùng `Deep Navy`, và một nút
 *  `Pebble Blue` đặt dưới đó là xanh đậm trên xanh đậm — mắt không tách được
 *  "đây là chỗ bấm" khỏi "đây là logo". Hai vai, hai màu: navy là ai gửi,
 *  azure là bấm vào đâu. Trắng trên `Azure` đo 5.14:1, qua ngưỡng 4.5:1. */
export const COLOR_PRIMARY = paletteHex('Azure')

/** Bảng kiểu Google Fonts cho `Be Vietnam Pro`.
 *
 *  Nạp bằng `<link>` trong `<head>`, và ĐÓ LÀ MỘT PHÉP NÂNG CẤP CƠ HỘI chứ
 *  không phải một yêu cầu. Outlook desktop và Gmail — cả web lẫn app — bóc
 *  `<link>`/`@import` khỏi `<head>`, nên với phần lớn hộp thư doanh nghiệp
 *  dòng này không tồn tại. Chỗ nó thật sự hiện là Apple Mail và iOS Mail.
 *
 *  Vì thế `FONT_STACK` bên dưới phải tự đứng vững khi không có gì tải về, và
 *  phải được gắn INLINE trên từng thẻ chữ chứ không chỉ trên `<body>`: engine
 *  Word của Outlook không cho `font-family` thừa kế đáng tin vào trong
 *  `<table>`, mà `Row`/`Column`/`Section` đều là bảng. */
export const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap'

/** Phông thân thư.
 *
 *  `Be Vietnam Pro` đứng đầu vì nó được vẽ riêng cho tiếng Việt: dấu hỏi, dấu
 *  ngã và dấu mũ chồng nhau được tính từ đầu chứ không phải ghép thêm vào một
 *  phông Latin, nên ở cỡ 15px với `lineHeight` 25px thì dấu của dòng dưới
 *  không chạm chân dòng trên. Đây là khác biệt thật giữa nó và Poppins, thứ
 *  đẹp ở tiêu đề tiếng Anh nhưng nặng mắt ở đoạn văn tiếng Việt dài.
 *
 *  `Inter` đứng thứ hai — phông của chính app (`globals.css`), nên máy nào có
 *  sẵn thì thư và màn hình trông cùng một nhà.
 *
 *  `Segoe UI Variable Text` chèn trước `Segoe UI` vì Windows 11 đặt tên khác
 *  cho bản mới, và bản mới có chữ số dễ đọc hơn hẳn ở cỡ 12–13px — đúng cỡ
 *  của chân thư.
 *
 *  KẾT THÚC BẰNG `Arial, sans-serif`, và đó không phải thói quen: engine Word
 *  của Outlook rơi về Times New Roman khi không phân giải được cả chuỗi, và
 *  một lá thư Times New Roman là dấu hiệu rõ nhất của "ai đó vừa thêm webfont
 *  vào email". Một họ chung ở cuối chuỗi là thứ chặn điều đó. */
export const FONT_STACK =
  "'Be Vietnam Pro', Inter, -apple-system, BlinkMacSystemFont, " +
  "'Segoe UI Variable Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/** CHỮ SỐ ĐỀU CỘT. Rải lên mọi chỗ in số — mã lead, tiền, ngày giờ, số đếm.
 *
 *  Phông tỉ lệ mặc định vẽ `1` hẹp hơn `8`, nên hai dòng số xếp trên nhau
 *  không thẳng cột và mắt phải đọc lại từng chữ số thay vì so theo hình. Đây
 *  là khác biệt lớn nhất giữa "một bảng số" và "một đống số".
 *
 *  Hai thuộc tính cho cùng một việc: `fontVariantNumeric` là cách hiện đại,
 *  `fontFeatureSettings` là cách các engine cũ hơn hiểu — trong đó có WebKit
 *  bản cũ mà một số client mail trên máy tính vẫn nhúng. Client nào không
 *  hiểu cả hai thì bỏ qua cả hai và chữ số vẫn hiện bình thường. */
export const NUMERIC = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: "'tnum' 1",
} as const

export const BODY_STYLE = {
  backgroundColor: COLOR_BG,
  margin: 0,
  padding: '24px 0',
  fontFamily: FONT_STACK,
} as const

export const CONTAINER_STYLE = { maxWidth: 560, margin: '0 auto', padding: '0 24px' } as const

/** Giờ Việt Nam, luôn luôn. Người đọc mail này ngồi ở đây, và một mốc UTC in
 *  thẳng ra là một phép trừ bảy tiếng bắt người đọc tự làm. */
export function formatMoment(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date)
}

/** Ngày, không giờ — ngày đóng dự kiến không có giờ để mà in.
 *
 *  Ghép `T00:00:00+07:00` chứ không `new Date('2026-10-15')`: chuỗi ngày trần
 *  được đọc là UTC, nên ở múi giờ Việt Nam nó in ra đúng ngày hôm đó, còn ở một
 *  máy chủ đặt múi âm thì lùi một ngày. Mail gửi từ Fly.io, giờ máy là UTC. */
export function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00+07:00`)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date)
}

/** Tiền kèm đơn vị. `undefined` = đơn chưa có giá trị, và `Field` bỏ hẳn dòng
 *  đó chứ không in "0 ₫" — không có số và số bằng không là hai câu khác nhau. */
export function formatMoney(amount: number | null, currency: string | null): string | undefined {
  if (amount === null || currency === null) return undefined
  return `${new Intl.NumberFormat('vi-VN').format(amount)} ${currency === 'VND' ? '₫' : currency}`
}
