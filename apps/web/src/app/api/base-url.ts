/** Where the real backend lives — read from the environment in EXACTLY one
 *  place, and that place is a module with NO imports of its own.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS IS NOT A LINE AT THE TOP OF `client.ts` ANY MORE
 *  ------------------------------------------------------------------
 *  `client.ts` imports the session store (`@/app/auth`) — that is what lets
 *  `requireLiveSession` and `requireAccess` refuse a call before it leaves the
 *  browser. So every module under `app/auth`, and everything `app/auth` pulls
 *  in, is DOWNSTREAM of the interceptor chain, and a base URL living in
 *  `client.ts` cannot be reached from there without closing a cycle:
 *  `client.ts` → `app/auth` → `session.ts` → `client.ts`.
 *
 *  The callers that need this constant are precisely the ones that must bypass
 *  the chain: sign-in (you cannot require a live session in order to create
 *  one), `GET /auth/me`, and `POST /auth/renew` (a 401 → renew → 401 loop —
 *  `renew.ts` has carried that warning since before there was a server). A file
 *  with zero imports cannot take part in a cycle, so it is the one shape that
 *  serves the interceptor chain and the auth doors at the same time.
 *
 *  The alternative — letting `data/auth.ts` read `import.meta.env` for itself —
 *  is the thing `.env.example` forbids in as many words: two readers are two
 *  answers to "which server am I talking to", and they drift the first time
 *  someone points one of them at staging.
 *
 *  ------------------------------------------------------------------
 *  `localhost`, NOT `127.0.0.1` — AND THIS IS NOT COSMETIC
 *  ------------------------------------------------------------------
 *  Session identity is an HttpOnly cookie now, and for cookies `localhost` and
 *  `127.0.0.1` are two DIFFERENT sites. A `SameSite=Lax` cookie that the API
 *  sets while it answers on `http://127.0.0.1:4123` is stored against the host
 *  `127.0.0.1`; the dev page runs on `http://localhost:5173`, so every later
 *  `fetch` to the API is a cross-site request and Lax withholds the cookie.
 *
 *  What that looks like from a chair: sign-in returns 200, the actor appears,
 *  the shell paints — and then every single call after it comes back 401, with
 *  no error anywhere naming a cookie. Hours go into the interceptor chain, the
 *  CORS config and the server's session table, none of which are wrong.
 *
 *  Same host, different port is the SAME site — SameSite ignores the port
 *  entirely — so `localhost:5173` talking to `localhost:4123` is fine. Keep
 *  both ends spelled the same way, here and in `.env`.
 *
 *  The fallback is the local `apps/api` port documented in
 *  `docs/tich-hop-be.md`, deliberately not production: someone who never copied
 *  `.env.example` should hit their own machine and see a connection error, not
 *  quietly read and write the Fly.io database. Trailing slashes are trimmed
 *  because every `path` already opens with one, and `//sales/leads` is a 404
 *  that reads like a routing bug. */
export const API_BASE_URL = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4123'
).replace(/\/+$/, '')
