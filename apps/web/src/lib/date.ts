/** Ngày tháng cho giao diện. Kịch bản đóng băng nên mọi mốc là chuỗi ISO cố
 *  định — hàm ở đây chỉ đọc chuỗi đó, KHÔNG bao giờ gọi `new Date()` không tham
 *  số. Một màn dựng lại hai lần phải ra đúng một chữ. */

/** '2026-06-24T09:00:00+07:00' → '24/06' */
export function dm(iso: string): string {
  const [, m = '', d = ''] = iso.slice(0, 10).split('-')
  return `${d}/${m}`
}

/** '2026-06-24T09:00:00+07:00' → '24/06/2026' */
export function dmy(iso: string): string {
  const [y = '', m = '', d = ''] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
