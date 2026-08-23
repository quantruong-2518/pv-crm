import type { Actor } from '@pv/engines'
import { dasVina } from '@pv/engines/fixtures/das-vina'

/** Luồng auth của POC — nơi DUY NHẤT biết "mật khẩu đúng nghĩa là gì".
 *
 *  Chưa có backend, nên ba màn auth không tự nghĩ ra luật riêng: chúng hỏi file
 *  này. Khi cắm backend thật, phần phải sửa gói gọn ở đây — bốn hàm dưới đổi
 *  thành lời gọi mạng, ba màn không phải chạm.
 *
 *  Điều file này CỐ TÌNH không làm: không giữ mật khẩu ở đâu cả. Không có
 *  `passwords: {…}` trong fixture, không có hash giả trong localStorage. Một
 *  kho mật khẩu giả trông y hệt kho mật khẩu thật với người đọc code sau này,
 *  và đó là thứ dễ vô tình đẩy lên production nhất. Ở POC, mật khẩu là một ô
 *  BẮT BUỘC GÕ có kiểm độ dài — không hơn.
 *
 *  Kịch bản: DAS Vina (khách chưa mua). Đúng một kịch bản cho cả ba màn auth. */

/** Độ dài tối thiểu. Có backend thì con số này về từ chính sách máy chủ. */
export const MIN_PASSWORD = 6

/** Hiện dưới ô email làm gợi ý gõ — người demo không phải đoán tên miền. */
export const EMAIL_HINT = 'ten@pebblevina.vn'

const norm = (email: string) => email.trim().toLowerCase()

/** Danh sách người đăng nhập được. KHÔNG export: không màn nào được bày danh
 *  sách tài khoản ra giao diện — bảng chọn vai đã bỏ 23/08, và một danh sách
 *  người dùng hiện trên màn đăng nhập là thứ chỉ có ở bản demo. Muốn biết email
 *  của vai nào thì mở fixture. */
const ACCOUNTS: Actor[] = dasVina.actors

export function findActorByEmail(email: string): Actor | null {
  const key = norm(email)
  return ACCOUNTS.find((a) => a.email === key) ?? null
}

/** Lỗi luôn gắn với MỘT ô — màn cần biết tô đỏ ô nào và đưa con trỏ về đâu.
 *  Một chuỗi lỗi chung chung ở đầu form thì người dùng phải tự dò lại cả form. */
export type AuthField = 'email' | 'password' | 'confirm'
export type AuthError = { field: AuthField; message: string }

/** Kiểm đăng nhập.
 *
 *  Thứ tự kiểm là cố ý: email trước, mật khẩu sau. Báo cả hai lỗi cùng lúc thì
 *  người dùng sửa cả hai chỗ trong khi chỉ sai một.
 *
 *  Ghi chú bảo mật cho lúc có backend: câu "Không tìm thấy tài khoản" nói cho
 *  người ngoài biết email nào CÓ trong hệ. Ở POC thì đây là đánh đổi có chủ ý —
 *  người demo gõ nhầm tên miền phải biết ngay mình sai chỗ nào. Lên thật thì
 *  gộp thành một câu "Email hoặc mật khẩu không đúng" và để máy chủ quyết. */
export function checkSignIn(email: string, password: string): AuthError | null {
  if (!norm(email)) return { field: 'email', message: 'Chưa nhập email.' }
  if (!findActorByEmail(email))
    return { field: 'email', message: 'Không tìm thấy tài khoản dùng email này.' }
  if (!password) return { field: 'password', message: 'Chưa nhập mật khẩu.' }
  if (password.length < MIN_PASSWORD)
    return { field: 'password', message: `Mật khẩu tối thiểu ${MIN_PASSWORD} ký tự.` }
  return null
}

/** Kiểm mật khẩu mới ở màn đặt lại. Ô xác nhận tồn tại để bắt lỗi gõ, nên nó
 *  phải được kiểm SAU khi mật khẩu chính đã hợp lệ — báo "hai ô không khớp"
 *  trong lúc ô đầu còn quá ngắn là bắt sửa nhầm chỗ. */
export function checkNewPassword(password: string, confirm: string): AuthError | null {
  if (!password) return { field: 'password', message: 'Chưa nhập mật khẩu mới.' }
  if (password.length < MIN_PASSWORD)
    return { field: 'password', message: `Mật khẩu tối thiểu ${MIN_PASSWORD} ký tự.` }
  if (password !== confirm) return { field: 'confirm', message: 'Hai ô chưa khớp nhau.' }
  return null
}

/** Vé đặt lại mật khẩu — thứ đi kèm link trong mail.
 *
 *  POC không gửi mail, nên vé phải sống được qua một lần tải trang: nó nằm trên
 *  URL chứ không nằm trong bộ nhớ React. Base64 của email, KHÔNG phải mã hoá —
 *  ai cũng giải ngược được, và đúng là nên thế: giấu nửa vời làm người đọc code
 *  tưởng chỗ này đã an toàn. Token thật do máy chủ ký và có hạn. */
export function makeResetTicket(email: string): string {
  return btoa(norm(email))
}

export function readResetTicket(token: string | null): Actor | null {
  if (!token) return null
  try {
    return findActorByEmail(atob(token))
  } catch {
    /* Token bị cắt hoặc gõ tay — base64 hỏng thì `atob` ném, và một link hỏng
       phải ra màn "link không dùng được", không phải màn trắng. */
    return null
  }
}
