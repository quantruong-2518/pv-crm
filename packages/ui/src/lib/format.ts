/** Tiền chuẩn VN: phẩy thập phân, chấm ngăn nghìn (luật 6 · CLAUDE.md).
 *  Không tự làm tròn khác với con số đã chốt trong kịch bản dữ liệu. */

const vi = (value: number, fractionDigits: number) =>
  value.toLocaleString('vi-VN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })

/** 1_840_000_000 → "1,84 tỷ" · dùng cho KPI hero (Space Grotesk). */
export function billions(dong: number, fractionDigits = 2) {
  return `${vi(dong / 1_000_000_000, fractionDigits)} tỷ`
}

/** 128_500_000 → "128,5 tr" · dùng trong thẻ. */
export function millions(dong: number, fractionDigits = 1) {
  return `${vi(dong / 1_000_000, fractionDigits)} tr`
}

/** 1_840_000_000 → "1.840.000.000 ₫" · dùng trong bảng (IBM Plex Mono). */
export function dong(value: number) {
  return `${vi(value, 0)} ₫`
}

/** 0.68 → "68%" · phần trăm luôn tabular, không có khoảng trắng trước dấu %. */
export function percent(ratio: number, fractionDigits = 0) {
  return `${vi(ratio * 100, fractionDigits)}%`
}
