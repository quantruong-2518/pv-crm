import { PASSWORD_MIN, SessionView, SessionWindow, type SessionActor } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { API_BASE_URL } from '@/app/api/base-url'

/** The auth doors — the ONLY module in the app that knows what they are.
 *
 *  ------------------------------------------------------------------
 *  WHAT REPLACED WHAT
 *  ------------------------------------------------------------------
 *  This file used to answer sign-in out of the DAS Vina fixture, hold the
 *  password floor as a local constant, and mint reset tickets by base64-ing an
 *  email. All three are gone: there is a server now, and it owns every one of
 *  those answers. The three auth screens barely moved, which was the whole
 *  point of putting the flow behind four functions in the first place.
 *
 *  ------------------------------------------------------------------
 *  WHY THESE CALLS DO NOT GO THROUGH `app/api`
 *  ------------------------------------------------------------------
 *  The interceptor chain in `app/api/client.ts` opens with `requireLiveSession`
 *  and `requireAccess`. Both read the session store, and both refuse before a
 *  byte moves. Sending sign-in through them is a contradiction stated out loud:
 *  you would have to already hold a live session in order to be allowed to ask
 *  for one, so the first call of every working day would be refused by the app
 *  itself, offline, with a 'Phiên không còn hiệu lực.'
 *
 *  Skipping the AFTER half matters just as much, and it is less obvious.
 *  `renewOnUnauthorized` turns any 401 into a renew attempt, and a failed renew
 *  calls `expire()`. The sign-in screen sets the machine to 'đang-vào' before
 *  it submits, which is one of the two states `expire` acts on — so one typo in
 *  a password would flip a guest into 'hết-hạn' and drop the lock overlay over
 *  a screen nobody was signed into. Wrong password is the most ordinary event
 *  this file handles; it must not be able to reach the session machinery at
 *  all.
 *
 *  So: bare `fetch`, exactly as `app/auth/renew.ts` has instructed for its own
 *  door since before there was a server to call. The two things worth sharing
 *  are shared anyway — `API_BASE_URL` comes from `app/api/base-url.ts` (one
 *  reader of `import.meta.env`, and read that file for the `localhost` vs
 *  `127.0.0.1` cookie trap), and the cookie itself rides on `credentials:
 *  'include'` below, the same way it does on every other call.
 *
 *  The second reason is structural, and it is why the escape hatch was not
 *  built into the client instead: `client.ts` imports `@/app/auth`, `app/auth`
 *  imports this file, so this file importing `@/app/api` would close an import
 *  cycle. A hatch would have had to be reachable without the chain — which is
 *  the leaf module, which is what we have.
 *
 *  ------------------------------------------------------------------
 *  STILL DELIBERATELY ABSENT: ANY COPY OF THE TOKEN
 *  ------------------------------------------------------------------
 *  Nothing here reads a token, stores one, or puts one in a header. The session
 *  token is an HttpOnly cookie; the browser sends it and cannot see it. What
 *  comes back in the body is the session WINDOW, which is enough to lock the
 *  screen on the right minute and nothing more — see `SessionWindow` in
 *  `@pv/contracts`. */

/** One number, one place. The form checks it so the user hears about a short
 *  password before a round trip; the server checks it because a form is not a
 *  fence. Re-exported rather than copied — a second `const MIN_PASSWORD = 6`
 *  here is a screen promising a floor the server does not enforce. */
export { PASSWORD_MIN } from '@pv/contracts'

/** Hiện dưới ô email làm gợi ý gõ — người demo không phải đoán tên miền. */
export const EMAIL_HINT = 'ten@pebblevina.com'

// ---------------------------------------------------------------------------
// Wire role → engine role
// ---------------------------------------------------------------------------

/** THE LINE THAT DECIDES WHETHER ANYONE HAS ANY PERMISSION AT ALL.
 *
 *  `@pv/contracts` and `@pv/engines` spell roles identically, so this was a
 *  `Record<WireRoleId, EngineRoleId>` and is now an assignment the compiler
 *  checks. The check still matters, and it fails the same way it always would:
 *  a role missing from one side does not throw. E2's `allows` fails closed on a
 *  `roleId` it does not recognise, so the actor sails through sign-in, the
 *  shell paints, their name is in the corner, and every screen and button then
 *  reports "Bị ẩn theo quyền của bạn" — no error, no 403, no log line naming a
 *  role, just a person apparently granted nothing.
 *
 *  Keeping the two unions identical is what makes `roleId: wire.roleId` legal;
 *  the day they diverge, this line stops compiling instead of quietly locking
 *  somebody out of the product.
 *
 *  Exported for `data/directory.ts`, which receives a whole roster in the same
 *  `SessionActor` shape. */
export function toActor(wire: SessionActor): Actor {
  return {
    id: wire.id,
    name: wire.name,
    email: wire.email,
    role: wire.role,
    roleId: wire.roleId,
    branches: wire.branches,
    ownOnly: wire.ownOnly,
  }
}

// ---------------------------------------------------------------------------
// Errors a screen can put somewhere
// ---------------------------------------------------------------------------

/** Lỗi luôn gắn với MỘT ô — màn cần biết tô đỏ ô nào và đưa con trỏ về đâu.
 *  Một chuỗi lỗi chung chung ở đầu form thì người dùng phải tự dò lại cả form.
 *
 *  `'form'` joined the union when the server did, and it earns its place: a
 *  rate limit and an unreachable API are not complaints about a box on the
 *  screen. Hanging "Bạn thử quá nhiều lần" under the password field tells the
 *  user their password is wrong, and they will spend the next five minutes
 *  retyping a password that was right the first time. */
export type AuthField = 'email' | 'password' | 'confirm' | 'form'
export type AuthError = { field: AuthField; message: string }

/** Sai mật khẩu là ĐƯỜNG ĐI BÌNH THƯỜNG của một form đăng nhập, không phải sự
 *  cố — nên kết quả có nhánh, không có `throw`. `throw` cho việc thường ngày
 *  đẩy màn vào `try/catch` và làm lỗi mạng thật lẫn với lỗi gõ nhầm.
 *
 *  Success now carries the session window beside the actor: the caller feeds
 *  both into `useSession.signIn`, because the browser no longer computes when a
 *  session dies — it mirrors what the server stamped. */
export type SignInResult =
  { ok: true; actor: Actor; session: SessionWindow } | { ok: false; error: AuthError }

/** ONE sentence for "no such mailbox" and "wrong password", and it is not
 *  laziness — it is the reason the old POC message had to go.
 *
 *  The fixture-era screen said "Không tìm thấy tài khoản dùng email này", which
 *  answers a question no stranger is entitled to ask: it turns the sign-in form
 *  into a free tool for discovering which addresses at pebblevina.com have
 *  accounts. That list is the first half of every credential-stuffing and
 *  spear-phishing attempt against this company. The old file's own docblock
 *  flagged the trade as POC-only and said to collapse it the day a server
 *  arrived; the server has arrived.
 *
 *  It goes on the password field rather than the form because that is where the
 *  cursor should land: of the two boxes, the password is the one worth retyping
 *  first, and the sentence names both anyway. */
const WRONG_PAIR: AuthError = { field: 'password', message: 'Email hoặc mật khẩu không đúng.' }

const OFFLINE: AuthError = {
  field: 'form',
  message: 'Không nối được máy chủ. Kiểm tra mạng rồi thử lại.',
}

const TOO_FAST: AuthError = {
  field: 'form',
  message: 'Bạn thử quá nhiều lần. Chờ một lát rồi thử lại.',
}

const SERVER_TROUBLE: AuthError = {
  field: 'form',
  message: 'Máy chủ đang trục trặc. Thử lại sau ít phút.',
}

/** The server answered, and what it said does not fit the contract.
 *
 *  Treated as a hard failure rather than waved through, because the field most
 *  likely to be missing or renamed is `roleId` — and an actor with no readable
 *  role is the silent "granted nothing" state described at `toActor`. Being
 *  sent back to the sign-in screen is annoying; being let in as a person the
 *  permission matrix cannot classify is a day of debugging. */
const UNREADABLE: AuthError = {
  field: 'form',
  message: 'Máy chủ trả dữ liệu phiên không đọc được. Báo quản trị hệ thống.',
}

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

/** One knock on one auth door.
 *
 *  Returns `null` for "never reached the server" and a `Response` for anything
 *  the server actually said, INCLUDING the refusals. The split is the whole
 *  value of this helper: a caller must be able to tell "your password is wrong"
 *  from "your wifi is down", and `fetch` reports the second as a thrown
 *  `TypeError` with a message that differs per browser. Every caller below
 *  branches on that distinction, so it is drawn exactly once, here. */
async function knock(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<Response | null> {
  const body = init.body === undefined ? undefined : JSON.stringify(init.body)
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: init.method ?? 'GET',
      /* No `Content-Type` on a bodyless request: it buys a CORS preflight for
         nothing to send. */
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body,
      /* The HttpOnly session cookie — both the one being SET here (sign-in) and
         the one being read (`/auth/me`, sign-out). Without this flag sign-in
         appears to succeed and the cookie is dropped on the floor. */
      credentials: 'include',
    })
  } catch {
    return null
  }
}

/** A JSON body, or `undefined` if there is not one to read.
 *
 *  A gateway answering HTML, or a 204 with an empty body, must not surface as
 *  an unhandled `SyntaxError` out of an auth screen — the status code has
 *  already told the caller everything it needs. */
async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Sign in / sign out
// ---------------------------------------------------------------------------

/** `POST /auth/sign-in`.
 *
 *  Two checks happen here before the network does: an empty email and an empty
 *  password. Not validation — the server does that — but a round trip and a
 *  rate-limit slot spent on a form the user has not filled in yet, answered
 *  instantly instead.
 *
 *  `remember` goes to the server as well as to the store, and both halves are
 *  what the tick means: the server drops the idle mark on the session row, the
 *  browser moves the session to `localStorage` (`rememberAware` in
 *  `app/auth/session.ts`). Doing only one leaves a box that remembers nothing
 *  by the next morning. */
export async function signInWithEmail(
  email: string,
  password: string,
  remember = false,
): Promise<SignInResult> {
  if (!email.trim()) return { ok: false, error: { field: 'email', message: 'Chưa nhập email.' } }
  if (!password) return { ok: false, error: { field: 'password', message: 'Chưa nhập mật khẩu.' } }

  const res = await knock('/auth/sign-in', {
    method: 'POST',
    body: { email: email.trim(), password, remember },
  })
  if (!res) return { ok: false, error: OFFLINE }

  if (res.status === 401) return { ok: false, error: WRONG_PAIR }
  if (res.status === 429) return { ok: false, error: TOO_FAST }
  /* 400/422 is the contract refusing the SHAPE of what was typed — an address
     with no `@` in it. That is a real complaint about a real box, and saying
     "email hoặc mật khẩu không đúng" for it would send the user off to retype a
     password that was never read. */
  if (res.status === 400 || res.status === 422)
    return { ok: false, error: { field: 'email', message: 'Email sai dạng.' } }
  if (!res.ok) return { ok: false, error: SERVER_TROUBLE }

  const view = SessionView.safeParse(await readJson(res))
  if (!view.success) return { ok: false, error: UNREADABLE }
  return { ok: true, actor: toActor(view.data.actor), session: view.data.session }
}

/** `POST /auth/sign-out` — kill the session ON THE SERVER.
 *
 *  Never throws and returns nothing to check, on purpose. The caller
 *  (`useSession.signOut`) clears this machine either way: a person who pressed
 *  "Đăng xuất" on a laptop in a meeting room must end up signed out on that
 *  laptop whether or not the request landed. The cookie the server would have
 *  cleared expires on its own; a screen still showing the previous person's
 *  lead book does not. */
export async function signOutOnServer(): Promise<void> {
  await knock('/auth/sign-out', { method: 'POST' })
}

// ---------------------------------------------------------------------------
// Who am I
// ---------------------------------------------------------------------------

/** The three answers `GET /auth/me` can give, and they are three because the
 *  session machine has to do something different for each.
 *
 *  `'guest'` means the server looked and said no. `'unreachable'` means nobody
 *  answered — a restarting API, a dropped wifi, a laptop lid that was shut on
 *  the train. Collapsing the second into the first is the bug this union
 *  exists to make impossible: it would sign every open tab out every time the
 *  API is deployed. See `bootstrap` in `app/auth/session.ts` for what is done
 *  with each. */
export type SessionProbe =
  | { state: 'signed-in'; actor: Actor; session: SessionWindow }
  | { state: 'guest' }
  | { state: 'unreachable' }

/** `GET /auth/me` — the authority on who is signed in.
 *
 *  UNREACHABLE IS NOT UNREADABLE, and the two go opposite ways. A server that
 *  did not answer tells us nothing, so we must not conclude anything from it. A
 *  server that answered with something the contract cannot parse HAS told us
 *  something: whatever is on the other end is not speaking this version of the
 *  session contract, and an actor we cannot read is an actor whose permissions
 *  we cannot compute. That one fails closed. */
export async function probeSession(): Promise<SessionProbe> {
  const res = await knock('/auth/me')
  if (!res) return { state: 'unreachable' }
  if (res.status === 401) return { state: 'guest' }
  /* 500, 502, a gateway page: the server is reachable but is not answering the
     question. Same information content as no answer at all — do not use it to
     decide that somebody is signed out. */
  if (!res.ok) return { state: 'unreachable' }

  const view = SessionView.safeParse(await readJson(res))
  if (!view.success) return { state: 'guest' }
  return { state: 'signed-in', actor: toActor(view.data.actor), session: view.data.session }
}

// ---------------------------------------------------------------------------
// Forgotten password
// ---------------------------------------------------------------------------

/** `POST /auth/forgot-password`. Answered 204 whether or not the mailbox is
 *  known, so `null` here means "the request was accepted", NOT "a letter is on
 *  its way to a real account".
 *
 *  The screen must show the same "đã gửi" card either way — same reason
 *  `WRONG_PAIR` says one sentence. A form that tells a stranger which addresses
 *  exist is an address-harvesting tool, and it does not stop being one because
 *  the answer is phrased helpfully. */
export async function requestPasswordReset(email: string): Promise<AuthError | null> {
  if (!email.trim()) return { field: 'email', message: 'Chưa nhập email.' }

  const res = await knock('/auth/forgot-password', {
    method: 'POST',
    body: { email: email.trim() },
  })
  if (!res) return OFFLINE
  if (res.status === 429) return TOO_FAST
  if (res.status === 400 || res.status === 422)
    return { field: 'email', message: 'Email sai dạng.' }
  if (!res.ok) return SERVER_TROUBLE
  return null
}

/** `GET /auth/reset-password/:token` — who this link belongs to.
 *
 *  The mailbox and nothing else, and only while the token is live. It exists so
 *  the screen can greet the right person instead of asking them to trust an
 *  opaque link; it carries no more than that because whoever is holding the
 *  link has not yet proved to be that person.
 *
 *  `null` covers every way this can fail — no token, expired token, mistyped
 *  token, server unreachable. One branch rather than four because the screen
 *  has exactly one thing to offer in all of them ("xin một link mới"), and
 *  asking for a new link needs the server up regardless. */
export async function readResetTicket(token: string | null): Promise<{ email: string } | null> {
  if (!token) return null

  const res = await knock(`/auth/reset-password/${encodeURIComponent(token)}`)
  if (!res?.ok) return null

  const body = await readJson(res)
  const email = (body as { email?: unknown } | undefined)?.email
  return typeof email === 'string' ? { email } : null
}

/** Kiểm mật khẩu mới ở màn đặt lại — CLIENT-SIDE, trước khi bay.
 *
 *  Ô xác nhận tồn tại để bắt lỗi gõ, nên nó phải được kiểm SAU khi mật khẩu
 *  chính đã hợp lệ — báo "hai ô không khớp" trong lúc ô đầu còn quá ngắn là bắt
 *  sửa nhầm chỗ.
 *
 *  The floor comes from `PASSWORD_MIN`, the same constant the server's `password`
 *  schema is built on. The confirm box is checked only here and never sent: the
 *  server has no use for a second copy of the same string. */
export function checkNewPassword(password: string, confirm: string): AuthError | null {
  if (!password) return { field: 'password', message: 'Chưa nhập mật khẩu mới.' }
  if (password.length < PASSWORD_MIN)
    return { field: 'password', message: `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự.` }
  if (password !== confirm) return { field: 'confirm', message: 'Hai ô chưa khớp nhau.' }
  return null
}

/** `POST /auth/reset-password`. `null` = done.
 *
 *  Succeeding here revokes every live session for that account server-side —
 *  that is what a password reset is for, and it is why the screen must not sign
 *  anybody in afterwards. See the comment on the redirect in
 *  `pages/reset-password.tsx`. */
export async function setNewPassword(token: string, password: string): Promise<AuthError | null> {
  const res = await knock('/auth/reset-password', { method: 'POST', body: { token, password } })
  if (!res) return OFFLINE
  if (res.status === 429) return TOO_FAST
  /* The token was fine when the screen greeted them and is not fine now —
     30 minutes is short and a person can be interrupted. It is not a complaint
     about the password they just typed twice, so it must not point at that
     box. */
  if (res.status === 404 || res.status === 410)
    return { field: 'form', message: 'Link đặt lại đã hết hạn. Xin một link mới rồi thử lại.' }
  if (res.status === 400 || res.status === 422)
    return {
      field: 'password',
      message: `Mật khẩu chưa đạt yêu cầu — tối thiểu ${PASSWORD_MIN} ký tự.`,
    }
  if (!res.ok) return SERVER_TROUBLE
  return null
}

// ---------------------------------------------------------------------------
// Renew
// ---------------------------------------------------------------------------

/** `POST /auth/renew` → the fresh window, or `null` if there is no way through.
 *
 *  Called from `app/auth/renew.ts`, which owns the single-flight guard and
 *  decides what a `null` means for the session machine. The parse is against
 *  `SessionWindow` rather than a hand-written check because these three marks
 *  drive the lock screen: a `expiresAt` that arrives as `undefined` would read
 *  as `NaN` in `ticketDeath`, every comparison against it would be false, and
 *  the session would quietly become immortal on this machine. */
export async function renewOnServer(): Promise<SessionWindow | null> {
  const res = await knock('/auth/renew', { method: 'POST' })
  if (!res?.ok) return null

  const body = await readJson(res)
  const window = SessionWindow.safeParse((body as { session?: unknown } | undefined)?.session)
  return window.success ? window.data : null
}
