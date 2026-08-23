import { SESSION_LIMITS, ticketDeath, useSession } from './session'

/** Gia hạn vé phiên — MỘT lần bay, dù mười chỗ cùng xin.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO PHẢI CHỐNG BAY ĐÀN (single-flight)
 *  ------------------------------------------------------------------
 *  Một màn sổ mở ra bắn năm query cùng lúc. Vé vừa hết hạn thì cả năm cùng nhận
 *  401 và cả năm cùng đòi gia hạn. Với refresh token thật, đó là năm lời gọi
 *  `/auth/refresh` bằng cùng một token — máy chủ nào có xoay vòng token sẽ nhận
 *  ra bốn cái sau dùng token đã tiêu và **thu hồi cả phiên**. Triệu chứng nhìn
 *  thấy là người dùng bị đá ra ngay giữa lúc màn đang tải, ngẫu nhiên, không
 *  lặp lại được.
 *
 *  Vì thế: lần xin đầu tiên tạo lời hứa, mọi người sau nắm chung lời hứa đó.
 *
 *  ------------------------------------------------------------------
 *  KHI CÓ BACKEND: GỌI `fetch` TRẦN Ở ĐÂY, ĐỪNG QUA `apiClient`
 *  ------------------------------------------------------------------
 *  Đường gia hạn không được đi qua interceptor — interceptor bắt 401 rồi gọi
 *  gia hạn, gia hạn lại đi qua interceptor rồi lại 401: một vòng lặp tự nuôi
 *  mình, và nó chỉ lộ ra khi refresh token hỏng thật. Đây là chỗ duy nhất trong
 *  app được phép gọi mạng thẳng. */

let inflight: Promise<boolean> | null = null

/** Hôm nay chưa có máy chủ để hỏi, nên "gia hạn" là câu hỏi thuần cục bộ: vé
 *  còn trong hạn TUYỆT ĐỐI không?
 *
 *  · còn  → đẩy mốc ngồi không ra xa, coi như máy chủ đã cấp vé mới;
 *  · hết  → không cách nào cứu, phiên chết vì hết ca.
 *
 *  Đây không phải mô phỏng cho vui: nó giữ đúng tính chất quan trọng nhất của
 *  refresh thật — **gia hạn không vượt qua được hạn tuyệt đối**. Thiếu tính
 *  chất đó thì phiên nào cũng sống mãi và giới hạn phiên chỉ còn là trang trí. */
async function askForNewTicket(): Promise<boolean> {
  const { ticket, touch } = useSession.getState()
  if (!ticket) return false
  if (Date.now() >= ticket.expiresAt - SESSION_LIMITS.warnBefore) {
    /* Trừ đi cửa sổ cảnh báo: cấp một vé chỉ sống thêm vài giây là đẩy người
       dùng vào đúng cảnh mất việc đang gõ dở, chỉ chậm hơn một nhịp. */
    return false
  }
  touch()
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
