import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import { SESSION_LIMITS, type SessionWindow } from '@pv/contracts'
import { createAccessControl, type Actor } from '@pv/engines'
import { probeSession, signOutOnServer } from '@/data/auth'

/** Phiên đăng nhập — MÁY TRẠNG THÁI, không phải một ô `actor | null`.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO PHẢI LÀ MÁY TRẠNG THÁI
 *  ------------------------------------------------------------------
 *  Bản trước giữ đúng một thứ: `actor`. Với `actor` là `null`, app không phân
 *  biệt được ba tình huống khác hẳn nhau, và cả ba đều có thật:
 *
 *   · **chưa biết** — app vừa mở, chưa gọi xong `/auth/me`. Đối xử như "chưa
 *     đăng nhập" thì mỗi lần F5 ở trang trong, người dùng bị đá về màn đăng
 *     nhập rồi mới quay lại — lỗi kinh điển, và nay nó có thật vì vòng `/me`
 *     là một vòng mạng thật;
 *   · **chưa đăng nhập** — đá về màn đăng nhập là đúng;
 *   · **phiên chết** — biết người là ai, chỉ là vé hết hạn. Đá về màn đăng nhập
 *     thì họ mất trang đang đọc dở và không hiểu vì sao; đúng ra phải khoá màn
 *     tại chỗ và cho đăng nhập lại rồi trả về đúng chỗ cũ.
 *
 *  Năm trạng thái dưới đây là năm câu trả lời đó, cộng trạng thái đang xác thực.
 *
 *  ------------------------------------------------------------------
 *  THERE IS STILL NO TOKEN HERE, AND NOW THERE CANNOT BE ONE
 *  ------------------------------------------------------------------
 *  The POC kept no fake `accessToken` because the next reader would have
 *  believed it. The real system keeps no token for a stronger reason: the
 *  session token is an HttpOnly cookie, so script cannot read it even to copy
 *  it here. That is the entire point — a second copy of the token sitting in
 *  `localStorage` is a copy XSS can reach, which is what HttpOnly was bought to
 *  prevent.
 *
 *  What this store holds instead is the session WINDOW the server stamped: when
 *  the session dies, and whether the sitting-still axis applies. That is enough
 *  to lock the screen on the right minute, and it is all the browser needs.
 *
 *  ------------------------------------------------------------------
 *  WHAT IS PERSISTED IS A HINT, NOT AN AUTHORITY
 *  ------------------------------------------------------------------
 *  `{ actor, ticket, remember }` still go to storage, and the next person to
 *  read this file must not mistake what they are for. They are a CACHE of the
 *  last thing the server said, kept so a reload has a name and a role to paint
 *  with the moment `/auth/me` confirms them, and so the lock screen can greet
 *  the right person after a laptop has been shut overnight.
 *
 *  They grant nothing. `bootstrap` asks `/auth/me` on every start and the
 *  answer replaces them; the cookie, which this app cannot forge, is what the
 *  server actually reads. Editing `pv-session` in DevTools buys a wrong name in
 *  the corner and a countdown that lies — every request still goes out with the
 *  same cookie and comes back with the same permissions. The one exception is
 *  deliberate and documented at `bootstrap`: when the API cannot be reached at
 *  all, the hint is used rather than logging everybody out. */

const KEY = 'pv-session'

/** E2 · một bản duy nhất cho cả app. Mọi lần chặn đường đều ghi vết ở đây —
 *  "nhánh không tự kiểm quyền" — luật engine. */
export const access = createAccessControl()

/** Hạn của phiên — MỘT bảng, do máy chủ và màn cùng đọc.
 *
 *  Re-exported rather than declared: these four numbers used to live here as
 *  well as on the server, and two copies of them fail quietly. The screen would
 *  warn at two minutes left while the server had already cut the session off,
 *  so the warning arrives after the lock instead of before it and nobody
 *  notices until a user complains that the countdown lies. The reasoning behind
 *  each number is written where they now live, in `@pv/contracts`. */
export { SESSION_LIMITS }

export type AuthStatus =
  /** Chưa biết — đang chờ `/auth/me` trả lời. */
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

/** Vé phiên — MỘT BẢN SAO của `SessionWindow` máy chủ đã đóng dấu, tính bằng
 *  mili giây thay vì chuỗi ISO.
 *
 *  Hai mốc chết, không phải một: `expiresAt` là mốc TUYỆT ĐỐI, không gia hạn
 *  được bằng cách ngồi gõ; `idleUntil` là mốc vì ngồi không, mỗi lần chạm màn
 *  lại đẩy ra xa; `null` = không tính (đã tick "Nhớ tôi"). Thiếu mốc tuyệt đối
 *  thì một tab để mở và một con chuột rung nhẹ giữ phiên sống vô hạn — đúng thứ
 *  giới hạn phiên sinh ra để chặn.
 *
 *  Milliseconds and not the ISO strings the wire carries, because every reader
 *  of this shape — `ticketDeath`, the expiry timer in `lifecycle.ts`, the
 *  countdown in `expiry.tsx` — compares against `Date.now()`. Parsing once here
 *  beats parsing in three places at a rate of sixty times a minute, and it
 *  keeps `Date.parse` out of the comparison, where a silent `NaN` would make
 *  every `>=` false and the session immortal on this machine.
 *
 *  There is no `actorId` any more. The browser no longer issues tickets, so a
 *  ticket can no longer disagree with the actor beside it; both arrive together
 *  from `/auth/me` or sign-in and are written in one `set`. A field nobody
 *  reads is a field the fourth reader will eventually treat as identity, and
 *  identity here is the cookie. */
export type Ticket = {
  issuedAt: number
  expiresAt: number
  idleUntil: number | null
}

/** The server's window → this app's ticket. The ONLY way a `Ticket` is made.
 *
 *  Safe to parse without guarding for `NaN`: every window reaching this
 *  function has already been through `SessionWindow` in `data/auth.ts`, whose
 *  `Moc` primitive rejects anything that is not ISO 8601 with an offset. That
 *  check belongs at the wire, not here — this is the second line of the same
 *  fence, and duplicating it would just mean two places to keep in step. */
export function ticketOf(session: SessionWindow): Ticket {
  return {
    issuedAt: Date.parse(session.issuedAt),
    expiresAt: Date.parse(session.expiresAt),
    idleUntil: session.idleUntil === null ? null : Date.parse(session.idleUntil),
  }
}

/** Vé còn sống không, và nếu chết thì chết vì gì. `null` = còn sống.
 *
 *  Trả LÝ DO chứ không trả boolean vì màn khoá phải nói đúng câu — cùng một lý
 *  do với `DenyReason` của E2, và cùng một cái giá khi trộn: người dùng bị dạy
 *  sai về nguyên nhân thì họ sửa nhầm chỗ.
 *
 *  Reads the browser's mirror, so it answers a moment early or a moment late on
 *  a skewed clock. That costs a confusing countdown and never a minute of
 *  access: the server holds the same two marks on the session row and re-checks
 *  them on every request. */
export function ticketDeath(ticket: Ticket | null, now: number): ExpiryReason | null {
  if (!ticket) return 'bị-thu-hồi'
  if (now >= ticket.expiresAt) return 'hết-ca'
  if (ticket.idleUntil !== null && now >= ticket.idleUntil) return 'ngồi-không'
  return null
}

type SessionState = {
  status: AuthStatus
  /** Còn giữ khi phiên `hết-hạn` — màn khoá cần chào đúng tên và điền sẵn email.
   *  Chỉ `signOut`/`clearSession` mới xoá. */
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

  /** Hỏi `/auth/me` rồi kết luận trạng thái. BẤT ĐỒNG BỘ — xem docblock của nó. */
  bootstrap: () => Promise<void>
  /** Form đã gửi — dùng để khoá nút và chặn gửi hai lần. */
  beginSignIn: () => void
  signIn: (actor: Actor, opts: { session: SessionWindow; remember?: boolean }) => void
  /** Vé mới vừa xin được — chỉ thay hạn, không đụng tới người hay trạng thái. */
  adoptSession: (session: SessionWindow) => void
  /** Người dùng còn ngồi đó — đẩy mốc ngồi không ra xa. */
  touch: (now?: number) => void
  expire: (reason: ExpiryReason) => void
  /** Dọn phiên TRÊN MÁY NÀY, không nói với máy chủ. */
  clearSession: () => void
  signOut: () => Promise<void>
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

/** Kết luận trạng thái TỪ CHÍNH KHO của trình duyệt, không hỏi ai.
 *
 *  Used at the two moments there is no server answer to use instead: a
 *  rehydrate triggered by another tab (that tab already asked `/auth/me`, and
 *  asking again per tab per sign-in is a request storm for one fact), and a
 *  bootstrap that could not reach the API at all.
 *
 *  `actor` đọc từ kho của trình duyệt là DỮ LIỆU NGOÀI, không phải thứ kiểu
 *  `Actor` bảo đảm: nó có thể là phiên lưu từ một bản cũ, thiếu đúng trường mà
 *  luật quyền bám vào. Không có vai thì không phải một phiên — bắt đăng nhập
 *  lại còn hơn để một người đi tiếp với quyền không ai tra được. */
function settleLocally(actor: Actor | null, ticket: Ticket | null): Partial<SessionState> {
  if (!actor?.roleId) return { status: 'khách', actor: null, ticket: null, expiredBy: null }

  const death = ticketDeath(ticket, Date.now())
  if (death) {
    /* Vé chết trong lúc app đóng — thường là máy ngủ qua đêm. Vẫn giữ `actor`
       để màn đăng nhập điền sẵn được; xoá vé để không ai dùng lại.
       `lockInPlace: false` vì phía sau không có màn nào để khoá. */
    return { status: 'hết-hạn', ticket: null, expiredBy: death, lockInPlace: false }
  }
  return { status: 'đã-vào', expiredBy: null }
}

/** Lần hỏi `/auth/me` đang bay. Chống gọi hai lần — xem `bootstrap`. */
let booting: Promise<void> | null = null

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      status: 'khởi-động',
      actor: null,
      ticket: null,
      remember: false,
      expiredBy: null,
      lockInPlace: false,

      /** Ai đang đăng nhập — hỏi MÁY CHỦ, và đó là lý do hàm này bất đồng bộ.
       *
       *  `'khởi-động'` tồn tại đúng cho cửa sổ này: từ lúc app có mặt tới lúc
       *  `/auth/me` trả lời, câu trả lời chưa có, và guard phải ĐỢI chứ không
       *  được đoán. Đoán "chưa đăng nhập" thì mỗi lần F5 ở trang trong là một
       *  cú nhảy về màn đăng nhập rồi quay lại — với một vòng mạng thật, cú nháy
       *  đó đủ dài để người dùng kịp bấm nhầm.
       *
       *  Ba câu trả lời, ba đường đi:
       *
       *   · **200** — máy chủ nói người này là ai. Ghi đè cả `actor` lẫn vé:
       *     thứ trong kho chỉ là bản ghi nhớ, thứ vừa về mới là sự thật.
       *   · **401** — chắc chắn chưa đăng nhập. Dọn sạch, kể cả `actor` cũ.
       *   · **KHÔNG TỚI ĐƯỢC** — không kết luận gì, dùng bản ghi nhớ.
       *
       *  Nhánh thứ ba là nhánh phải giải thích. Coi "không nối được máy chủ" là
       *  "chưa đăng nhập" nghe có vẻ an toàn, nhưng nó biến mỗi lần deploy API
       *  và mỗi lần rớt wifi thành một lần đăng xuất toàn bộ: mọi tab đang mở
       *  bật về màn đăng nhập, mọi phiếu đang điền dở mất theo, và không ai hiểu
       *  vì sao. Đổi lại, tin bản ghi nhớ KHÔNG cấp thêm gì cho ai: vé cũ vẫn
       *  phải còn hạn theo đồng hồ, mọi lời gọi dữ liệu tiếp theo vẫn đi tới
       *  đúng cái máy chủ không trả lời đó, và khi nó sống lại thì nó đọc cookie
       *  và tự phủ quyết. Màn hiện ra là màn không gọi được gì — đúng những gì
       *  đang xảy ra.
       *
       *  ------------------------------------------------------------------
       *  GỌI HAI LẦN: MỘT LẦN BAY, VÀ LẦN SAU LÀ VIỆC KHÁC
       *  ------------------------------------------------------------------
       *  Hàm này được treo ở `onRehydrateStorage`, và `lifecycle.ts` gọi lại nó
       *  một lần nữa làm lưới an toàn (nếu móc kia không chạy thì `status` kẹt ở
       *  'khởi-động' và cả app là một màn trắng, không lỗi, không log). Hai lời
       *  gọi đó xảy ra trong cùng một nhịp, nên `booting` gộp chúng thành đúng
       *  một vòng `/auth/me`.
       *
       *  `persist.rehydrate()` của đồng bộ đa tab cũng chạy lại móc đó, nhưng
       *  lúc ấy `status` đã rời 'khởi-động' — và đó là một câu hỏi khác hẳn:
       *  tab kia vừa đăng nhập hoặc vừa gia hạn, kho đã có câu trả lời mới, và
       *  hỏi `/auth/me` một lần cho mỗi tab đang mở là một cơn mưa request cho
       *  một sự thật đã biết. Nhánh đó kết luận tại chỗ. */
      bootstrap: () => {
        if (booting) return booting

        const { status, actor, ticket } = get()
        if (status !== 'khởi-động') {
          set(settleLocally(actor, ticket))
          return Promise.resolve()
        }

        booting = probeSession()
          .then((probe) => {
            if (probe.state === 'signed-in') {
              set({
                status: 'đã-vào',
                actor: probe.actor,
                ticket: ticketOf(probe.session),
                /* Đọc lại ô "Nhớ tôi" từ chính cửa sổ máy chủ trả về thay vì tin
                   boolean trong kho: `idleUntil === null` LÀ định nghĩa của ô
                   đó (xem `SESSION_LIMITS`). Cookie sống lâu hơn kho — người
                   dọn dữ liệu trang mà vẫn còn cookie sẽ quay lại với
                   `remember: false` và phiên nhớ của họ bị ghi xuống
                   `sessionStorage`, tức mất khi đóng tab. */
                remember: probe.session.idleUntil === null,
                expiredBy: null,
                lockInPlace: false,
              })
              return
            }
            if (probe.state === 'guest') {
              set({
                status: 'khách',
                actor: null,
                ticket: null,
                expiredBy: null,
                lockInPlace: false,
              })
              return
            }
            set(settleLocally(get().actor, get().ticket))
          })
          .catch(() => {
            /* Không được để sót một lời hứa vỡ ở đây. `status` chỉ thoát khỏi
               'khởi-động' trong thân `then` ở trên; ném ra ngoài là kẹt vĩnh
               viễn, và guard đợi mãi — cả app thành một màn trắng không lỗi,
               không log, loại hỏng tốn hàng giờ để tìm. */
            set(settleLocally(get().actor, get().ticket))
          })
          .finally(() => {
            booting = null
          })

        return booting
      },

      beginSignIn: () => set({ status: 'đang-vào' }),

      signIn: (actor, opts) => {
        const remember = opts.remember ?? get().remember
        access.log({ actorId: actor.id, action: 'xem', note: 'đăng nhập' })
        set({
          status: 'đã-vào',
          actor,
          /* Vé là bản sao cửa sổ máy chủ vừa đóng dấu, KHÔNG phải thứ màn tự
             tính. Tự tính thì hai bên đếm bằng hai đồng hồ và cái đếm ngược sẽ
             lệch với cái mốc thật của phiên. */
          ticket: ticketOf(opts.session),
          remember,
          expiredBy: null,
          lockInPlace: false,
        })
      },

      /* Chỉ thay hạn. Không đụng `status`, không đụng `actor`: gia hạn là câu
         trả lời cho "vé sống thêm được không", không phải cho "ai đang đăng
         nhập". Nhánh hỏng do `renew.ts` lo — nó cho phiên chết. */
      adoptSession: (session) => set({ ticket: ticketOf(session) }),

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

      /* Dọn CẢ HAI kho, không chỉ kho đang dùng — `removeItem` của
         `rememberAware` lo việc đó. Giữ `remember` lại để lần đăng nhập sau ô
         còn nhớ lựa chọn cũ.

         Cửa NỘI BỘ: không nói gì với máy chủ. Dùng cho hai chỗ mà một lời gọi
         `/auth/sign-out` sẽ là sai — tab này đang áp lệnh đăng xuất của tab kia
         (tab kia đã gọi rồi), và màn đăng nhập gỡ máy trạng thái khỏi 'đang-vào'
         sau một lần gõ sai mật khẩu (chưa từng có phiên nào để đóng). */
      clearSession: () =>
        set({
          status: 'khách',
          actor: null,
          ticket: null,
          expiredBy: null,
          lockInPlace: false,
        }),

      /** Đăng xuất thật: dọn máy này RỒI đóng phiên ở máy chủ.
       *
       *  Thứ tự đó là cố ý, và ngược với thứ tự trực giác. `guard.tsx` và
       *  `chrome.tsx` gọi `signOut()` rồi `navigate('/dang-nhap')` ngay dòng
       *  sau, không đợi. Đóng ở máy chủ trước thì suốt vòng mạng ấy `status` vẫn
       *  là 'đã-vào', và màn đăng nhập có đúng một luật cho trường hợp đó: đã có
       *  phiên thì đi tiếp. Người dùng bấm "Đăng xuất", bị ném ngược vào app vài
       *  trăm mili giây, rồi mới bị đá ra — trông y như một cú bấm nhầm.
       *
       *  Dọn trước không làm hỏng lời gọi: cookie phiên là HttpOnly, nó nằm
       *  trong kho cookie của trình duyệt chứ không nằm trong `localStorage`,
       *  nên xoá kho không lấy mất thứ mà `credentials: 'include'` sắp gửi đi.
       *
       *  Và lời gọi hỏng cũng không đổi kết quả trên máy này — `signOutOnServer`
       *  không ném. Người vừa bấm "Đăng xuất" trên máy phòng họp phải đăng xuất
       *  được khỏi máy phòng họp, dù mạng có ra sao. */
      signOut: async () => {
        get().clearSession()
        await signOutOnServer()
      },
    }),
    {
      name: KEY,
      storage: rememberAware,
      /* Hình dạng phiên đã đổi (vé bỏ `actorId`, hạn nay là bản sao cửa sổ máy
         chủ) — phiên lưu từ bản trước không nâng cấp được thành phiên hợp lệ, và
         đoán bù trường thiếu là tự cấp quyền cho người khác. Bỏ đi, bắt đăng
         nhập lại: mất một lần gõ mật khẩu, đổi lấy việc không ai đi tiếp với một
         phiên nửa vời. Rẻ hơn nữa kể từ khi có cookie — người còn phiên sống ở
         máy chủ chỉ mất bản ghi nhớ, `/auth/me` nhận ra họ ngay.
         Tăng số này mỗi lần đổi hình dạng những gì `partialize` lưu. */
      version: 3,
      migrate: () => ({ actor: null, ticket: null, remember: false }) as SessionState,
      /* `status` KHÔNG được lưu: nó là kết luận, và kết luận phải tính lại mỗi
         lần mở app — nay là tính lại từ `/auth/me`. Lưu 'đã-vào' vào kho là tự
         cho mình một phiên hợp lệ chỉ bằng cách sửa localStorage. */
      partialize: (s) =>
        ({ actor: s.actor, ticket: s.ticket, remember: s.remember }) as SessionState,
      onRehydrateStorage: () => (state) => void state?.bootstrap(),
    },
  ),
)

/** Đọc phiên ngoài React — interceptor và lifecycle cần, và chúng không phải
 *  component nên không gọi hook được. */
export const sessionSnapshot = () => useSession.getState()
