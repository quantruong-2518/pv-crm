import { renewOnServer } from '@/data/auth'
import { ticketDeath, useSession } from './session'

/** Gia hạn vé phiên — MỘT lần bay, dù mười chỗ cùng xin.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO PHẢI CHỐNG BAY ĐÀN (single-flight)
 *  ------------------------------------------------------------------
 *  Một màn sổ mở ra bắn năm query cùng lúc. Vé vừa hết hạn thì cả năm cùng nhận
 *  401 và cả năm cùng đòi gia hạn. Máy chủ nào có xoay vòng phiên sẽ nhận ra
 *  bốn cái sau dùng một phiên đã tiêu và **thu hồi cả phiên**. Triệu chứng nhìn
 *  thấy là người dùng bị đá ra ngay giữa lúc màn đang tải, ngẫu nhiên, không
 *  lặp lại được.
 *
 *  Vì thế: lần xin đầu tiên tạo lời hứa, mọi người sau nắm chung lời hứa đó.
 *
 *  ------------------------------------------------------------------
 *  ĐƯỜNG NÀY KHÔNG ĐI QUA `apiClient`, VÀ ĐÓ LÀ LUẬT CỨNG
 *  ------------------------------------------------------------------
 *  Interceptor bắt 401 rồi gọi gia hạn; gia hạn mà cũng đi qua interceptor thì
 *  cái 401 của chính nó lại gọi gia hạn — một vòng lặp tự nuôi mình, và nó chỉ
 *  lộ ra đúng lúc phiên hỏng thật, tức lúc khó gỡ nhất.
 *
 *  `renewOnServer` là một `fetch` TRẦN: nó nằm cùng chỗ với ba cửa auth kia
 *  trong `data/auth.ts` (`knock`), không chạm vào chuỗi interceptor, và không
 *  thể chạm được — `data/auth.ts` cố tình không import `@/app/api`. Lý do đầy
 *  đủ nằm ở đầu file đó. Đây vẫn là một trong bốn đường duy nhất trong app được
 *  phép gọi mạng thẳng; đường thứ năm thì không. */

let inflight: Promise<boolean> | null = null

/** Xin máy chủ một cửa sổ phiên mới.
 *
 *  Máy chủ là bên quyết định, không phải đồng hồ ở đây: nó biết phiên còn hạn
 *  tuyệt đối hay không, biết tài khoản có vừa bị khoá không, và biết mật khẩu
 *  có vừa bị đặt lại không — ba câu hỏi mà trình duyệt không có cách nào trả
 *  lời. Nó trả về cửa sổ mới thì ghi đè hạn; nó từ chối thì hết đường, và tính
 *  chất quan trọng nhất được giữ nguyên từ bản POC: **gia hạn không vượt qua
 *  được hạn tuyệt đối**. Thiếu tính chất đó thì phiên nào cũng sống mãi và giới
 *  hạn phiên chỉ còn là trang trí. */
async function askForNewTicket(): Promise<boolean> {
  const session = await renewOnServer()
  if (!session) return false
  useSession.getState().adoptSession(session)
  return true
}

/** Xin vé mới. Trả `false` nghĩa là hết đường — chỗ gọi phải cho phiên chết,
 *  đừng thử lại vòng hai. */
export function renewSession(): Promise<boolean> {
  if (inflight) return inflight

  inflight = askForNewTicket()
    .then((ok) => {
      if (!ok) {
        const { ticket, expire } = useSession.getState()
        expire(ticketDeath(ticket, Date.now()) ?? 'bị-thu-hồi')
      }
      return ok
    })
    .finally(() => {
      inflight = null
    })

  return inflight
}

/** Phiên có đủ sống để bắn một request đi không.
 *
 *  Hỏi bằng đồng hồ THẬT chứ không tin `status` trong store: hẹn giờ của
 *  `lifecycle` có thể chưa bắn (máy vừa ngủ dậy), và trong khoảng đó `status`
 *  vẫn nói 'đã-vào' trong khi vé đã chết từ lâu. */
export function sessionIsLive(): boolean {
  const { status, ticket } = useSession.getState()
  return status === 'đã-vào' && ticketDeath(ticket, Date.now()) === null
}
