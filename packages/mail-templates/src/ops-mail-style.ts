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

/** Phông hệ thống, KHÔNG phải link webfont — Outlook desktop và vài client
 *  doanh nghiệp khác bóc `<link>`/`@import` khỏi `<head>` của email, nên một
 *  webfont cũng sẽ rơi về phông hệ thống, chỉ là rơi khó đoán hơn. */
export const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

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
