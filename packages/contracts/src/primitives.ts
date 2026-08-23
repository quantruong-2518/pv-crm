import { z } from 'zod'

/** Nguyên thuỷ dùng chung — bốn thứ lặp lại ở mọi endpoint.
 *
 *  Định nghĩa MỘT lần ở đây chứ không `z.string()` rải khắp nơi: một chuỗi
 *  ngày viết `z.string()` ở mười chỗ là mười cơ hội để chỗ thứ mười nhận
 *  '17/08/2026' trong khi chín chỗ kia nhận '2026-08-17'.
 *
 *  Tên tiếng Việt không dấu, đúng luật định-danh-vs-nhãn của `e2-access.ts`:
 *  đây là khoá của hệ, nó đi vào JSON và log, nên không mang dấu. */

/** Ngày lịch, không giờ. 'YYYY-MM-DD'. */
export const Ngay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng YYYY-MM-DD')

/** Mốc thời gian tuyệt đối, ISO 8601 kèm múi. */
export const Moc = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/, 'Mốc phải là ISO 8601 có múi giờ')

/** Tiền, ĐƠN VỊ ĐỒNG, số nguyên.
 *
 *  Số nguyên vì đồng không có phần lẻ, và vì float làm tổng của 100 dòng sổ
 *  lệch ở chữ số thứ mười lăm — đủ để hai màn cùng đọc một nguồn mà hiện hai
 *  con số. Nợ số 7 của `docs/ban-giao-backend.md` (tiền không mang tiền tệ)
 *  sửa bằng cách bọc thành `{ amount, currency }` khi có đơn ngoại tệ thật;
 *  hôm nay khai rõ đơn vị ở tên là bước một. */
export const Dong = z.number().int().nonnegative()

/** Mã object — 'LD-0042', 'OP-0301'. ASCII, không dấu (nợ số 1). */
export const MaObject = z.string().regex(/^[A-Z]{1,3}-\d{3,6}$/, 'Mã object sai dạng')

export type Ngay = z.infer<typeof Ngay>
export type Moc = z.infer<typeof Moc>
export type Dong = z.infer<typeof Dong>
export type MaObject = z.infer<typeof MaObject>

/** Cờ bật/tắt ĐI QUA QUERY STRING.
 *
 *  KHÔNG dùng `z.coerce.boolean()` ở đây, và đây là lý do — nó gọi thẳng
 *  `Boolean(value)`, mà mọi thứ tới từ query string đều là chuỗi:
 *
 *      Boolean('true')  === true
 *      Boolean('false') === true      ← ô lọc thôi lọc, im lặng
 *      Boolean('0')     === true      ←
 *
 *  Một ô lọc luôn trả nhánh `true` không báo lỗi, không đỏ test, và chỉ lộ ra
 *  khi có người hỏi "sao bấm 'đã rơi' vẫn ra đủ sổ". Nhận đúng hai chuỗi rồi
 *  tự đổi sang boolean thì `?running=xyz` là lỗi 400 nói rõ tên ô. */
export const Bool = z.enum(['true', 'false']).transform((v) => v === 'true')
