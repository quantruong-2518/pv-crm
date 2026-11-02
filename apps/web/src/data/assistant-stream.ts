import { AssistantEvent, type AssistantTurnBody } from '@pv/contracts'
import { API_BASE_URL } from '@/app/api/base-url'
import { ApiError, failureOf } from '@/app/api/errors'
import { access, renewSession, sessionIsLive, useSession } from '@/app/auth'
import { message, translate } from '@/app/i18n'
import { USE_NEED } from './assistant'

/** `POST /assistant/turns` — one question in, a `text/event-stream` of
 *  `AssistantEvent` out (ADR 0133).
 *
 *  Not through `api.write`: that door reads one JSON body, and EventSource
 *  cannot POST. So this keeps the door's three promises by hand — no request
 *  on a dead session, E2 asked first, identity only in the cookie — and turns
 *  a refusal into the same `ApiError`. A 401 renews the ticket but never
 *  replays: a write is never sent twice (`mayReplay` in `app/api/client.ts`). */

const PATH = '/assistant/turns'
const SESSION_EXPIRED = message(
  'Hết thời gian đăng nhập.',
  'Your session has expired.',
  '로그인 시간이 만료되었습니다.',
)
const HIDDEN = message(
  'Bị ẩn theo quyền của bạn.',
  'Hidden by your permissions.',
  '접근 권한이 없어 표시되지 않습니다.',
)

function guard() {
  if (!sessionIsLive()) {
    throw new ApiError({ kind: 'unauthenticated', path: PATH, message: translate(SESSION_EXPIRED) })
  }
  const verdict = access.check(useSession.getState().actor, USE_NEED)
  if (!verdict.ok) {
    throw new ApiError({ kind: 'forbidden', path: PATH, message: translate(HIDDEN) })
  }
}

async function refusal(res: Response): Promise<ApiError> {
  const problem = (await res.json().catch(() => ({}))) as { title?: string; code?: string }
  if (res.status === 401) await renewSession()
  return new ApiError({
    kind: failureOf(res.status),
    code: problem.code,
    path: PATH,
    status: res.status,
    message: problem.title ?? `POST ${PATH} → ${res.status}`,
    serverTitle: problem.title,
  })
}

/** One SSE frame → its event, or nothing for a comment, a heartbeat-only line or a shape we do not know. */
function eventOf(frame: string): AssistantEvent | null {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n')
  if (!data) return null
  try {
    const parsed = AssistantEvent.safeParse(JSON.parse(data))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Resolves when the stream ends, however it ends; rejects with `ApiError` when it never started. */
export async function streamTurn(
  body: AssistantTurnBody,
  onEvent: (event: AssistantEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  guard()
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
      credentials: 'include',
    })
  } catch (raw) {
    const aborted = raw instanceof DOMException && raw.name === 'AbortError'
    throw new ApiError({
      kind: aborted ? 'aborted' : 'network',
      path: PATH,
      message: raw instanceof Error ? raw.message : 'network',
      cause: raw,
    })
  }
  if (!res.ok || !res.body) throw await refusal(res)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }))
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, '\n')
    let cut = buffer.indexOf('\n\n')
    while (cut >= 0) {
      const event = eventOf(buffer.slice(0, cut))
      buffer = buffer.slice(cut + 2)
      if (event) onEvent(event)
      cut = buffer.indexOf('\n\n')
    }
  }
  const tail = eventOf(buffer)
  if (tail) onEvent(tail)
}
