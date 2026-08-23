import { create } from 'zustand'
import { SESSION_LIMITS, ticketDeath, useSession, type Ticket } from './session'

/** Vòng đời của một phiên — ba việc chạy NGOÀI React.
 *
 *   1 · **Đồng hồ hết hạn** — vé chết đúng lúc nó phải chết, kể cả khi người
 *       dùng không chạm gì để React render lại.
 *   2 · **Bắt hoạt động** — còn ngồi đó thì đẩy mốc "ngồi không" ra xa.
 *   3 · **Đồng bộ đa tab** — đăng xuất ở một tab là đăng xuất ở mọi tab.
 *
 *  Ba việc này nằm ngoài React có lý do, không phải vì tiện: chúng phải đúng cả
 *  khi không màn nào đang mở (tab nền), và một `useEffect` trong một component
 *  nào đó thì chết theo component đó. Gắn một lần ở `main.tsx`.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO ĐỒNG BỘ ĐA TAB KHÔNG PHẢI THỨ "ĐỂ SAU"
 *  ------------------------------------------------------------------
 *  Người dùng ERP mở nhiều tab — sổ lead một tab, hồ sơ khách một tab, báo cáo
 *  một tab. Không có đồng bộ thì bấm "Đăng xuất" ở tab đầu chỉ dọn đúng tab đó:
 *  hai tab kia vẫn bày nguyên sổ của cả phòng cho người ngồi xuống sau. Đó
 *  không phải phiền toái nhỏ, đó là đúng thứ nút đăng xuất được bấm để tránh. */

type AuthSignal =
  /** Tab kia đăng xuất. Tab nhận phải dọn NGAY, không đợi đọc lại kho — kho
   *  trống thì `rehydrate` không có gì để áp và phiên trong bộ nhớ sống tiếp. */
  | { kiểu: 'ra' }
  /** Kho đã đổi (vừa đăng nhập, hoặc vừa gia hạn). Tab nhận đọc lại kho thay vì
   *  nhận state qua message: một nguồn sự thật, không có bản sao đi đường vòng. */
  | { kiểu: 'đổi' }

const CHANNEL = 'pv-auth'

/** Cửa sổ cảnh báo trước khi phiên chết.
 *
 *  Tách khỏi store phiên vì nó KHÔNG phải trạng thái phiên — phiên vẫn đang
 *  sống bình thường, đây chỉ là thứ để vẽ một dải nhắc. Nhét vào store phiên
 *  thì mỗi nhịp đếm ngược lại là một lần cả app nghe thay đổi phiên. */
export const useExpiryWarning = create<{ deadline: number | null }>(() => ({ deadline: null }))

/** Mốc chết gần nhất của một vé — mốc nào tới trước thì đó là mốc phải canh. */
function nextDeath(ticket: Ticket): number {
  return ticket.idleUntil === null ? ticket.expiresAt : Math.min(ticket.expiresAt, ticket.idleUntil)
}

export function startAuthLifecycle(): () => void {
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL)

  /* Đang áp thay đổi từ tab khác — đừng phát ngược lại, không thì hai tab đẩy
     tin qua lại cho nhau cho tới khi một bên hết cửa. */
  let applyingRemote = false
  let deathTimer = 0
  let warnTimer = 0
  let lastTouch = 0

  const send = (signal: AuthSignal) => {
    if (!applyingRemote) channel?.postMessage(signal)
  }

  const applyRemote = (fn: () => void) => {
    applyingRemote = true
    try {
      fn()
    } finally {
      applyingRemote = false
    }
  }

  // -------------------------------------------------------------------------
  // 1 · đồng hồ hết hạn
  // -------------------------------------------------------------------------

  /** Một `setTimeout` đặt đúng vào mốc chết, KHÔNG phải `setInterval` mỗi giây.
   *
   *  Đếm mỗi giây thì tab nền cũng phải thức dậy mỗi giây suốt cả ngày để phát
   *  hiện một sự kiện xảy ra đúng một lần. Đổi lại, hẹn giờ dài bị trình duyệt
   *  bóp và bị đóng băng khi máy ngủ — nên mọi đường quay lại màn (`focus`,
   *  `visibilitychange`) đều kiểm hạn lại bằng đồng hồ thật ở dưới. */
  const rearm = () => {
    window.clearTimeout(deathTimer)
    window.clearTimeout(warnTimer)
    useExpiryWarning.setState({ deadline: null })

    const { status, ticket } = useSession.getState()
    if (status !== 'đã-vào' || !ticket) return

    const at = nextDeath(ticket)
    const now = Date.now()
    deathTimer = window.setTimeout(() => checkNow(), Math.max(0, at - now))

    const warnAt = at - SESSION_LIMITS.warnBefore
    if (warnAt > now) {
      warnTimer = window.setTimeout(() => useExpiryWarning.setState({ deadline: at }), warnAt - now)
    } else {
      useExpiryWarning.setState({ deadline: at })
    }
  }

  /** Kiểm hạn bằng đồng hồ thật. Gọi khi hẹn giờ bắn, và mỗi lần tab sáng lại —
   *  máy ngủ ba tiếng rồi mở nắp thì hẹn giờ chưa chắc đã bắn, nhưng vé thì
   *  chết chắc chắn rồi. */
  const checkNow = () => {
    const { status, ticket, expire } = useSession.getState()
    if (status !== 'đã-vào') return
    const death = ticketDeath(ticket, Date.now())
    if (death) expire(death)
  }

  // -------------------------------------------------------------------------
  // 2 · bắt hoạt động
  // -------------------------------------------------------------------------

  /** Chạm màn thì gia hạn — nhưng CHỈ ghi lại mỗi 30 giây một lần.
   *
   *  Không throttle thì mỗi lần di chuột là một lần ghi vào kho và một lần phát
   *  tin sang tab khác. Sai số 30 giây trên một hạn 30 phút không ai nhận ra;
   *  cái giá thì nhận ra ngay ở tab thứ ba. */
  const TOUCH_EVERY = 30_000

  const onActivity = () => {
    const now = Date.now()
    /* Kiểm hạn TRƯỚC khi gia hạn: người quay lại sau hai tiếng cũng "chạm màn",
       và cú chạm đó không được hồi sinh một phiên đã chết. */
    checkNow()
    if (now - lastTouch < TOUCH_EVERY) return
    lastTouch = now
    useSession.getState().touch(now)
    send({ kiểu: 'đổi' })
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      checkNow()
      rearm()
    }
  }

  const ACTIVITY: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'focus']
  for (const e of ACTIVITY) window.addEventListener(e, onActivity, { passive: true })
  document.addEventListener('visibilitychange', onVisible)

  // -------------------------------------------------------------------------
  // 3 · đồng bộ đa tab
  // -------------------------------------------------------------------------

  const onMessage = (ev: MessageEvent<AuthSignal>) => {
    if (ev.data.kiểu === 'ra') {
      applyRemote(() => useSession.getState().signOut())
      return
    }
    applyRemote(() => void useSession.persist.rehydrate())
  }
  channel?.addEventListener('message', onMessage)

  /** Đường dự phòng, và không chỉ dự phòng: sự kiện `storage` bắt được cả người
   *  xoá tay localStorage trong DevTools — thứ BroadcastChannel không thấy. */
  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== null && ev.key !== 'pv-session') return
    if (ev.newValue === null) applyRemote(() => useSession.getState().signOut())
    else applyRemote(() => void useSession.persist.rehydrate())
  }
  window.addEventListener('storage', onStorage)

  /** Phiên đổi thì báo tab khác và đặt lại đồng hồ. So sánh trạng thái trước —
   *  sau chứ không phát trong từng action của store: store là nơi giữ sự thật,
   *  nó không cần biết app này chạy trong trình duyệt có mấy tab. */
  const unsubscribe = useSession.subscribe((now, before) => {
    if (now.status !== before.status || now.ticket !== before.ticket) rearm()

    if (before.status === 'đã-vào' && now.status === 'khách') send({ kiểu: 'ra' })
    else if (now.status === 'đã-vào' && before.status !== 'đã-vào') send({ kiểu: 'đổi' })
  })

  /** Lưới an toàn cho `khởi-động`.
   *
   *  Trạng thái đầu tiên chỉ thoát ra nhờ `bootstrap`, và `bootstrap` được treo
   *  vào `onRehydrateStorage`. Nếu vì lý do gì móc đó không chạy — kho đổi sang
   *  bất đồng bộ, hoặc một bản zustand sau đổi thứ tự gọi — thì `status` kẹt ở
   *  'khởi-động' và guard đợi mãi: cả app là một màn trắng, không lỗi, không
   *  log. Hỏng kiểu đó tốn hàng giờ để tìm, nên đây là ba dòng đáng giá.
   *
   *  Gọi hai lần vô hại: `bootstrap` chỉ đọc vé rồi kết luận, không đổi vé. */
  if (useSession.persist.hasHydrated()) useSession.getState().bootstrap()
  else useSession.persist.onFinishHydration(() => useSession.getState().bootstrap())

  rearm()
  checkNow()

  return () => {
    unsubscribe()
    window.clearTimeout(deathTimer)
    window.clearTimeout(warnTimer)
    for (const e of ACTIVITY) window.removeEventListener(e, onActivity)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('storage', onStorage)
    channel?.removeEventListener('message', onMessage)
    channel?.close()
  }
}
