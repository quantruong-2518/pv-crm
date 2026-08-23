import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import { createAccessControl, type Actor } from '@pv/engines'

/** Phiên đăng nhập — MÁY TRẠNG THÁI, không phải một ô `actor | null`.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO PHẢI LÀ MÁY TRẠNG THÁI
 *  ------------------------------------------------------------------
 *  Bản trước giữ đúng một thứ: `actor`. Với `actor` là `null`, app không phân
 *  biệt được ba tình huống khác hẳn nhau, và cả ba đều có thật:
 *
 *   · **chưa biết** — app vừa mở, chưa đọc xong kho (mai này là chưa gọi xong
 *     `/me`). Đối xử như "chưa đăng nhập" thì mỗi lần F5 ở trang trong, người
 *     dùng bị đá về màn đăng nhập rồi mới quay lại — lỗi kinh điển, và nó chỉ
 *     lộ ra đúng lúc cắm backend thật;
 *   · **chưa đăng nhập** — đá về màn đăng nhập là đúng;
 *   · **phiên chết** — biết người là ai, chỉ là vé hết hạn. Đá về màn đăng nhập
 *     thì họ mất trang đang đọc dở và không hiểu vì sao; đúng ra phải khoá màn
 *     tại chỗ và cho đăng nhập lại rồi trả về đúng chỗ cũ.
 *
 *  Năm trạng thái dưới đây là năm câu trả lời đó, cộng trạng thái đang xác thực.
 *
 *  ------------------------------------------------------------------
 *  CÁI NÀY CỐ TÌNH KHÔNG CÓ: TOKEN GIẢ
 *  ------------------------------------------------------------------
 *  Không có `accessToken: 'pv.eyJ…'` trong kho. Cùng lý do `data/auth.ts` không
 *  giữ mật khẩu: một chuỗi trông như JWT nằm trong localStorage sẽ được người
 *  đọc code sau này tin là thật, và sẽ có người viết luật bảo mật dựa trên nó.
 *
 *  Thứ POC có thật, và có ích, là **HẠN của vé**: phiên hết hạn khi ngồi không
 *  quá lâu, và chết hẳn sau một ca làm việc. Hạn là thứ kiểm chứng được ngay hôm
 *  nay bằng đồng hồ, và là thứ điều khiển toàn bộ luồng còn lại (khoá màn, gia
 *  hạn, đăng nhập lại). Khi có backend, `Ticket` mọc thêm trường token và
 *  `issue()` đổi thành lời gọi mạng — phần còn lại của app không đụng. */

const KEY = 'pv-session'

/** E2 · một bản duy nhất cho cả app. Mọi lần chặn đường đều ghi vết ở đây —
 *  "nhánh không tự kiểm quyền" — luật engine. */
export const access = createAccessControl()

export type AuthStatus =
  /** Chưa biết — đang đọc kho, hoặc mai này đang chờ `/me`. */
  | 'khởi-động'
  /** Chắc chắn chưa đăng nhập. */
  | 'khách'
  /** Đang xác thực — form đã gửi, chưa có kết luận. */
  | 'đang-vào'
  | 'đã-vào'
  /** Biết người là ai, vé không còn hiệu lực. */
  | 'hết-hạn'

/** Vì sao phiên chết. Màn khoá nói ba câu khác nhau, vì người dùng cần biết
 *  mình vừa mất phiên do bỏ đi pha cà phê hay do hết ca làm việc. */
export type ExpiryReason = 'ngồi-không' | 'hết-ca' | 'bị-thu-hồi'

/** Hạn của phiên, tính bằng mili giây.
 *
 *  Con số bám theo cách người ta thật sự dùng ERP trong văn phòng, không bám
 *  theo mặc định của thư viện nào:
 *
 *  · **30 phút ngồi không** — đủ dài cho một cuộc họp ngắn, đủ ngắn để cái máy
 *    bỏ quên ở phòng họp không còn mở sổ lead của cả phòng.
 *  · **12 giờ tuyệt đối** — một ca làm việc. Hết ca thì đăng nhập lại, kể cả
 *    khi đang gõ liên tục.
 *  · **7 ngày cho "Nhớ tôi"** — và nhớ tôi TẮT hẳn hạn ngồi không: người tick ô
 *    đó đang nói "máy này là máy của tôi". Giữ hạn ngồi không cho họ thì sáng
 *    hôm sau mở máy vẫn phải đăng nhập lại, tức ô đó chẳng nhớ được gì. */
export const SESSION_LIMITS = {
  idle: 30 * 60_000,
  absolute: 12 * 60 * 60_000,
  remembered: 7 * 24 * 60 * 60_000,
  /** Cảnh báo trước khi hết hạn — đủ để gõ nốt một câu ghi chú rồi bấm gia hạn. */
  warnBefore: 2 * 60_000,
} as const

/** Vé phiên. Hai mốc chết, không phải một:
 *
 *  `expiresAt` là mốc TUYỆT ĐỐI, không gia hạn được bằng cách ngồi gõ.
 *  `idleUntil` là mốc vì ngồi không, mỗi lần chạm màn lại đẩy ra xa. `null` =
 *  không tính (đã tick "Nhớ tôi").
 *
 *  Thiếu mốc tuyệt đối thì một tab để mở và một con chuột rung nhẹ giữ phiên
 *  sống vô hạn — đúng thứ giới hạn phiên sinh ra để chặn. */
export type Ticket = {
  actorId: string
  issuedAt: number
  expiresAt: number
  idleUntil: number | null
}

function issue(actorId: string, remember: boolean, now: number): Ticket {
  return {
    actorId,
    issuedAt: now,
    expiresAt: now + (remember ? SESSION_LIMITS.remembered : SESSION_LIMITS.absolute),
    idleUntil: remember ? null : now + SESSION_LIMITS.idle,
  }
}

/** Vé còn sống không, và nếu chết thì chết vì gì. `null` = còn sống.
 *
 *  Trả LÝ DO chứ không trả boolean vì màn khoá phải nói đúng câu — cùng một lý
 *  do với `DenyReason` của E2, và cùng một cái giá khi trộn: người dùng bị dạy
 *  sai về nguyên nhân thì họ sửa nhầm chỗ. */
export function ticketDeath(ticket: Ticket | null, now: number): ExpiryReason | null {
  if (!ticket) return 'bị-thu-hồi'
  if (now >= ticket.expiresAt) return 'hết-ca'
  if (ticket.idleUntil !== null && now >= ticket.idleUntil) return 'ngồi-không'
  return null
}

type SessionState = {
  status: AuthStatus
  /** Còn giữ khi phiên `hết-hạn` — màn khoá cần chào đúng tên và điền sẵn email.
   *  Chỉ `signOut` mới xoá. */
  actor: Actor | null
  ticket: Ticket | null
  remember: boolean
  expiredBy: ExpiryReason | null
  /** Phiên chết TRONG LÚC đang làm việc ở tab này, hay chết từ trước khi mở app.
   *
   *  Hai cảnh khác nhau nên xử khác nhau. Chết giữa chừng thì phía sau còn một
   *  màn đang mở đáng giữ — khoá tại chỗ. Mở app lên đã thấy vé chết thì phía
   *  sau chẳng có gì, phủ một lớp khoá lên màn trắng chỉ làm người dùng tưởng
   *  app hỏng — về thẳng màn đăng nhập.
   *
   *  Không persist: đây là chuyện của tab này, trong lần chạy này. */
  lockInPlace: boolean

  /** Kết luận trạng thái sau khi đọc xong kho. Mai này là chỗ gọi `/me`. */
  bootstrap: () => void
  /** Form đã gửi — dùng để khoá nút và chặn gửi hai lần. */
  beginSignIn: () => void
  signIn: (actor: Actor, opts?: { remember?: boolean }) => void
  /** Người dùng còn ngồi đó — đẩy mốc ngồi không ra xa. */
  touch: (now?: number) => void
  expire: (reason: ExpiryReason) => void
  signOut: () => void
}

/** Ô "Nhớ tôi" quyết định phiên nằm ở KHO NÀO, không phải nằm bao lâu — bao lâu
 *  là việc của `SESSION_LIMITS`.
 *
 *  Tick  → `localStorage`, sống qua lần đóng trình duyệt.
 *  Không → `sessionStorage`, chết cùng tab. Đây mới là thứ người dùng thật sự
 *          xin khi họ bỏ trống ô đó trên máy phòng họp.
 *
 *  Đọc thì ưu tiên `sessionStorage`: người vừa đăng nhập không-nhớ trên máy đã
 *  từng có phiên nhớ phải thấy phiên MỚI, không phải phiên cũ còn sót. Ghi thì
 *  xoá kho kia trước — hai kho cùng giữ phiên là hai câu trả lời khác nhau cho
 *  câu hỏi "ai đang đăng nhập", và lần sau F5 sẽ bốc trúng cái sai. */
const rememberAware: PersistStorage<SessionState> = {
  getItem: (name) => {
    const raw = sessionStorage.getItem(name) ?? localStorage.getItem(name)
    if (!raw) return null
    try {
      return JSON.parse(raw) as StorageValue<SessionState>
    } catch {
      /* Dữ liệu cũ hoặc hỏng tay: coi như chưa đăng nhập còn hơn là ném lỗi
         ngay lúc app khởi động, vì lúc đó chưa có màn nào để hiện lỗi. */
      return null
    }
  },
  setItem: (name, value) => {
    const keep = value.state.remember ? localStorage : sessionStorage
    const drop = value.state.remember ? sessionStorage : localStorage
    drop.removeItem(name)
    keep.setItem(name, JSON.stringify(value))
  },
  removeItem: (name) => {
    sessionStorage.removeItem(name)
    localStorage.removeItem(name)
  },
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      status: 'khởi-động',
      actor: null,
      ticket: null,
      remember: false,
      expiredBy: null,
      lockInPlace: false,

      bootstrap: () => {
        const { actor, ticket } = get()
        /* `actor` đọc từ kho của trình duyệt là DỮ LIỆU NGOÀI, không phải thứ
           kiểu `Actor` bảo đảm: nó có thể là phiên lưu từ một bản cũ, thiếu
           đúng trường mà luật quyền bám vào. Không có vai thì không phải một
           phiên — bắt đăng nhập lại còn hơn để một người đi tiếp với quyền
           không ai tra được. */
        if (!actor?.roleId)
          return set({ status: 'khách', actor: null, ticket: null, expiredBy: null })

        const death = ticketDeath(ticket, Date.now())
        if (death) {
          /* Vé chết trong lúc app đóng — thường là máy ngủ qua đêm. Vẫn giữ
             `actor` để màn đăng nhập điền sẵn được; xoá vé để không ai dùng lại.
             `lockInPlace: false` vì phía sau không có màn nào để khoá. */
          return set({ status: 'hết-hạn', ticket: null, expiredBy: death, lockInPlace: false })
        }
        set({ status: 'đã-vào', expiredBy: null })
      },

      beginSignIn: () => set({ status: 'đang-vào' }),

      signIn: (actor, opts) => {
        const remember = opts?.remember ?? get().remember
        access.log({ actorId: actor.id, action: 'xem', note: 'đăng nhập' })
        set({
          status: 'đã-vào',
          actor,
          ticket: issue(actor.id, remember, Date.now()),
          remember,
          expiredBy: null,
          lockInPlace: false,
        })
      },

      touch: (now = Date.now()) => {
        const { status, ticket } = get()
        /* Chỉ gia hạn phiên ĐANG SỐNG. Chạm màn khi phiên đã chết không được
           hồi sinh nó — nếu được thì cái mốc ngồi không chẳng chặn được ai:
           người dùng quay lại sau hai tiếng, chạm chuột, và phiên tự sống dậy. */
        if (status !== 'đã-vào' || !ticket || ticket.idleUntil === null) return
        set({ ticket: { ...ticket, idleUntil: now + SESSION_LIMITS.idle } })
      },

      expire: (reason) => {
        const { status, actor } = get()
        if (status !== 'đã-vào' && status !== 'đang-vào') return
        if (actor) {
          access.log({ actorId: actor.id, action: 'xem', note: `phiên hết hạn · ${reason}` })
        }
        /* Chết giữa chừng thì phía sau còn một màn đang mở — khoá tại chỗ. */
        set({ status: 'hết-hạn', ticket: null, expiredBy: reason, lockInPlace: true })
      },

      /* Đăng xuất dọn CẢ HAI kho, không chỉ kho đang dùng — `removeItem` của
         `rememberAware` lo việc đó. Giữ `remember` lại để lần đăng nhập sau ô
         còn nhớ lựa chọn cũ. */
      signOut: () =>
        set({
          status: 'khách',
          actor: null,
          ticket: null,
          expiredBy: null,
          lockInPlace: false,
        }),
    }),
    {
      name: KEY,
      storage: rememberAware,
      /* Hình dạng phiên đã đổi (thêm vé, thêm `roleId`) — phiên lưu từ bản
         trước không nâng cấp được thành phiên hợp lệ, và đoán bù trường thiếu
         là tự cấp quyền cho người khác. Bỏ đi, bắt đăng nhập lại: mất một lần
         gõ mật khẩu, đổi lấy việc không ai đi tiếp với một phiên nửa vời.
         Tăng số này mỗi lần đổi hình dạng những gì `partialize` lưu. */
      version: 2,
      migrate: () => ({ actor: null, ticket: null, remember: false }) as SessionState,
      /* `status` KHÔNG được lưu: nó là kết luận, và kết luận phải tính lại mỗi
         lần mở app từ vé thật. Lưu 'đã-vào' vào kho là tự cho mình một phiên
         hợp lệ chỉ bằng cách sửa localStorage. */
      partialize: (s) =>
        ({ actor: s.actor, ticket: s.ticket, remember: s.remember }) as SessionState,
      onRehydrateStorage: () => (state) => state?.bootstrap(),
    },
  ),
)

/** Đọc phiên ngoài React — interceptor và lifecycle cần, và chúng không phải
 *  component nên không gọi hook được. */
export const sessionSnapshot = () => useSession.getState()
